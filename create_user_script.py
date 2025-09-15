#!/usr/bin/env python3
"""
Script para crear usuarios remotos en la base de datos.
Genera SQL que puede ejecutarse directamente en la DB.
"""

import os
import sys
from passlib.context import CryptContext
from datetime import datetime

# Configurar el contexto de contraseñas igual que en el backend
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def generar_hash_password(password: str) -> str:
    """Genera el hash de la contraseña usando bcrypt"""
    return pwd_context.hash(password)

def generar_sql_usuario(username: str, password: str, rol_nombre: str = "Admin", empresa_id: int = 1):
    """
    Genera el SQL para crear un usuario nuevo
    """
    password_hash = generar_hash_password(password)
    fecha_actual = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    
    sql_commands = f"""
-- Crear usuario: {username}
-- Fecha de creación: {fecha_actual}

-- 1. Insertar rol si no existe
INSERT IGNORE INTO roles (nombre) VALUES ('{rol_nombre}');

-- 2. Obtener ID del rol
SET @rol_id = (SELECT id FROM roles WHERE nombre = '{rol_nombre}' LIMIT 1);

-- 3. Insertar empresa si no existe (empresa por defecto)
INSERT IGNORE INTO empresas (nombre, cuit, direccion, activa, creado_en) 
VALUES ('Empresa IMA', '20-12345678-9', 'Dirección por defecto', 1, NOW());

-- 4. Obtener ID de empresa
SET @empresa_id = (SELECT id FROM empresas WHERE nombre = 'Empresa IMA' LIMIT 1);

-- 5. Insertar usuario
INSERT INTO usuarios (nombre_usuario, password_hash, activo, creado_en, id_rol, id_empresa)
VALUES ('{username}', '{password_hash}', 1, '{fecha_actual}', @rol_id, @empresa_id);

-- Verificar que se creó correctamente
SELECT u.id, u.nombre_usuario, u.activo, r.nombre as rol, e.nombre as empresa
FROM usuarios u 
JOIN roles r ON u.id_rol = r.id 
JOIN empresas e ON u.id_empresa = e.id 
WHERE u.nombre_usuario = '{username}';
"""
    
    return sql_commands

def main():
    print("=== Generador de Usuarios para FacturacionIMA ===")
    print()
    
    # Solicitar datos del usuario
    username = input("Ingrese nombre de usuario: ").strip()
    if not username:
        print("Error: El nombre de usuario no puede estar vacío")
        return
    
    password = input("Ingrese contraseña: ").strip()
    if not password:
        print("Error: La contraseña no puede estar vacía")
        return
    
    rol = input("Ingrese rol (Admin/Cajero/Gerente) [Admin]: ").strip() or "Admin"
    
    print("\n=== SQL GENERADO ===")
    print("Copie y ejecute el siguiente SQL en su base de datos MySQL:")
    print("="*60)
    
    sql = generar_sql_usuario(username, password, rol)
    print(sql)
    
    print("="*60)
    print("\nNOTA: Guarde el SQL en un archivo .sql si desea ejecutarlo más tarde.")
    
    # Opcionalmente guardar en archivo
    guardar = input("\n¿Desea guardar el SQL en un archivo? (s/n): ").strip().lower()
    if guardar in ['s', 'si', 'y', 'yes']:
        filename = f"create_user_{username}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(sql)
        print(f"SQL guardado en: {filename}")

if __name__ == "__main__":
    main()