"""
Sistema de seguridad para FastAPI usando SQLite
Compatible con el sistema de autenticación local
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from backend.sqlite_auth import obtener_usuario_por_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Credenciales inválidas o token expirado",
    headers={"WWW-Authenticate": "Bearer"},
)

def obtener_usuario_actual_sqlite(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependencia para obtener el usuario actual desde token JWT usando SQLite
    """
    usuario = obtener_usuario_por_token(token)
    if not usuario:
        raise CREDENTIALS_EXCEPTION
    return usuario

def es_rol_sqlite(roles_requeridos: list[str]):
    """
    Factoría de dependencias que verifica roles usando SQLite
    """
    def chequear_rol(current_user: dict = Depends(obtener_usuario_actual_sqlite)) -> dict:
        user_rol = current_user['rol_nombre']
        
        if user_rol not in roles_requeridos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Se requiere uno de los siguientes roles: {', '.join(roles_requeridos)}",
            )
        
        return current_user
    
    return chequear_rol

# Guardianes predefinidos
es_cajero_sqlite = es_rol_sqlite(["Cajero", "Admin", "Gerente", "Soporte"])
es_admin_sqlite = es_rol_sqlite(["Admin", "Soporte"])
es_gerente_sqlite = es_rol_sqlite(["Gerente", "Admin", "Soporte"])