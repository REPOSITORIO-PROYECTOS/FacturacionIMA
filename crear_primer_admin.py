#!/usr/bin/env python3
"""
Script para crear el primer usuario admin después del deploy
Ejecutar en el servidor de producción: python crear_primer_admin.py
"""

import sys
import os
from pathlib import Path

# Asegurar que estamos en el directorio correcto
current_dir = Path(__file__).parent
backend_dir = current_dir / "backend"

if backend_dir.exists():
    sys.path.insert(0, str(backend_dir))

try:
    from backend.sqlite_auth import sqlite_auth
    print("✅ Módulo SQLite importado correctamente")
except ImportError as e:
    print(f"❌ Error importando sqlite_auth: {e}")
    print("Asegúrese de estar ejecutando desde el directorio raíz del proyecto")
    sys.exit(1)

def main():
    print("=" * 50)
    print("🚀 CREADOR DE PRIMER USUARIO ADMIN")
    print("   Sistema FacturacionIMA")
    print("=" * 50)
    
    # Verificar usuarios existentes
    try:
        usuarios = sqlite_auth.listar_usuarios()
        print(f"\n📊 Usuarios existentes en SQLite: {len(usuarios)}")
        
        for u in usuarios:
            print(f"   - {u['nombre_usuario']} ({u['rol_nombre']}) - Activo: {'Sí' if u['activo'] else 'No'}")
        
        # Si ya hay más de 1 usuario (admin default + otro), no crear más
        if len(usuarios) > 1:
            print("\n⚠️  Ya existen usuarios en el sistema.")
            print("   Use las credenciales existentes o contacte al administrador.")
            return
            
    except Exception as e:
        print(f"❌ Error verificando usuarios: {e}")
        return
    
    print("\n" + "=" * 50)
    print("📝 CREAR NUEVO USUARIO ADMINISTRADOR")
    print("=" * 50)
    
    # Solicitar datos del nuevo admin
    username = input("\n👤 Nombre de usuario: ").strip()
    if not username:
        print("❌ El nombre de usuario no puede estar vacío")
        return
    
    password = input("🔐 Contraseña: ").strip()
    if not password:
        print("❌ La contraseña no puede estar vacía")
        return
    
    print(f"\n🔧 Creando usuario '{username}' con rol 'Admin'...")
    
    # Crear el usuario
    try:
        resultado = sqlite_auth.crear_usuario(username, password, "Admin")
        
        if resultado:
            print("✅ ¡Usuario creado exitosamente!")
            
            # Test de login inmediato
            print("\n🧪 Probando login...")
            test_login = sqlite_auth.autenticar_usuario(username, password)
            
            if test_login:
                print("✅ Login verificado correctamente")
                print(f"   Usuario: {test_login['nombre_usuario']}")
                print(f"   Rol: {test_login['rol_nombre']}")
                print(f"   ID: {test_login['id']}")
                
                print("\n" + "=" * 50)
                print("🎉 CONFIGURACIÓN COMPLETADA")
                print("=" * 50)
                print(f"Puede iniciar sesión con:")
                print(f"   Usuario: {username}")
                print(f"   Contraseña: {password}")
                print(f"   URL: https://facturador-ima.sistemataup.online/login")
                
            else:
                print("❌ Error en la verificación del login")
                
        else:
            print("❌ No se pudo crear el usuario")
            print("   Posibles causas:")
            print("   - El nombre de usuario ya existe")
            print("   - Error en la base de datos SQLite")
            
    except Exception as e:
        print(f"❌ Error creando usuario: {e}")

if __name__ == "__main__":
    main()