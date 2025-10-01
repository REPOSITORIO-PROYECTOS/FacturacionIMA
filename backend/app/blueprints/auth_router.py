from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from pydantic import BaseModel

from backend.database import get_db
from backend.modelos import Usuario, Rol, Empresa
from backend import config
from backend.security import (
    crear_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    verificar_password,
    obtener_usuario_actual,
)

router = APIRouter(prefix="/auth", tags=["Autenticación y Autorización"])


class UserMeResponse(BaseModel):
    id: int
    username: str
    role: str
    id_empresa: int
    empresa_cuit: str | None = None
    empresa_nombre: str | None = None
    activo: bool



@router.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Autenticación unificada contra MySQL (tabla usuarios/roles).

    Fallback opcional: credenciales estáticas (config.STATIC_ADMIN_USER / PASS) para entorno de instalación inicial.
    """
    username = form_data.username.strip()
    password = form_data.password

    # Buscar usuario en MySQL
    stmt = select(Usuario).where(Usuario.nombre_usuario == username)
    usuario = db.exec(stmt).first()

    # Fallback admin estático si no existe en DB
    if not usuario and username == config.STATIC_ADMIN_USER and password == config.STATIC_ADMIN_PASS:
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        token = crear_access_token({"sub": username}, access_token_expires)
        return {
            "access_token": token,
            "token_type": "bearer",
            "user_info": {"username": username, "role": "Admin", "static": True},
        }

    if not usuario or not usuario.activo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    # Cargar rol
    rol = db.exec(select(Rol).where(Rol.id == usuario.id_rol)).first() if usuario.id_rol else None
    if not rol:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario sin rol asignado")

    if not verificar_password(password, usuario.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = crear_access_token({"sub": usuario.nombre_usuario}, access_token_expires)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_info": {"username": usuario.nombre_usuario, "role": rol.nombre},
    }


@router.get("/me", response_model=UserMeResponse, summary="Información del usuario autenticado")
def obtener_usuario_me(user: Usuario = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    empresa = None
    if user.id_empresa:
        empresa = db.exec(select(Empresa).where(Empresa.id == user.id_empresa)).first()
    # Cargar rol
    rol = db.exec(select(Rol).where(Rol.id == user.id_rol)).first() if user.id_rol else None
    return UserMeResponse(
        id=user.id,
        username=user.nombre_usuario,
        role=rol.nombre if rol else "?",
        id_empresa=user.id_empresa,
        empresa_cuit=empresa.cuit if empresa else None,
        empresa_nombre=empresa.nombre_legal if empresa else None,
        activo=user.activo,
    )


