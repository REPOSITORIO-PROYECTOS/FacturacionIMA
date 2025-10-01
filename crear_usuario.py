#!/usr/bin/env python3
"""Script CLI para crear usuarios en MySQL (unificado, reemplaza versión SQLite).

Uso:
    python crear_usuario.py --username pepe --password secreta --rol Cajero --empresa-cuit 30718331680
Si no se pasa empresa se usa la primera existente.
"""

import sys, os, argparse
from sqlmodel import select

ROOT = os.path.dirname(__file__)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.database import SessionLocal
from backend.modelos import Usuario, Rol, Empresa
from backend.security import get_password_hash

def create_user(username: str, password: str, rol: str, empresa_cuit: str | None):
    with SessionLocal() as db:
        if db.exec(select(Usuario).where(Usuario.nombre_usuario == username)).first():
            print("⚠️  Usuario ya existe")
            return 1
        # empresa
        empresa = None
        if empresa_cuit:
            empresa = db.exec(select(Empresa).where(Empresa.cuit == empresa_cuit)).first()
            if not empresa:
                print(f"❌ Empresa con CUIT {empresa_cuit} no encontrada")
                return 2
        else:
            empresa = db.exec(select(Empresa)).first()
            if not empresa:
                print("❌ No hay empresas en la base. Cree una primero.")
                return 3
        role = db.exec(select(Rol).where(Rol.nombre == rol)).first()
        if not role:
            role = Rol(nombre=rol)
            db.add(role); db.commit(); db.refresh(role)
        user = Usuario(nombre_usuario=username, password_hash=get_password_hash(password), id_rol=role.id, id_empresa=empresa.id)
        db.add(user); db.commit(); db.refresh(user)
        print(f"✅ Usuario creado: id={user.id} username={user.nombre_usuario} rol={role.nombre} empresa={empresa.cuit}")
    return 0

def main():
    parser = argparse.ArgumentParser(description="Crear usuario en MySQL")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--rol", default="Cajero")
    parser.add_argument("--empresa-cuit", dest="empresa_cuit")
    args = parser.parse_args()
    return create_user(args.username.strip(), args.password, args.rol.strip(), args.empresa_cuit)

if __name__ == "__main__":
    raise SystemExit(main())