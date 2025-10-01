"""Migrar usuarios y roles desde auth.db (SQLite) hacia tablas MySQL (roles, usuarios).

Uso:
  source ../.venv/bin/activate  (si aplica)
  python -m backend.scripts.migrate_sqlite_users_to_mysql --empresa-cuit 30718331680

Requisitos:
  - Variables de entorno MySQL configuradas.
  - Archivo auth.db existente en la raíz del proyecto (o pasar --sqlite-path).
  - Debe existir al menos una Empresa en MySQL. Si no se especifica --empresa-cuit se intentará tomar la primera.
"""
from __future__ import annotations

import argparse
import os
import sqlite3
from typing import Dict
from sqlmodel import Session, select

from backend.database import SessionLocal
from backend.modelos import Usuario, Rol, Empresa

DEFAULT_SQLITE = os.getenv("SQLITE_AUTH_PATH", "auth.db")


def load_sqlite_users(path: str):
    if not os.path.exists(path):
        raise FileNotFoundError(f"No se encuentra el archivo SQLite: {path}")
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT u.id, u.nombre_usuario, u.password_hash, u.activo, r.nombre AS rol_nombre
            FROM usuarios u
            JOIN roles r ON u.rol_id = r.id
            ORDER BY u.id
            """
        )
        return [dict(row) for row in cur.fetchall()]


def ensure_roles(db: Session, role_names: set[str]) -> Dict[str, Rol]:
    existing = {r.nombre: r for r in db.exec(select(Rol)).all()}
    created = {}
    for name in role_names:
        if name not in existing:
            r = Rol(nombre=name)
            db.add(r)
            db.commit()
            db.refresh(r)
            existing[name] = r
            created[name] = r
    return existing


def main():
    parser = argparse.ArgumentParser(description="Migrar usuarios desde SQLite a MySQL")
    parser.add_argument("--sqlite-path", default=DEFAULT_SQLITE, help="Ruta a auth.db (default: auth.db)")
    parser.add_argument("--empresa-cuit", help="CUIT de la empresa a asignar a los usuarios (recomendado)")
    parser.add_argument("--dry-run", action="store_true", help="No inserta cambios, solo muestra")
    args = parser.parse_args()

    users = load_sqlite_users(args.sqlite_path)
    print(f"Encontrados {len(users)} usuarios en SQLite")
    if not users:
        return

    with SessionLocal() as db:
        empresa = None
        if args.empresa_cuit:
            empresa = db.exec(select(Empresa).where(Empresa.cuit == args.empresa_cuit)).first()
            if not empresa:
                raise SystemExit(f"No existe Empresa con CUIT {args.empresa_cuit}")
        else:
            empresa = db.exec(select(Empresa)).first()
            if not empresa:
                raise SystemExit("No hay empresas en la base MySQL. Crea una antes de migrar usuarios.")
        print(f"Usando Empresa id={empresa.id} CUIT={empresa.cuit}")

        role_names = {u["rol_nombre"] for u in users}
        roles = ensure_roles(db, role_names)
        inserted = 0
        skipped = 0
        for u in users:
            exists = db.exec(select(Usuario).where(Usuario.nombre_usuario == u["nombre_usuario"])).first()
            if exists:
                skipped += 1
                continue
            if args.dry_run:
                print(f"[DRY-RUN] Insertaría usuario {u['nombre_usuario']} rol={u['rol_nombre']}")
                continue
            nuevo = Usuario(
                nombre_usuario=u["nombre_usuario"],
                password_hash=u["password_hash"],
                activo=bool(u["activo"]),
                id_rol=roles[u["rol_nombre"]].id,
                id_empresa=empresa.id,
            )
            db.add(nuevo)
            db.commit()
            inserted += 1
        print(f"Usuarios insertados: {inserted}, omitidos (ya existían): {skipped}")


if __name__ == "__main__":  # pragma: no cover
    main()
"""Migrar usuarios y roles desde SQLite (auth.db) hacia MySQL usando los modelos SQLModel.

REQUISITOS:
  - La nueva base ya debe tener tablas creadas (usa create_db_and_tables o el script de migración general).
  - Variables de entorno apuntando a la NUEVA base (por ejemplo usando USE_NEW_DB=1 + NEW_DB_* en .env).
  - Archivo auth.db existente (por defecto en la raíz del proyecto).

USO:
  source .venv/bin/activate
  python backend/scripts/migrate_sqlite_users_to_mysql.py --empresa "MI EMPRESA SA" --cuit 30718331680 --crear-si-no --asignar-existente

