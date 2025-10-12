#!/usr/bin/env python3
"""Verifica si un usuario y contraseña son válidos en la base de datos."""

import os
import sys
import argparse

# Asegurar import del paquete backend
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from sqlmodel import select
from backend.database import SessionLocal
from backend.modelos import Usuario
from backend.security import verificar_password

def verify_credentials(username, password):
    """Verifica las credenciales de un usuario."""
    print(f"--- Verificando credenciales para el usuario: {username} ---")
    with SessionLocal() as db:
        # Buscar usuario en la base de datos
        usuario = db.exec(select(Usuario).where(Usuario.nombre_usuario == username)).first()

        if not usuario:
            print(f"❌ Usuario '{username}' no encontrado.")
            return False

        print(f"✅ Usuario '{username}' encontrado (ID: {usuario.id}, Activo: {usuario.activo}).")

        # Verificar si el usuario está activo
        if not usuario.activo:
            print("❌ El usuario no está activo.")
            return False

        # Verificar la contraseña
        if verificar_password(password, usuario.password_hash):
            print("✅ La contraseña es correcta.")
            # Opcional: Mostrar el rol del usuario
            if usuario.rol:
                 print(f"   -> Rol: {usuario.rol.nombre}")
            else:
                 print("   -> Advertencia: El usuario no tiene un rol asignado.")
            return True
        else:
            print("❌ La contraseña es incorrecta.")
            return False

def main():
    parser = argparse.ArgumentParser(description="Verificar credenciales de usuario.")
    parser.add_argument("username", type=str, help="Nombre de usuario a verificar.")
    parser.add_argument("password", type=str, help="Contraseña a verificar.")
    args = parser.parse_args()

    if verify_credentials(args.username, args.password):
        print("\n--- Verificación exitosa. ---")
        return 0
    else:
        print("\n--- Verificación fallida. ---")
        return 1

if __name__ == "__main__":
    sys.exit(main())
