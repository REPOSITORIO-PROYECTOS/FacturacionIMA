from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from backend.modelos import Empresa, ConfiguracionEmpresa, AfipCredencial, Usuario, Rol
from backend.database import get_db
from backend.security import obtener_usuario_actual, get_password_hash
from typing import List, Optional
from pydantic import BaseModel

# --- Modelos de Datos para la API ---

class EmpresaAdminInfo(BaseModel):
    id: int
    nombre_legal: str
    cuit: str
    activa: bool
    afip_configurada: bool
    condicion_iva: Optional[str] = None
    punto_venta: Optional[int] = None

class DatosNuevaEmpresa(BaseModel):
    nombre_legal: str
    nombre_fantasia: Optional[str] = None
    cuit: str
    google_sheet_id: Optional[str] = None
    afip_certificado: Optional[str] = None
    afip_clave_privada: Optional[str] = None

class DatosNuevoUsuario(BaseModel):
    nombre_usuario: str
    password: str

class PayloadCrearEmpresa(BaseModel):
    empresa: DatosNuevaEmpresa
    usuario: DatosNuevoUsuario

class DatosEditarEmpresa(BaseModel):
    nombre_legal: str
    nombre_fantasia: Optional[str] = None
    cuit: str
    activa: bool
    google_sheet_id: Optional[str] = None
    afip_certificado: Optional[str] = None
    afip_clave_privada: Optional[str] = None

router = APIRouter(prefix="/admin/empresas", tags=["admin-empresas"])

def es_admin(usuario) -> bool:
    return usuario.rol and usuario.rol.nombre.lower() in ["admin", "administrador"]

# --- Endpoint: Crear nueva empresa y su primer usuario ---
@router.post("/", response_model=Empresa)
def crear_empresa(
    payload: PayloadCrearEmpresa,
    usuario_actual = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    if not es_admin(usuario_actual):
        raise HTTPException(status_code=403, detail="Solo los administradores pueden crear empresas.")

    # Verificar si la empresa o el usuario ya existen
    if db.exec(select(Empresa).where(Empresa.cuit == payload.empresa.cuit)).first():
        raise HTTPException(status_code=400, detail="Ya existe una empresa con este CUIT.")
    if db.exec(select(Usuario).where(Usuario.nombre_usuario == payload.usuario.nombre_usuario)).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está en uso.")

    # Crear la nueva empresa
    nueva_empresa = Empresa.from_orm(payload.empresa)
    db.add(nueva_empresa)
    db.commit()
    db.refresh(nueva_empresa)

    # Crear la configuración de la empresa
    configuracion = ConfiguracionEmpresa(
        cuit=payload.empresa.cuit,
        id_empresa=nueva_empresa.id,
        link_google_sheets=payload.empresa.google_sheet_id,
        afip_certificado_encrypted=payload.empresa.afip_certificado,
        afip_clave_privada_encrypted=payload.empresa.afip_clave_privada
    )
    db.add(configuracion)
    db.commit()

    # Buscar o crear el rol de "Admin" para el nuevo usuario
    rol_admin = db.exec(select(Rol).where(Rol.nombre == "Admin")).first()
    if not rol_admin:
        rol_admin = Rol(nombre="Admin")
        db.add(rol_admin)
        db.commit()
        db.refresh(rol_admin)

    # Crear el primer usuario para la empresa
    nuevo_usuario = Usuario(
        nombre_usuario=payload.usuario.nombre_usuario,
        password_hash=get_password_hash(payload.usuario.password),
        id_rol=rol_admin.id,
        id_empresa=nueva_empresa.id,
        activo=True
    )
    db.add(nuevo_usuario)
    db.commit()

    return nueva_empresa

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
        return []

# --- Endpoint: Obtener empresa por ID ---
@router.get("/{empresa_id}")
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

    # Obtener configuración
    config = db.exec(select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == empresa.id)).first()
    
    # Preparar respuesta con configuración
    response = {
        "id": empresa.id,
        "nombre_legal": empresa.nombre_legal,
        "nombre_fantasia": empresa.nombre_fantasia,
        "cuit": empresa.cuit,
        "activa": empresa.activa,
        "google_sheet_id": config.link_google_sheets if config else None,
        "afip_certificado": config.afip_certificado_encrypted if config else None,
        "afip_clave_privada": config.afip_clave_privada_encrypted if config else None,
        "aplicar_desglose_77": (config.aplicar_desglose_77 if config else False),
        "detalle_empresa_text": (config.detalle_empresa_text if config else None),
    }
    
    return response

# --- Endpoint: Editar empresa ---
@router.put("/{empresa_id}")
def editar_empresa(
    empresa_id: int,
    empresa_data: DatosEditarEmpresa,
    usuario_actual = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db)
):
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    # Solo admin puede editar empresas
    if not es_admin(usuario_actual):
        raise HTTPException(status_code=403, detail="Solo administradores pueden editar empresas")

    # Actualizar datos de la empresa
    empresa.nombre_legal = empresa_data.nombre_legal
    empresa.nombre_fantasia = empresa_data.nombre_fantasia
    empresa.cuit = empresa_data.cuit
    empresa.activa = empresa_data.activa
    
    # Actualizar configuración
    config = db.exec(select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == empresa.id)).first()
    if config:
        config.link_google_sheets = empresa_data.google_sheet_id
        config.afip_certificado_encrypted = empresa_data.afip_certificado
        config.afip_clave_privada_encrypted = empresa_data.afip_clave_privada
    else:
        # Crear configuración si no existe
        config = ConfiguracionEmpresa(
            cuit=empresa.cuit,
            id_empresa=empresa.id,
            link_google_sheets=empresa_data.google_sheet_id,
            afip_certificado_encrypted=empresa_data.afip_certificado,
            afip_clave_privada_encrypted=empresa_data.afip_clave_privada
        )
        db.add(config)
    
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
