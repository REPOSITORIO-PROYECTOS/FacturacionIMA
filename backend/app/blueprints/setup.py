"""
Endpoints para gestión de usuarios usando SQLite
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from backend.sqlite_auth import sqlite_auth
from backend.sqlite_security import obtener_usuario_actual_sqlite, es_admin_sqlite

router = APIRouter(
    prefix="/api/setup",
    tags=["Gestión de Usuarios SQLite"]
)

class UsuarioCreate(BaseModel):
    nombre_usuario: str
    password: str
    rol_nombre: str = "Cajero"

class UsuarioResponse(BaseModel):
    id: int
    nombre_usuario: str
    rol_nombre: str
    activo: bool
    creado_en: str

@router.post("/create-user")
async def crear_usuario(
    usuario_data: UsuarioCreate,
    current_user: dict = Depends(es_admin_sqlite)
):
    """
    Crear nuevo usuario en SQLite (solo admin)
    """
    resultado = sqlite_auth.crear_usuario(
        username=usuario_data.nombre_usuario,
        password=usuario_data.password,
        rol_nombre=usuario_data.rol_nombre
    )
    
    if not resultado:
        raise HTTPException(
            status_code=400,
            detail="No se pudo crear el usuario. Verifique que el nombre de usuario no exista y el rol sea válido."
        )
    
    return {
        "message": "Usuario creado exitosamente",
        "nombre_usuario": usuario_data.nombre_usuario,
        "rol": usuario_data.rol_nombre
    }

@router.get("/users")
async def listar_usuarios(
    current_user: dict = Depends(es_admin_sqlite)
) -> list[UsuarioResponse]:
    """
    Listar todos los usuarios (solo admin)
    """
    usuarios = sqlite_auth.listar_usuarios()
    return usuarios

@router.post("/create-admin-public")
async def crear_primer_admin(usuario_data: UsuarioCreate):
    """
    Endpoint público para crear el primer admin si no existe ningún usuario
    """
    usuarios_existentes = sqlite_auth.listar_usuarios()
    
    if len(usuarios_existentes) > 1:  # Ya existe admin por defecto
        raise HTTPException(
            status_code=400,
            detail="Ya existen usuarios en el sistema. Use /create-user con autenticación."
        )
    
    # Forzar rol admin para el primer usuario
    resultado = sqlite_auth.crear_usuario(
        username=usuario_data.nombre_usuario,
        password=usuario_data.password,
        rol_nombre="Admin"
    )
    
    if not resultado:
        raise HTTPException(
            status_code=400,
            detail="No se pudo crear el usuario administrador"
        )
    
    return {
        "message": "Usuario administrador creado exitosamente",
        "nombre_usuario": usuario_data.nombre_usuario,
        "rol": "Admin",
        "note": "Ahora puede iniciar sesión con estas credenciales"
    }