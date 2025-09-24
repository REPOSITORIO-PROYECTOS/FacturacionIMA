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

@router.post("/rename-batch")
async def rename_batch(payload: List[dict] = Body(...)):
    """Renombrar en lote nombre_usuario y/o password.
    Cada item: {"origen": "email o username", "nuevo_nombre": "Nombre Nuevo", "password": "nueva"}
    """
    resultados = []
    for item in payload:
        origen = item.get("origen")
        nuevo = item.get("nuevo_nombre")
        pwd = item.get("password")
        if not origen:
            resultados.append({"origen": origen, "ok": False, "detail": "Falta origen"})
            continue
        datos = {}
        if nuevo:
            datos["nuevo_nombre_usuario"] = nuevo
        if pwd:
            datos["password"] = pwd
        datos["rol_nombre"] = item.get("rol_nombre", "Cajero")
        datos["activo"] = True
        ok = actualizar_usuario_sqlite(str(origen), datos)
        resultados.append({"origen": origen, "ok": ok})
    return {"resultados": resultados}

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
