#!/usr/bin/env python3
"""
Crear en bloque usuarios en SQLite (auth.db) con rol 'Cajero'.
Usa el mismo gestor que el backend (sqlite_auth) para mantener consistencia.
"""

import os
import sys
from typing import List, Tuple

# Asegurar import del paquete backend
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.sqlite_auth import sqlite_auth  # type: ignore


USUARIOS: List[Tuple[str, str, str]] = [
    ("maltesskalfam@gmail.com", "36diego467", "Cajero"),
    ("vendedor2skalfam@gmail.com", "Tello0309", "Cajero"),
    ("vendedor3skalfam@gmail.com", "Agus386cataldo", "Cajero"),
    ("vendedor1skalfam@gmail.com", "17Nacho8", "Cajero"),
    ("damianskalfam@gmail.com", "Damian831", "Cajero"),
]


def main() -> int:
    print("=== Creación en bloque de usuarios (SQLite auth.db) ===")
    ok = 0
    already = 0
    fail = 0
    for username, password, rol in USUARIOS:
        print(f"\n-> Creando usuario: {username} (rol: {rol})")
        res = sqlite_auth.crear_usuario(username, password, rol)
        if res:
            ok += 1
            prueba = sqlite_auth.autenticar_usuario(username, password)
            if prueba:
                print(f"   ✅ Creado y login verificado (rol: {prueba['rol_nombre']})")
            else:
                print("   ⚠️ Creado pero fallo en verificación de login")
        else:
            # Distinguir si ya existe
            existente = sqlite_auth.obtener_usuario_por_username(username)
            if existente:
                already += 1
                print("   ℹ️ Ya existía, se omite")
            else:
                fail += 1
                print("   ❌ Error al crear (rol inválido u otro problema)")

    print("\n=== Resumen ===")
    print(f"   Creados:    {ok}")
    print(f"   Existentes: {already}")
    print(f"   Fallidos:   {fail}")
    print("\nUsuarios actuales:")
    for u in sqlite_auth.listar_usuarios():
        print(f"  - {u['nombre_usuario']} ({u['rol_nombre']}) - Activo: {u['activo']}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
