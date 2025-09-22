from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
from backend.utils.afip_tools_manager import (
    generar_csr_y_guardar_clave_temporal,
    guardar_certificado_final,
    listar_certificados_disponibles,
    procesar_archivo_certificado_completo
)

router = APIRouter(prefix="/api/afip", tags=["AFIP"])

class GenerarCSRRequest(BaseModel):
    cuit_empresa: str
    razon_social: str

class SubirCertificadoRequest(BaseModel):
    cuit: str
    certificado_pem: str

class SubirArchivoCompletoRequest(BaseModel):
    cuit: str
    archivo_contenido: str
    nombre_archivo: str

class ConfiguracionEmisorRequest(BaseModel):
    cuit_empresa: str
    razon_social: str
    nombre_fantasia: Optional[str] = None
    condicion_iva: str  # RESPONSABLE_INSCRIPTO, MONOTRIBUTO, etc.
    punto_venta: int = 1
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None

class ConfiguracionEmisorRequest(BaseModel):
    cuit_empresa: str
    razon_social: str
    nombre_fantasia: Optional[str] = None
    condicion_iva: str  # RESPONSABLE_INSCRIPTO, MONOTRIBUTO, etc.
    punto_venta: int = 1
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None

@router.post("/generar-csr")
async def generar_csr_endpoint(request: GenerarCSRRequest):
    """
    Genera un CSR y guarda la clave privada temporalmente.
    Devuelve el CSR para descarga.
    """
    try:
        csr_content = generar_csr_y_guardar_clave_temporal(
            cuit_empresa=request.cuit_empresa,
            razon_social=request.razon_social
        )
        
        return Response(
            content=csr_content,
            media_type="application/x-pem-file",
            headers={
                "Content-Disposition": f"attachment; filename=csr_{request.cuit_empresa}.pem"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando CSR: {str(e)}")

@router.post("/subir-certificado")
async def subir_certificado_endpoint(request: SubirCertificadoRequest):
    """
    Recibe el certificado firmado por AFIP y lo guarda junto con la clave privada.
    """
    try:
        resultado = guardar_certificado_final(
            cuit=request.cuit,
            certificado_pem=request.certificado_pem
        )
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando certificado: {str(e)}")

@router.post("/procesar-archivo-completo")
async def procesar_archivo_completo_endpoint(request: SubirArchivoCompletoRequest):
    """
    Procesa un archivo completo que contiene tanto el certificado como la clave privada.
    Extrae automáticamente ambos componentes y los guarda por separado.
    """
    try:
        resultado = procesar_archivo_certificado_completo(
            cuit=request.cuit,
            archivo_contenido=request.archivo_contenido
        )
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando archivo completo: {str(e)}")

@router.get("/certificados")
async def listar_certificados_endpoint():
    """
    Lista todos los certificados disponibles.
    """
    try:
        certificados = listar_certificados_disponibles()
        return {"certificados": certificados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listando certificados: {str(e)}")

@router.get("/estado/{cuit}")
async def verificar_estado_certificado(cuit: str):
    """
    Verifica el estado de certificado para un CUIT específico.
    """
    try:
        certificados = listar_certificados_disponibles()
        certificado = next((c for c in certificados if c["cuit"] == cuit), None)
        
        if not certificado:
            return {
                "cuit": cuit,
                "estado": "sin_generar",
                "mensaje": "No se ha generado CSR para este CUIT"
            }
        
        if certificado["tiene_clave"]:
            return {
                "cuit": cuit,
                "estado": "completo",
                "mensaje": "Certificado y clave privada disponibles"
            }
        else:
            return {
                "cuit": cuit,
                "estado": "pendiente",
                "mensaje": "CSR generado, falta subir certificado firmado"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verificando estado: {str(e)}")

@router.post("/configurar-emisor")
async def configurar_emisor_endpoint(request: ConfiguracionEmisorRequest):
    """
    Configura o actualiza los datos del emisor para facturación.
    """
    try:
        from backend.utils.afip_tools_manager import guardar_configuracion_emisor
        resultado = guardar_configuracion_emisor(
            cuit_empresa=request.cuit_empresa,
            razon_social=request.razon_social,
            nombre_fantasia=request.nombre_fantasia,
            condicion_iva=request.condicion_iva,
            punto_venta=request.punto_venta,
            direccion=request.direccion,
            telefono=request.telefono,
            email=request.email
        )
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error configurando emisor: {str(e)}")

@router.get("/configuracion-emisor/{cuit}")
async def obtener_configuracion_emisor(cuit: str):
    """
    Obtiene la configuración actual del emisor.
    """
    try:
        from backend.utils.afip_tools_manager import obtener_configuracion_emisor
        configuracion = obtener_configuracion_emisor(cuit)
        return configuracion
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo configuración: {str(e)}")

@router.get("/condiciones-iva")
async def listar_condiciones_iva():
    """
    Lista las condiciones de IVA disponibles.
    """
    return {
        "condiciones": [
            {"id": 1, "nombre": "RESPONSABLE_INSCRIPTO", "descripcion": "Responsable Inscripto"},
            {"id": 4, "nombre": "EXENTO", "descripcion": "Exento"},
            {"id": 5, "nombre": "CONSUMIDOR_FINAL", "descripcion": "Consumidor Final"},
            {"id": 6, "nombre": "MONOTRIBUTO", "descripcion": "Monotributo"},
            {"id": 7, "nombre": "NO_CATEGORIZADO", "descripcion": "No Categorizado"}
        ]
    }