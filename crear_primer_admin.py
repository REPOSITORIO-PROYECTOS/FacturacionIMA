#!/usr/bin/env python3
"""Crear primer usuario admin directamente en MySQL (sustituye versión SQLite).

Uso:
    python crear_primer_admin.py --username admin --password Secreta123 --empresa-cuit 30718331680
"""

import sys
import os
from pathlib import Path

# Asegurar que estamos en el directorio correcto
current_dir = Path(__file__).parent
backend_dir = current_dir / "backend"

if backend_dir.exists():
    sys.path.insert(0, str(backend_dir))

from sqlmodel import select
from backend.database import SessionLocal
from backend.modelos import Usuario, Rol, Empresa
from backend.security import get_password_hash

import argparse

def main():
    parser = argparse.ArgumentParser(description="Crear primer admin en MySQL")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--empresa-cuit", dest="empresa_cuit")
    args = parser.parse_args()

    with SessionLocal() as db:
        if db.exec(select(Usuario).where(Usuario.nombre_usuario == args.username)).first():
            print("⚠️  Usuario ya existe, no se crea otro.")
            return 0
        empresa = None
        if args.empresa_cuit:
            empresa = db.exec(select(Empresa).where(Empresa.cuit == args.empresa_cuit)).first()
            if not empresa:
                print("❌ Empresa no encontrada")
                return 2
        else:
            empresa = db.exec(select(Empresa)).first()
            if not empresa:
                print("❌ No hay empresas en la base, crea una primero")
                return 3
        rol = db.exec(select(Rol).where(Rol.nombre == "Admin")).first()
        if not rol:
            rol = Rol(nombre="Admin")
            db.add(rol); db.commit(); db.refresh(rol)
        user = Usuario(nombre_usuario=args.username, password_hash=get_password_hash(args.password), id_rol=rol.id, id_empresa=empresa.id)
        db.add(user); db.commit(); db.refresh(user)
        print(f"✅ Admin creado: {user.nombre_usuario} (id={user.id}) rol=Admin empresa={empresa.cuit}")
    return 0

if __name__ == "__main__":
    main()