OPCIONES:
  --empresa NOMBRE         Nombre legal para asociar usuarios migrados. Si ya existe se reutiliza.
  --cuit CUIT              CUIT de la empresa (string)
  --crear-si-no            Crea la empresa si no existe.
  --asignar-existente      Si no se puede crear (y no existe) aborta; si existe, reutiliza.
  --auth-db PATH           Ruta al auth.db (default ./auth.db)

LOGICA:
  1. Leer roles y usuarios de SQLite.
  2. Asegurar que roles existan en MySQL (insert ignore).
  3. Asegurar empresa objetivo.
  4. Insertar usuarios (saltando los que ya existan por nombre_usuario).
"""
from __future__ import annotations
import argparse
import os
import sqlite3
from typing import List, Dict

from sqlmodel import Session, select
from backend.database import SessionLocal
from backend.modelos import Rol, Usuario, Empresa
from backend.security import get_password_hash


def leer_roles_sqlite(auth_db_path: str) -> List[Dict]:
    conn = sqlite3.connect(auth_db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, nombre FROM roles ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def leer_usuarios_sqlite(auth_db_path: str) -> List[Dict]:
    conn = sqlite3.connect(auth_db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.nombre_usuario, u.password_hash, u.activo, r.nombre as rol_nombre
        FROM usuarios u JOIN roles r ON u.rol_id = r.id
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def asegurar_empresa(session: Session, nombre_legal: str, cuit: str, crear: bool) -> Empresa:
    stmt = select(Empresa).where(Empresa.nombre_legal == nombre_legal)
    emp = session.exec(stmt).first()
    if emp:
        return emp
    if not crear:
        raise RuntimeError("Empresa no existe y no se autorizó creación (falta --crear-si-no)")
    emp = Empresa(nombre_legal=nombre_legal, cuit=cuit, activa=True)
    session.add(emp)
    session.commit()
    session.refresh(emp)
    return emp


def asegurar_roles(session: Session, roles: List[Dict]):
    existentes = {r.nombre for r in session.exec(select(Rol)).all()}
    nuevos = []
    for r in roles:
        if r['nombre'] not in existentes:
            nuevos.append(Rol(nombre=r['nombre']))
    if nuevos:
        session.add_all(nuevos)
        session.commit()


def mapear_nombre_a_id_rol(session: Session) -> Dict[str,int]:
    return {r.nombre: r.id for r in session.exec(select(Rol)).all()}


def migrar_usuarios(session: Session, usuarios: List[Dict], empresa_id: int):
    existentes = {u.nombre_usuario for u in session.exec(select(Usuario)).all()}
    roles_map = mapear_nombre_a_id_rol(session)
    creados = 0
    saltados = 0
    for u in usuarios:
        nombre = u['nombre_usuario']
        if nombre in existentes:
            saltados += 1
            continue
        rol_id = roles_map.get(u['rol_nombre'])
        if not rol_id:
            print(f"  [WARN] Rol {u['rol_nombre']} no existe en MySQL, saltando usuario {nombre}")
            saltados += 1
            continue
        nuevo = Usuario(
            nombre_usuario=nombre,
            password_hash=u['password_hash'],  # Reutilizamos hash existente
            activo=bool(u['activo']),
            id_rol=rol_id,
            id_empresa=empresa_id
        )
        session.add(nuevo)
        creados += 1
    if creados:
        session.commit()
    return creados, saltados


def main():
    parser = argparse.ArgumentParser(description="Migrar usuarios SQLite a MySQL")
    parser.add_argument('--empresa', required=True, help='Nombre legal de la empresa destino')
    parser.add_argument('--cuit', required=True, help='CUIT empresa')
    parser.add_argument('--crear-si-no', action='store_true', help='Crear empresa si no existe')
    parser.add_argument('--auth-db', default='auth.db', help='Ruta al auth.db origen')
    args = parser.parse_args()

    if not os.path.exists(args.auth_db):
        raise SystemExit(f"auth.db no encontrado en {args.auth_db}")

    roles = leer_roles_sqlite(args.auth_db)
    usuarios = leer_usuarios_sqlite(args.auth_db)
    print(f"Leídos {len(roles)} roles y {len(usuarios)} usuarios desde SQLite")

    with SessionLocal() as session:
        emp = asegurar_empresa(session, args.empresa, args.cuit, crear=args.crear_si_no)
        asegurar_roles(session, roles)
        creados, saltados = migrar_usuarios(session, usuarios, emp.id)
    print(f"Usuarios creados: {creados} | Usuarios ya existentes: {saltados}")
    print("Migración de usuarios completada.")

if __name__ == '__main__':
    main()
