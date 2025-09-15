
from datetime import timedelta
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordRequestForm

# --- Sistema SQLite Auth ---
from backend.sqlite_auth import autenticar_usuario_sqlite, crear_access_token, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(
    prefix="/auth",
    tags=["Autenticación y Autorización"]
)

@router.post("/token")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends()
):
    """
    Endpoint de inicio de sesión usando SQLite local.
    """
    # Autenticar usando SQLite
    usuario = autenticar_usuario_sqlite(
        username=form_data.username,
        password=form_data.password
    )
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Crear token JWT
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = crear_access_token(
        data={"sub": usuario['nombre_usuario']},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_info": {
            "username": usuario['nombre_usuario'],
            "role": usuario['rol_nombre']
        }
    }

