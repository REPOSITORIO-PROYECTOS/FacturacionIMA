from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Optional
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.database import get_db
from backend.modelos import Usuario, Rol, Empresa
from backend.security import obtener_usuario_actual, get_password_hash

router = APIRouter(prefix="/usuarios", tags=["Usuarios (MySQL)"])


class UsuarioCreate(BaseModel):
    username: str
    password: str
    rol: str = "Cajero"
    id_empresa: Optional[int] = None


class UsuarioUpdate(BaseModel):
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    nuevo_username: Optional[str] = None


def _get_or_create_rol(db: Session, nombre: str) -> Rol:
    r = db.exec(select(Rol).where(Rol.nombre == nombre)).first()
    if r:
        return r
    r = Rol(nombre=nombre)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/")
def listar_usuarios(db: Session = Depends(get_db), usuario_actual: Usuario = Depends(obtener_usuario_actual)):
    rows = db.exec(select(Usuario).where(Usuario.id_empresa == usuario_actual.id_empresa)).all()
    roles_map = {r.id: r.nombre for r in db.exec(select(Rol)).all()}
    return [
        {
            "id": u.id,
            "nombre_usuario": u.nombre_usuario,
            "activo": u.activo,
            "creado_en": u.creado_en,
            "rol_nombre": roles_map.get(u.id_rol),
        }
        for u in rows
    ]


@router.post("/", status_code=201)
def crear_usuario(data: UsuarioCreate, db: Session = Depends(get_db), usuario_actual: Usuario = Depends(obtener_usuario_actual)):
    username = data.username.strip()
    if db.exec(select(Usuario).where(Usuario.nombre_usuario == username)).first():
        raise HTTPException(status_code=400, detail="Usuario ya existe")
    rol = _get_or_create_rol(db, data.rol)
    # Empresa: si no se especifica, usar la del usuario actual.
    id_empresa = data.id_empresa or usuario_actual.id_empresa
    nuevo = Usuario(
        nombre_usuario=username,
        password_hash=get_password_hash(data.password),
        id_rol=rol.id,
        id_empresa=id_empresa,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return {"id": nuevo.id, "nombre_usuario": nuevo.nombre_usuario, "rol": rol.nombre}


@router.put("/{username}")
def actualizar_usuario(username: str, data: UsuarioUpdate, db: Session = Depends(get_db), usuario_actual: Usuario = Depends(obtener_usuario_actual)):
    u = db.exec(select(Usuario).where(Usuario.nombre_usuario == username, Usuario.id_empresa == usuario_actual.id_empresa)).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    changed = False
    if data.password:
        u.password_hash = get_password_hash(data.password)
        changed = True
    if data.rol:
        rol = _get_or_create_rol(db, data.rol)
        u.id_rol = rol.id
        changed = True
    if data.activo is not None:
        u.activo = data.activo
        changed = True
    if data.nuevo_username:
        nuevo = data.nuevo_username.strip()
        if nuevo and nuevo != u.nombre_usuario:
            existe = db.exec(select(Usuario).where(Usuario.nombre_usuario == nuevo)).first()
            if existe:
                raise HTTPException(status_code=400, detail="Nuevo username ya en uso")
            u.nombre_usuario = nuevo
            changed = True
    if changed:
        db.add(u)
        db.commit()
        db.refresh(u)
    return {"detail": "ok"}


@router.post("/{username}/desactivar")
def desactivar_usuario(username: str, db: Session = Depends(get_db), usuario_actual: Usuario = Depends(obtener_usuario_actual)):
    u = db.exec(select(Usuario).where(Usuario.nombre_usuario == username, Usuario.id_empresa == usuario_actual.id_empresa)).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    u.activo = False
    db.add(u)
    db.commit()
    return {"detail": "desactivado"}


@router.post("/rename-batch")
def rename_batch(payload: List[dict] = Body(...), db: Session = Depends(get_db), usuario_actual: Usuario = Depends(obtener_usuario_actual)):
    resultados = []
    for item in payload:
        origen = (item.get("origen") or "").strip()
        if not origen:
            resultados.append({"origen": origen, "ok": False, "detail": "Falta origen"})
            continue
        u = db.exec(select(Usuario).where(Usuario.nombre_usuario == origen, Usuario.id_empresa == usuario_actual.id_empresa)).first()
        if not u:
            resultados.append({"origen": origen, "ok": False, "detail": "No existe"})
            continue
        nuevo_nombre = (item.get("nuevo_nombre") or "").strip()
        if nuevo_nombre:
            existe = db.exec(select(Usuario).where(Usuario.nombre_usuario == nuevo_nombre)).first()
            if existe:
                resultados.append({"origen": origen, "ok": False, "detail": "Nuevo ya existe"})
                continue
            u.nombre_usuario = nuevo_nombre
        if item.get("password"):
            u.password_hash = get_password_hash(item["password"])
        rol_nombre = item.get("rol_nombre")
        if rol_nombre:
            rol = _get_or_create_rol(db, rol_nombre)
            u.id_rol = rol.id
        u.activo = True
        db.add(u)
        db.commit()
        resultados.append({"origen": origen, "ok": True})
    return {"resultados": resultados}

