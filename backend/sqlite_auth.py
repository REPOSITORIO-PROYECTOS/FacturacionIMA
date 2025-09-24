"""
Sistema de autenticación con SQLite local
Independiente de la base de datos principal MySQL
"""

import os
import sqlite3
from datetime import datetime, timedelta
from typing import Optional
from pathlib import Path

from passlib.context import CryptContext
from jose import JWTError, jwt

# Configuración
SECRET_KEY = "tu-clave-secreta-muy-segura-cambiar-en-produccion"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 210

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class SQLiteAuthManager:
    def __init__(self, db_path: str = "auth.db"):
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Inicializar la base de datos SQLite con las tablas necesarias"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Tabla de roles
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS roles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre TEXT UNIQUE NOT NULL,
                    descripcion TEXT,
                    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Tabla de usuarios
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS usuarios (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nombre_usuario TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    activo BOOLEAN DEFAULT 1,
                    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ultimo_acceso TIMESTAMP,
                    rol_id INTEGER,
                    FOREIGN KEY (rol_id) REFERENCES roles (id)
                )
            """)
            
            # Insertar roles por defecto si no existen
            roles_default = [
                ("Admin", "Administrador del sistema"),
                ("Cajero", "Operador de caja"),
                ("Gerente", "Gerente del negocio"),
                ("Soporte", "Soporte técnico")
            ]
            
            cursor.executemany("""
                INSERT OR IGNORE INTO roles (nombre, descripcion)
                VALUES (?, ?)
            """, roles_default)
            
            # Crear usuario admin por defecto si no existe
            cursor.execute("SELECT COUNT(*) FROM usuarios WHERE nombre_usuario = 'admin'")
            if cursor.fetchone()[0] == 0:
                admin_password_hash = pwd_context.hash("admin123")
                cursor.execute("""
                    INSERT INTO usuarios (nombre_usuario, password_hash, activo, rol_id)
                    VALUES ('admin', ?, 1, (SELECT id FROM roles WHERE nombre = 'Admin'))
                """, (admin_password_hash,))
            
            conn.commit()
            print("✅ Base de datos SQLite inicializada correctamente")
    
    def verificar_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verificar contraseña"""
        return pwd_context.verify(plain_password, hashed_password)
    
    def get_password_hash(self, password: str) -> str:
        """Generar hash de contraseña"""
        return pwd_context.hash(password)
    
    def autenticar_usuario(self, username: str, password: str) -> Optional[dict]:
        """Autenticar usuario contra SQLite"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row  # Para acceder por nombre de columna
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT u.id, u.nombre_usuario, u.password_hash, u.activo, 
                       r.nombre as rol_nombre, r.id as rol_id
                FROM usuarios u
                JOIN roles r ON u.rol_id = r.id
                WHERE u.nombre_usuario = ? AND u.activo = 1
            """, (username,))
            
            usuario = cursor.fetchone()
            
            if not usuario:
                return None
            
            if not self.verificar_password(password, usuario['password_hash']):
                return None
            
            # Actualizar último acceso
            cursor.execute("""
                UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (usuario['id'],))
            conn.commit()
            
            return {
                'id': usuario['id'],
                'nombre_usuario': usuario['nombre_usuario'],
                'rol_nombre': usuario['rol_nombre'],
                'rol_id': usuario['rol_id'],
                'activo': bool(usuario['activo'])
            }
    
    def obtener_usuario_por_username(self, username: str) -> Optional[dict]:
        """Obtener usuario por nombre de usuario"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT u.id, u.nombre_usuario, u.activo, 
                       r.nombre as rol_nombre, r.id as rol_id
                FROM usuarios u
                JOIN roles r ON u.rol_id = r.id
                WHERE u.nombre_usuario = ? AND u.activo = 1
            """, (username,))
            
            usuario = cursor.fetchone()
            
            if not usuario:
                return None
            
            return {
                'id': usuario['id'],
                'nombre_usuario': usuario['nombre_usuario'],
                'rol_nombre': usuario['rol_nombre'],
                'rol_id': usuario['rol_id'],
                'activo': bool(usuario['activo'])
            }
    
    def crear_usuario(self, username: str, password: str, rol_nombre: str = "Cajero") -> bool:
        """Crear nuevo usuario"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                
                # Verificar que el usuario no existe
                cursor.execute("SELECT COUNT(*) FROM usuarios WHERE nombre_usuario = ?", (username,))
                if cursor.fetchone()[0] > 0:
                    return False
                
                # Obtener ID del rol
                cursor.execute("SELECT id FROM roles WHERE nombre = ?", (rol_nombre,))
                rol_result = cursor.fetchone()
                if not rol_result:
                    return False
                
                rol_id = rol_result[0]
                password_hash = self.get_password_hash(password)
                
                cursor.execute("""
                    INSERT INTO usuarios (nombre_usuario, password_hash, activo, rol_id)
                    VALUES (?, ?, 1, ?)
                """, (username, password_hash, rol_id))
                
                conn.commit()
                return True
                
        except Exception as e:
            print(f"Error creando usuario: {e}")
            return False
    
    def listar_usuarios(self) -> list:
        """Listar todos los usuarios"""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT u.id, u.nombre_usuario, u.activo, u.creado_en, u.ultimo_acceso,
                       r.nombre as rol_nombre
                FROM usuarios u
                JOIN roles r ON u.rol_id = r.id
                ORDER BY u.creado_en DESC
            """)
            
            return [dict(row) for row in cursor.fetchall()]

# Funciones de JWT
def crear_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crear token JWT"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verificar_token(token: str) -> Optional[dict]:
    """Verificar y decodificar token JWT"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        return {"username": username}
    except JWTError:
        return None

# Instancia global del manager
sqlite_auth = SQLiteAuthManager()

# Funciones de conveniencia
def autenticar_usuario_sqlite(username: str, password: str) -> Optional[dict]:
    """Función conveniente para autenticación"""
    return sqlite_auth.autenticar_usuario(username, password)

def obtener_usuario_por_token(token: str) -> Optional[dict]:
    """Obtener usuario desde token"""
    token_data = verificar_token(token)
    if not token_data:
        return None
    
    return sqlite_auth.obtener_usuario_por_username(token_data["username"])

def obtener_usuarios_sqlite() -> list:
    """Obtener lista de usuarios"""
    return sqlite_auth.listar_usuarios()

def actualizar_usuario_sqlite(username: str, datos: dict) -> bool:
    """Actualizar datos de usuario (rol, activo, etc)"""
    try:
        with sqlite3.connect(sqlite_auth.db_path) as conn:
            cursor = conn.cursor()
            campos = []
            valores = []
            if "rol_nombre" in datos:
                cursor.execute("SELECT id FROM roles WHERE nombre = ?", (datos["rol_nombre"],))
                rol = cursor.fetchone()
                if rol:
                    campos.append("rol_id = ?")
                    valores.append(rol[0])
            if "activo" in datos:
                campos.append("activo = ?")
                valores.append(int(bool(datos["activo"])))
            if not campos:
                return False
            valores.append(username)
            cursor.execute(f"UPDATE usuarios SET {', '.join(campos)} WHERE nombre_usuario = ?", valores)
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        print(f"Error actualizando usuario: {e}")
        return False

def desactivar_usuario_sqlite(username: str) -> bool:
    """Desactivar usuario"""
    try:
        with sqlite3.connect(sqlite_auth.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE usuarios SET activo = 0 WHERE nombre_usuario = ?", (username,))
            conn.commit()
            return cursor.rowcount > 0
    except Exception as e:
        print(f"Error desactivando usuario: {e}")
        return False

if __name__ == "__main__":
    # Test del sistema
    print("=== Test del sistema de autenticación SQLite ===")
    
    # Listar usuarios existentes
    usuarios = sqlite_auth.listar_usuarios()
    print(f"Usuarios existentes: {len(usuarios)}")
    for u in usuarios:
        print(f"  - {u['nombre_usuario']} ({u['rol_nombre']}) - Activo: {u['activo']}")
    
    # Test de autenticación
    print("\n=== Test de autenticación ===")
    resultado = sqlite_auth.autenticar_usuario("admin", "admin123")
    if resultado:
        print(f"✅ Login exitoso: {resultado['nombre_usuario']} - Rol: {resultado['rol_nombre']}")
        
        # Crear token
        token = crear_access_token({"sub": resultado['nombre_usuario']})
        print(f"Token generado: {token[:50]}...")
        
        # Verificar token
        usuario_desde_token = obtener_usuario_por_token(token)
        if usuario_desde_token:
            print(f"✅ Token válido para: {usuario_desde_token['nombre_usuario']}")
        else:
            print("❌ Token inválido")
    else:
        print("❌ Login fallido")