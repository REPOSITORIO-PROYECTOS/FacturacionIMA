#!/usr/bin/env python3
"""Crea un nuevo usuario administrador en la base de datos."""

import os
import sys
import argparse

# Asegurar import del paquete backend
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from sqlmodel import select
from backend.database import SessionLocal
from backend.modelos import Usuario, Rol, Empresa
from backend.security import get_password_hash

def create_admin_user(username, password):
    """Crea un usuario con el rol de Administrador."""
    print(f"--- Creando usuario administrador: {username} ---")
    with SessionLocal() as db:
        # 1. Verificar si el usuario ya existe
        existing_user = db.exec(select(Usuario).where(Usuario.nombre_usuario == username)).first()
        if existing_user:
            print(f"❌ El usuario '{username}' ya existe (ID: {existing_user.id}). No se realizarán cambios.")
            return False

        # 2. Buscar o crear el rol 'Admin'
        admin_role = db.exec(select(Rol).where(Rol.nombre == "Admin")).first()
        if not admin_role:
            print("ℹ️ El rol 'Admin' no existe. Creándolo...")
            admin_role = Rol(nombre="Admin")
            db.add(admin_role)
            db.commit()
            db.refresh(admin_role)
            print(f"✅ Rol 'Admin' creado con ID: {admin_role.id}")
        else:
            print(f"✅ Rol 'Admin' encontrado (ID: {admin_role.id}).")

        # 3. Buscar o crear la empresa administradora
        admin_company_name = "Empresa Administradora"
        admin_company = db.exec(select(Empresa).where(Empresa.nombre_legal == admin_company_name)).first()
        if not admin_company:
            print(f"🏢 La empresa '{admin_company_name}' no existe. Creándola...")
            admin_company = Empresa(
                nombre_legal=admin_company_name,
                cuit="00-00000000-0",  # CUIT genérico para la empresa interna
                activa=False  # No es una empresa cliente activa
            )
            db.add(admin_company)
            db.commit()
            db.refresh(admin_company)
            print(f"✅ Empresa '{admin_company_name}' creada con ID: {admin_company.id}")
        else:
            print(f"🏢 Empresa administradora encontrada: '{admin_company.nombre_legal}' (ID: {admin_company.id})")

        # 4. Crear el nuevo usuario
        hashed_password = get_password_hash(password)
        new_user = Usuario(
            nombre_usuario=username,
            password_hash=hashed_password,
            id_rol=admin_role.id,
            id_empresa=admin_company.id,
            activo=True
        )
        db.add(new_user)
        try:
            db.commit()
            db.refresh(new_user)
            print(f"✅ ¡Usuario '{username}' creado exitosamente con el rol de Administrador!")
            return True
        except Exception as e:
            db.rollback()
            print(f"❌ Error al guardar el usuario en la base de datos: {e}")
            return False

def main():
    parser = argparse.ArgumentParser(description="Crear un nuevo usuario administrador.")
    parser.add_argument("username", type=str, help="Nombre de usuario para el nuevo administrador.")
    parser.add_argument("password", type=str, help="Contraseña para el nuevo administrador.")
    args = parser.parse_args()

    if create_admin_user(args.username, args.password):
        print("\n--- Proceso finalizado exitosamente. ---")
        return 0
    else:
        print("\n--- El proceso falló. Revisa los mensajes de error. ---")
        return 1

if __name__ == "__main__":
    sys.exit(main())
