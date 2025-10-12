from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from backend.modelos import Empresa, ConfiguracionEmpresa, AfipCredencial
from backend.database import get_db
from backend.security import obtener_usuario_actual
from typing import List, Optional
from pydantic import BaseModel

# Modelo de respuesta para la lista de empresas
class EmpresaAdminInfo(BaseModel):
    id: int
    nombre_legal: str
    cuit: str
    activa: bool
    afip_configurada: bool
    condicion_iva: Optional[str] = None
    punto_venta: Optional[int] = None

router = APIRouter(prefix="/admin/empresas", tags=["admin-empresas"])

def es_admin(usuario) -> bool:
    """Verifica si el usuario tiene rol de administrador"""
    return usuario.rol and usuario.rol.nombre.lower() in ["admin", "administrador"]

# --- Endpoint: Listar empresas ---
@router.get("/", response_model=List[EmpresaAdminInfo])
def listar_empresas(
    usuario_actual = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    if es_admin(usuario_actual):
        empresas = db.exec(select(Empresa)).all()
        response_data = []
        for empresa in empresas:
            config = db.exec(select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == empresa.id)).first()
            credencial = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == empresa.cuit)).first()
            
            info = EmpresaAdminInfo(
                id=empresa.id,
                nombre_legal=empresa.nombre_legal,
                cuit=empresa.cuit,
                activa=empresa.activa,
                afip_configurada=bool(credencial and credencial.certificado_pem and credencial.clave_privada_pem),
                condicion_iva=config.afip_condicion_iva if config else None,
                punto_venta=config.afip_punto_venta_predeterminado if config else None
            )
            response_data.append(info)
        return response_data
    else:
        # Para usuarios no admin, devolvemos una lista vacía o su propia empresa con formato similar
        return []

# --- Endpoint: Obtener empresa por ID ---
@router.get("/{empresa_id}", response_model=Empresa)
def obtener_empresa(
    empresa_id: int,
    usuario_actual = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # Verificar permisos
    if not es_admin(usuario_actual) and empresa_id != usuario_actual.id_empresa:
        raise HTTPException(status_code=403, detail="No tienes permisos para acceder a esta empresa")

    return empresa

# --- Endpoint: Editar empresa ---
@router.put("/{empresa_id}", response_model=Empresa)
def editar_empresa(
    empresa_id: int,
    empresa_data: Empresa,
    usuario_actual = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # Solo admin puede editar empresas
    if not es_admin(usuario_actual):
        raise HTTPException(status_code=403, detail="Solo administradores pueden editar empresas")

    for k, v in empresa_data.dict(exclude_unset=True).items():
        setattr(empresa, k, v)
    db.commit()
    db.refresh(empresa)
    return empresa

# --- Endpoint: Editar configuración de empresa ---
@router.put("/{empresa_id}/configuracion", response_model=ConfiguracionEmpresa)
def editar_configuracion_empresa(
    empresa_id: int,
    config: ConfiguracionEmpresa,
    usuario_actual = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    # Verificar permisos
    if not es_admin(usuario_actual) and empresa_id != usuario_actual.id_empresa:
        raise HTTPException(status_code=403, detail="No tienes permisos para editar esta configuración")

    conf = db.exec(select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == empresa_id)).first()
    if not conf:
        # Crear nueva configuración si no existe
        conf = ConfiguracionEmpresa(id_empresa=empresa_id, cuit=config.cuit)
        db.add(conf)
    for k, v in config.dict(exclude_unset=True).items():
        setattr(conf, k, v)
    db.commit()
    db.refresh(conf)
    return conf

# --- Endpoint: Subir/cambiar certificado AFIP ---
@router.post("/{empresa_id}/certificado-afip")
def subir_certificado_afip(
    empresa_id: int,
    certificado: UploadFile = File(...),
    clave: UploadFile = File(...),
    usuario_actual = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    # Verificar permisos
    if not es_admin(usuario_actual) and empresa_id != usuario_actual.id_empresa:
        raise HTTPException(status_code=403, detail="No tienes permisos para subir certificados a esta empresa")

    # Aquí deberías encriptar y guardar los archivos
    cert_pem = certificado.file.read().decode()
    key_pem = clave.file.read().decode()
    cred = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == str(empresa_id))).first()
    if not cred:
        cred = AfipCredencial(cuit=str(empresa_id), certificado_pem=cert_pem, clave_privada_pem=key_pem)
        db.add(cred)
    else:
        cred.certificado_pem = cert_pem
        cred.clave_privada_pem = key_pem
    db.commit()
    return {"ok": True}

# --- Endpoint: Ver logs administrativos (placeholder) ---
@router.get("/logs")
def ver_logs_admin(
    usuario_actual = Depends(obtener_usuario_actual)
):
    # Solo admin puede ver logs
    if not es_admin(usuario_actual):
        raise HTTPException(status_code=403, detail="Solo administradores pueden ver logs")

    # Aquí deberías implementar la lógica real de logs
    return [{"evento": "empresa_creada", "usuario": "admin", "fecha": "2025-10-11"}]
