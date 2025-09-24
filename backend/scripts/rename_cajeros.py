#!/usr/bin/env python3
"""
Renombra usuarios de email a nombre completo y ajusta contraseñas.
Requiere ejecutar en el entorno del backend (usa sqlite_auth directamente).
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.sqlite_auth import sqlite_auth, actualizar_usuario_sqlite  # type: ignore

USUARIOS = [
    ("maltesskalfam@gmail.com", "Diego Roman Lopez", "36diego467"),
    ("vendedor2skalfam@gmail.com", "Gaston Aldo Tello Acosta", "Tello0309"),
    ("vendedor3skalfam@gmail.com", "Agustin Francisco Cataldo", "Agus386cataldo"),
    ("vendedor1skalfam@gmail.com", "Juan Ignacio Nuñez Falcon", "17Nacho8"),
    ("damianskalfam@gmail.com", "Damian Andres Escalada Calivar", "Damian831"),
]

def main() -> int:
    print("=== Renombrar cajeros (email -> nombre) y actualizar contraseñas ===")
    total_ok = 0
    for email, nuevo_nombre, nueva_pass in USUARIOS:
        print(f"-> {email} -> {nuevo_nombre}")
        ok = actualizar_usuario_sqlite(email, {
            "nuevo_nombre_usuario": nuevo_nombre,
            "password": nueva_pass,
            "rol_nombre": "Cajero",
            "activo": True,
        })
        if ok:
            total_ok += 1
            print("   ✅ Actualizado")
        else:
            existe = sqlite_auth.obtener_usuario_por_username(email)
            ya_renombrado = sqlite_auth.obtener_usuario_por_username(nuevo_nombre)
            if ya_renombrado:
                print("   ℹ️ Ya estaba con el nuevo nombre")
            elif not existe:
                print("   ⚠️ No existe el usuario de origen")
            else:
                print("   ❌ No se pudo actualizar (posible conflicto de nombre)")
    print(f"Hecho. Actualizados: {total_ok}/{len(USUARIOS)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
