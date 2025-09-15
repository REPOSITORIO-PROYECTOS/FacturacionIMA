#!/usr/bin/env python3
"""
Script simple para crear usuarios localmente usando SQLite
"""

import sys
import os

# Agregar el directorio backend al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from backend.sqlite_auth import sqlite_auth

def main():
    print("=== Creador de Usuarios para FacturacionIMA ===")
    print("Sistema de autenticación SQLite local")
    print()
    
    # Mostrar usuarios existentes
    usuarios = sqlite_auth.listar_usuarios()
    print(f"Usuarios existentes: {len(usuarios)}")
    for u in usuarios:
        print(f"  - {u['nombre_usuario']} ({u['rol_nombre']}) - Activo: {u['activo']}")
    
    print("\n=== Crear Nuevo Usuario ===")
    
    # Solicitar datos
    username = input("Nombre de usuario: ").strip()
    if not username:
        print("Error: El nombre de usuario no puede estar vacío")
        return
    
    password = input("Contraseña: ").strip()
    if not password:
        print("Error: La contraseña no puede estar vacía")
        return
    
    print("\nRoles disponibles:")
    print("1. Admin - Administrador completo")
    print("2. Gerente - Gestión del negocio")
    print("3. Cajero - Operador básico")
    print("4. Soporte - Soporte técnico")
    
    rol_opcion = input("Seleccione rol (1-4) [3]: ").strip() or "3"
    
    roles_map = {
        "1": "Admin",
        "2": "Gerente", 
        "3": "Cajero",
        "4": "Soporte"
    }
    
    rol_nombre = roles_map.get(rol_opcion, "Cajero")
    
    print(f"\nCreando usuario: {username} con rol: {rol_nombre}")
    
    # Crear usuario
    resultado = sqlite_auth.crear_usuario(username, password, rol_nombre)
    
    if resultado:
        print("✅ Usuario creado exitosamente!")
        
        # Test de login
        print("\n=== Test de Login ===")
        test_usuario = sqlite_auth.autenticar_usuario(username, password)
        if test_usuario:
            print(f"✅ Login funciona correctamente para: {test_usuario['nombre_usuario']}")
            print(f"   Rol: {test_usuario['rol_nombre']}")
        else:
            print("❌ Error en el test de login")
            
    else:
        print("❌ Error al crear el usuario")
        print("   - Verifique que el nombre de usuario no exista")
        print("   - Verifique que el rol sea válido")

if __name__ == "__main__":
    main()