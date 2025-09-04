
from datetime import timedelta
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session

# --- Módulos del proyecto ---
from backend.database import get_db
from backend.security import crear_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
# Importamos los managers de negocio
from backend.gestion import auth_manager

router = APIRouter(
    prefix="/auth",
    tags=["Autenticación y Autorización"]
)

@router.post("/token",) # Quita response_model temporalmente para depurar
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Endpoint de inicio de sesión. Valida contra la DB y devuelve un token JWT.
    """
    # 1. Llamamos a nuestra función de negocio MEJORADA.
    # Esta función ahora garantiza que el usuario devuelto está activo y tiene un rol.
    usuario = auth_manager.autenticar_usuario(
        db=db,
        username=form_data.username,
        password=form_data.password
    )
    
    if not usuario:
        # Este error ahora cubre: usuario inexistente, contraseña incorrecta,
        # usuario inactivo, o usuario sin rol.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos, o el usuario no tiene permisos para acceder.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 2. Creamos el token. Ya no necesitamos poner el rol, porque `obtener_usuario_actual`
    #    siempre lo busca en la base de datos para máxima seguridad.
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = crear_access_token(
        data={"sub": usuario.nombre_usuario}, # Solo necesitamos el "subject"
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

