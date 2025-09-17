#!/usr/bin/env python3
"""
Herramienta de línea de comandos para verificar y actualizar credenciales en la DB SQLite local (auth.db).
Uso:
  python3 backend/scripts/auth_cli.py --check admin admin123
  python3 backend/scripts/auth_cli.py --set-pass admin nueva_clave

Esta herramienta usa las funciones de sqlite_auth ya existentes para mantener la misma lógica de hashing y tokens.
"""
import argparse
import sys
from backend.sqlite_auth import sqlite_auth, crear_access_token, autenticar_usuario_sqlite
import sqlite3

DB_PATH = 'auth.db'

def check_credentials(username: str, password: str):
    print(f"Comprobando credenciales para usuario: {username}")
    result = autenticar_usuario_sqlite(username, password)
    if result:
        print("✅ Credenciales válidas. Usuario:")
        print(result)
        token = crear_access_token({"sub": result['nombre_usuario']})
        print(f"Token de prueba (sub): {token[:80]}...")
        return 0
    else:
        print("❌ Credenciales inválidas")
        return 1


def set_password(username: str, new_password: str):
    print(f"Actualizando contraseña para usuario: {username}")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM usuarios WHERE nombre_usuario = ?", (username,))
        row = cursor.fetchone()
        if not row:
            print("❌ Usuario no encontrado")
            return 2
        password_hash = sqlite_auth.get_password_hash(new_password)
        cursor.execute("UPDATE usuarios SET password_hash = ? WHERE nombre_usuario = ?", (password_hash, username))
        conn.commit()
        print("✅ Contraseña actualizada correctamente")
        return 0
    except Exception as e:
        print(f"ERROR actualizando contraseña: {e}")
        return 3


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='CLI de autenticación para auth.db')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check', nargs=2, metavar=('USERNAME','PASSWORD'), help='Verificar credenciales')
    group.add_argument('--set-pass', nargs=2, metavar=('USERNAME','NEWPASS'), help='Actualizar contraseña')

    args = parser.parse_args()

    if args.check:
        sys.exit(check_credentials(args.check[0], args.check[1]))
    if args.set_pass:
        sys.exit(set_password(args.set_pass[0], args.set_pass[1]))
