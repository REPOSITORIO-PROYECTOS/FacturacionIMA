"""Migrar usuarios y roles desde auth.db (SQLite) hacia las tablas MySQL del dominio.

USO:
  source .venv/bin/activate
  python backend/scripts/migrate_sqlite_auth_into_mysql.py --empresa "MI EMPRESA SA" --cuit 30718331680 --crear-si-no

OPCIONES:
  --empresa NOMBRE    Nombre legal de la empresa a la que asignar los usuarios migrados
  --cuit CUIT         CUIT de la empresa
  --crear-si-no       Crea la empresa si no existe
  --auth-db RUTA      Ruta alternativa a auth.db (default ./auth.db)
  --solo-roles        Sólo migrar roles
  --solo-usuarios     Sólo migrar usuarios (asume roles ya migrados)

NOTAS:
  - Reutiliza los password_hash existentes (no se muestran contraseñas).
  - No elimina nada en SQLite.
  - No pisa usuarios existentes (si nombre_usuario ya existe, se salta).
"""
from __future__ import annotations
import argparse, os, sqlite3, sys
from sqlmodel import select
from backend.database import SessionLocal
from backend.modelos import Rol, Usuario, Empresa

DEFAULT_AUTH_DB = 'auth.db'


def leer_roles(path: str):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, nombre FROM roles ORDER BY id")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def leer_usuarios(path: str):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.nombre_usuario, u.password_hash, u.activo, r.nombre as rol_nombre
        FROM usuarios u JOIN roles r ON u.rol_id = r.id
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def asegurar_empresa(session, nombre_legal: str, cuit: str, crear: bool):
    emp = session.exec(select(Empresa).where(Empresa.nombre_legal==nombre_legal)).first()
    if emp:
        return emp
    if not crear:
        raise SystemExit("Empresa no existe y falta --crear-si-no")
    emp = Empresa(nombre_legal=nombre_legal, cuit=cuit, activa=True)
    session.add(emp)
    session.commit(); session.refresh(emp)
    return emp


def migrar_roles(session, roles):
    existentes = {r.nombre for r in session.exec(select(Rol)).all()}
    nuevos = []
    for r in roles:
        if r['nombre'] not in existentes:
            nuevos.append(Rol(nombre=r['nombre']))
    if nuevos:
        session.add_all(nuevos); session.commit()
    return len(nuevos)


def migrar_usuarios(session, usuarios, empresa_id: int):
    existentes = {u.nombre_usuario for u in session.exec(select(Usuario)).all()}
    nombre_a_rolid = {r.nombre: r.id for r in session.exec(select(Rol)).all()}
    creados = 0; saltados = 0
    for u in usuarios:
        if u['nombre_usuario'] in existentes:
            saltados += 1; continue
        rol_id = nombre_a_rolid.get(u['rol_nombre'])
        if not rol_id:
            saltados += 1; continue
        nuevo = Usuario(
            nombre_usuario=u['nombre_usuario'],
            password_hash=u['password_hash'],
            activo=bool(u['activo']),
            id_rol=rol_id,
            id_empresa=empresa_id
        )
        session.add(nuevo); creados += 1
    if creados:
        session.commit()
    return creados, saltados


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--empresa', required=True)
    ap.add_argument('--cuit', required=True)
    ap.add_argument('--crear-si-no', action='store_true')
    ap.add_argument('--auth-db', default=DEFAULT_AUTH_DB)
    ap.add_argument('--solo-roles', action='store_true')
    ap.add_argument('--solo-usuarios', action='store_true')
    args = ap.parse_args()

    if not os.path.exists(args.auth_db):
        raise SystemExit(f"No se encuentra auth.db en {args.auth_db}")

    roles = leer_roles(args.auth_db)
    usuarios = leer_usuarios(args.auth_db)

    with SessionLocal() as s:
        emp = asegurar_empresa(s, args.empresa, args.cuit, crear=args.crear_si_no)
        creados_roles = migrar_roles(s, roles) if not args.solo_usuarios else 0
        creados_users, saltados_users = (0,0)
        if not args.solo_roles:
            creados_users, saltados_users = migrar_usuarios(s, usuarios, emp.id)

    print(f"Empresa destino: {emp.nombre_legal} (ID {emp.id})")
    print(f"Roles nuevos creados: {creados_roles}")
    if not args.solo_roles:
        print(f"Usuarios creados: {creados_users} | Saltados: {saltados_users}")
    print("Migración completada.")

if __name__ == '__main__':
    main()
