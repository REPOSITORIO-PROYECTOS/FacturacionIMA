#!/usr/bin/env python3
"""Crear en bloque usuarios en MySQL (rol por defecto 'Cajero'). Sustituye versión SQLite."""

import os
import sys
from typing import List, Tuple

# Asegurar import del paquete backend
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from sqlmodel import select
from backend.database import SessionLocal
from backend.modelos import Usuario, Rol, Empresa
from backend.security import get_password_hash


USUARIOS: List[Tuple[str, str, str]] = [
    ("maltesskalfam@gmail.com", "36diego467", "Cajero"),
    ("vendedor2skalfam@gmail.com", "Tello0309", "Cajero"),
    ("vendedor3skalfam@gmail.com", "Agus386cataldo", "Cajero"),
    ("vendedor1skalfam@gmail.com", "17Nacho8", "Cajero"),
    ("damianskalfam@gmail.com", "Damian831", "Cajero"),
]


def main() -> int:
    print("=== Creación en bloque de usuarios (MySQL) ===")
    created=0; existed=0; failed=0
    with SessionLocal() as db:
        empresa = db.exec(select(Empresa)).first()
        if not empresa:
            print("❌ No hay empresas en la base.")
            return 1
        for username, password, rol in USUARIOS:
            print(f"\n-> Creando usuario: {username} (rol: {rol})")
            if db.exec(select(Usuario).where(Usuario.nombre_usuario == username)).first():
                existed += 1
                print("   ℹ️ Ya existía, se omite")
                continue
            r = db.exec(select(Rol).where(Rol.nombre == rol)).first()
            if not r:
                r = Rol(nombre=rol); db.add(r); db.commit(); db.refresh(r)
            u = Usuario(nombre_usuario=username, password_hash=get_password_hash(password), id_rol=r.id, id_empresa=empresa.id)
            db.add(u)
            try:
                db.commit(); db.refresh(u); created +=1
                print("   ✅ Creado")
            except Exception as e:
                db.rollback(); failed+=1
                print(f"   ❌ Error: {e}")
    print("\n=== Resumen ===")
    print(f"   Creados:    {created}")
    print(f"   Existentes: {existed}")
    print(f"   Fallidos:   {failed}")
    return 0 if failed==0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
