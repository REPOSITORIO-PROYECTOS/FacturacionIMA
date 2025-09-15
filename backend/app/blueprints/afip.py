from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
from backend.utils.afip_tools_manager import (
    generar_csr_y_guardar_clave_temporal,
    guardar_certificado_final,
    listar_certificados_disponibles
)

router = APIRouter(prefix="/api/afip", tags=["AFIP"])

class GenerarCSRRequest(BaseModel):
    cuit_empresa: str
    razon_social: str

class SubirCertificadoRequest(BaseModel):
    cuit: str
    certificado_pem: str

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