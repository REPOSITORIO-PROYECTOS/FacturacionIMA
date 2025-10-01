#!/usr/bin/env python3
"""CLI de autenticación ahora contra MySQL.

Uso:
  python backend/scripts/auth_cli.py --check admin Secreta
  python backend/scripts/auth_cli.py --set-pass admin Nueva123
"""
import argparse, sys
from sqlmodel import select
from backend.database import SessionLocal
from backend.modelos import Usuario, Rol
from backend.security import crear_access_token, verificar_password, get_password_hash

def check_credentials(username: str, password: str) -> int:
    with SessionLocal() as db:
        user = db.exec(select(Usuario).where(Usuario.nombre_usuario == username)).first()
        if not user or not verificar_password(password, user.password_hash):
            print("❌ Credenciales inválidas")
            return 1
        token = crear_access_token({"sub": user.nombre_usuario})
        print("✅ Login OK. Token (truncado):", token[:80] + "...")
        return 0

def set_password(username: str, new_password: str) -> int:
    with SessionLocal() as db:
        user = db.exec(select(Usuario).where(Usuario.nombre_usuario == username)).first()
        if not user:
            print("❌ Usuario no encontrado")
            return 2
        user.password_hash = get_password_hash(new_password)
        db.add(user); db.commit()
        print("✅ Contraseña actualizada")
        return 0

if __name__ == '__main__':
    p = argparse.ArgumentParser(description='CLI Auth MySQL')
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', nargs=2, metavar=('USERNAME','PASSWORD'))
    g.add_argument('--set-pass', nargs=2, metavar=('USERNAME','NEWPASS'))
    a = p.parse_args()
    if a.check:
        sys.exit(check_credentials(a.check[0], a.check[1]))
    if a.set_pass:
        sys.exit(set_password(a.set_pass[0], a.set_pass[1]))
