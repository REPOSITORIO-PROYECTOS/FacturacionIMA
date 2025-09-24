from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Optional
from backend.sqlite_auth import obtener_usuarios_sqlite, actualizar_usuario_sqlite, desactivar_usuario_sqlite

router = APIRouter(
    prefix="/usuarios",
    tags=["Usuarios"]
)

@router.get("/")
async def listar_usuarios():
    """
    Devuelve la lista de usuarios registrados.
    """
    usuarios = obtener_usuarios_sqlite()
    return usuarios

@router.put("/{username}")
async def actualizar_usuario(username: str, datos: dict = Body(...)):
    """
    Actualiza los datos de un usuario (rol, nombre, etc).
    """
    ok = actualizar_usuario_sqlite(username, datos)
    if not ok:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"detail": "Usuario actualizado"}

@router.post("/{username}/desactivar")
async def desactivar_usuario(username: str):
    """
    Desactiva (inhabilita) un usuario.
    """
    ok = desactivar_usuario_sqlite(username)
    if not ok:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"detail": "Usuario desactivado"}
