from fastapi import APIRouter, FastAPI, HTTPException, Request, status, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging

from backend.utils.billige_manage import process_invoice_batch_for_endpoint
from backend.database import SessionLocal, get_db
from backend.modelos import FacturaElectronica, Usuario, Empresa
from backend.security import obtener_usuario_actual
from sqlmodel import select
from datetime import date
import secrets

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/facturador"
)

class ClienteDataPayload(BaseModel):
    cuit_o_dni: str = Field(..., description="CUIT o DNI del receptor. '0' para Consumidor Final.")
    nombre_razon_social: Optional[str] = Field(None, description="Nombre o Razón Social del receptor.")
    domicilio: Optional[str] = Field(None, description="Domicilio del receptor.")
    condicion_iva: str = Field(..., description="Condición de IVA del receptor (ej. 'CONSUMIDOR_FINAL', 'RESPONSABLE_INSCRIPTO').")

class ConceptoPayload(BaseModel):
    descripcion: str = Field(..., description="Descripción del producto/servicio.")
    cantidad: float = Field(..., gt=0, description="Cantidad de unidades.")
    precio_unitario: float = Field(..., gt=0, description="Precio unitario del concepto.")
    subtotal: Optional[float] = Field(None, description="Subtotal calculado (cantidad * precio_unitario).")
    tasa_iva: Optional[float] = Field(None, description="Tasa de IVA aplicable al concepto (ej. 0.21).")

class InvoiceItemPayload(BaseModel):
    id: Optional[str] = Field(None, description="ID único para esta factura en el lote (opcional).")
    total: float = Field(..., gt=0, description="Monto total de la factura.")
    cliente_data: ClienteDataPayload = Field(..., description="Datos del cliente receptor.")
    conceptos: Optional[List[ConceptoPayload]] = Field(None, description="Lista de conceptos/productos de la factura.")
    emisor_cuit: Optional[str] = Field(None, description="CUIT del emisor a usar (override/selección).")
    punto_venta: Optional[int] = Field(None, description="Punto de venta a usar (override).")
    tipo_forzado: Optional[int] = Field(None, description="Override de tipo comprobante: 1=A, 6=B, 11=C")
    detalle_empresa: Optional[str] = Field(None, description="Detalle específico a incluir para la empresa (leyendas/observaciones).")
    aplicar_desglose_77: Optional[bool] = Field(False, description="Aplica desglose especial 77% + IVA 21% en el DETALLE del PDF.")


@router.post("/facturar-por-cantidad",
          response_model=List[Dict[str, Any]], # La respuesta será una lista de diccionarios
          status_code=status.HTTP_200_OK,
          summary="Procesa un lote de facturas electrónicas.",
          description="Recibe una lista de facturas y las procesa concurrentemente, devolviendo el resultado de cada una.")
async def create_batch_invoices(
    invoices: List[InvoiceItemPayload],
    max_parallel_workers: int = 5, # Permite al cliente especificar el número de workers, con un default
    usuario_actual: Usuario = Depends(obtener_usuario_actual),
    db = Depends(get_db)
) -> List[Dict[str, Any]]:
    """
    endpoint para procesar facturas en lote.
    """
    # Validar límite de 5 boletas
    if len(invoices) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Se permite facturar máximo 5 boletas por operación."
        )

    # --- VERIFICACIÓN DE BYPASS POR API KEY MAESTRA ---
    # Si el usuario es un "dummy" creado por API Key (id=999), saltamos la validación estricta de empresa.
    es_super_admin_api = (usuario_actual.id == 999 and usuario_actual.nombre_usuario == "sistema_api_key")
    
    logger.info(f"Recibida solicitud POST /bill/batch con {len(invoices)} facturas. Usuario: {usuario_actual.nombre_usuario} (SuperAdmin: {es_super_admin_api})")

    empresa_cuit = None
    if not es_super_admin_api:
        # Obtener CUIT de la empresa del usuario normal
        empresa = db.exec(select(Empresa).where(Empresa.id == usuario_actual.id_empresa)).first()
        if not empresa:
            raise HTTPException(status_code=500, detail="Empresa del usuario no encontrada.")
        empresa_cuit = str(empresa.cuit)
    
    # Convertir los modelos Pydantic a la lista de diccionarios que espera
    # process_invoice_batch_for_endpoint. Aquí también validamos la entrada.
    invoices_for_processing = []
    
    for invoice_item in invoices:
        cuit_a_usar = empresa_cuit
        
        # VALIDACIÓN DE SEGURIDAD (Solo si no es SuperAdmin API):
        if not es_super_admin_api:
            # Si intenta usar un CUIT emisor diferente al de su empresa, bloquear.
            if invoice_item.emisor_cuit and str(invoice_item.emisor_cuit).strip() != empresa_cuit:
                 logger.warning(f"Usuario {usuario_actual.nombre_usuario} intentó facturar con CUIT ajeno: {invoice_item.emisor_cuit} (Esperado: {empresa_cuit})")
                 raise HTTPException(
                     status_code=status.HTTP_403_FORBIDDEN,
                     detail=f"El CUIT emisor {invoice_item.emisor_cuit} no corresponde a su empresa."
                 )
        else:
            # Si es SuperAdmin, confiamos en el CUIT que envía en el payload
            if invoice_item.emisor_cuit:
                cuit_a_usar = str(invoice_item.emisor_cuit).strip()
            else:
                # Si no envía CUIT, fallamos porque no tenemos contexto de empresa por defecto
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Para uso con API Key Maestra, es obligatorio especificar 'emisor_cuit' en cada factura."
                )

        # Forzar el CUIT de la empresa si no viene (o si viene correcto)
        # Esto asegura que process_invoice_batch_for_endpoint use la boveda correcta.
        
        item_dict = {
            "id": invoice_item.id,
            "total": invoice_item.total,
            "cliente_data": invoice_item.cliente_data.model_dump(),
            "emisor_cuit": cuit_a_usar  # Sobreescribimos con el CUIT validado o permitido
        }
        if invoice_item.conceptos:
            item_dict["conceptos"] = [c.model_dump() for c in invoice_item.conceptos]
        if invoice_item.detalle_empresa:
            item_dict["detalle_empresa"] = invoice_item.detalle_empresa
        
        # Pasar flags nuevos
        if invoice_item.tipo_forzado:
             item_dict["tipo_forzado"] = invoice_item.tipo_forzado
             
        if invoice_item.punto_venta:
             item_dict["punto_venta"] = invoice_item.punto_venta

        if invoice_item.aplicar_desglose_77:
             item_dict["aplicar_desglose_77"] = invoice_item.aplicar_desglose_77

        invoices_for_processing.append(item_dict)

    # Procesar
    results = await process_invoice_batch_for_endpoint(invoices_for_processing, max_parallel_workers)
    
    return results




class AnularAfipPayload(BaseModel):
    motivo: Optional[str] = None
    force: Optional[bool] = False

@router.post("/anular-afip/{factura_id}", status_code=status.HTTP_200_OK)
async def anular_afip(factura_id: str, body: AnularAfipPayload | None = None) -> Dict[str, Any]:
    db = SessionLocal()
    try:
        logger.info(f"Inicio anulación AFIP factura_id={factura_id} force={bool(body and body.force)}")
        
        # Intentar buscar por ID (si es numérico) o por ingreso_id/cae (si es alfanumérico)
        row = None
        
        # 1. Intentar buscar por ID numérico si factura_id parece un entero
        if factura_id.isdigit():
            row = db.get(FacturaElectronica, int(factura_id))
        
        # 2. Si no se encontró por ID, intentar buscar por ingreso_id (el código alfanumérico del frontend)
        if not row:
            row = db.query(FacturaElectronica).filter(FacturaElectronica.ingreso_id == factura_id).first()
            
        # 3. Como último recurso, intentar por CAE
        if not row:
            row = db.query(FacturaElectronica).filter(FacturaElectronica.cae == factura_id).first()
            
        if not row:
            raise HTTPException(status_code=404, detail=f"Factura no encontrada (ID/Código: {factura_id})")
        if getattr(row, "anulada", False) and not (body and body.force):
            return {"status": "ALREADY", "factura_id": factura_id, "codigo_nota_credito": row.codigo_nota_credito}

        tipo_origen = int(row.tipo_comprobante)
        codigo_tipo = 13
        if tipo_origen == 1:
            codigo_tipo = 3
        elif tipo_origen == 6:
            codigo_tipo = 8

        def _map_condicion_iva_to_id(nombre: str | None) -> int:
            n = (nombre or '').strip().upper()
            if n in {"RESPONSABLE_INSCRIPTO", "RI", "INSCRIPTO"}: return 1
            if n in {"MONOTRIBUTO", "MONOTRIBUTISTA"}: return 5
            if n in {"CONSUMIDOR_FINAL", "CF"}: return 5
            if n in {"EXENTO"}: return 4
            return 5
        # Resolver id_condicion_iva desde configuración de empresa si disponible
        id_cond_iva = 5
        try:
            from sqlmodel import select
            from backend.modelos import Empresa, ConfiguracionEmpresa
            empresa = db.exec(select(Empresa).where(Empresa.cuit == str(row.cuit_emisor))).first()
            if empresa:
                conf = db.exec(select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == empresa.id)).first()
                if conf and conf.afip_condicion_iva:
                    id_cond_iva = _map_condicion_iva_to_id(conf.afip_condicion_iva)
        except Exception:
            id_cond_iva = 5
        # Construir payload según guía del microservicio (multi-CUIT)
        datos_factura = {
            "tipo_afip": codigo_tipo,
            "punto_venta": row.punto_venta,
            "tipo_documento": row.tipo_doc_receptor,
            "documento": str(row.nro_doc_receptor),
            "total": float(row.importe_total),
            "neto": float(row.importe_neto) if codigo_tipo in (3, 8) else float(row.importe_total),
            "iva": float(row.importe_iva) if codigo_tipo in (3, 8) else 0.0,
            "id_condicion_iva": id_cond_iva,
            "asociado_tipo_afip": int(row.tipo_comprobante),
            "asociado_punto_venta": int(row.punto_venta),
            "asociado_numero_comprobante": int(row.numero_comprobante),
            "asociado_fecha_comprobante": str(row.fecha_comprobante),
        }
        # Resolver credenciales del emisor (multi-tenant)
        from backend.utils.afipTools import _resolve_afip_credentials, _sanitize_pem
        
        cuit_res, cert_res, key_res, fuente = _resolve_afip_credentials(str(row.cuit_emisor))
        
        if not (cuit_res and cert_res and key_res):
             # Fallback: si no devolvió nada, intentar sin CUIT específico si se permite (aunque para NC debería ser el mismo emisor)
             if not row.cuit_emisor:
                 cuit_res, cert_res, key_res, fuente = _resolve_afip_credentials(None)
        
        if not (cuit_res and cert_res and key_res):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Credenciales AFIP no disponibles para el CUIT emisor {row.cuit_emisor}")

        credenciales = {
            "cuit": str(cuit_res),
            "certificado": _sanitize_pem(cert_res, 'cert'),
            "clave_privada": _sanitize_pem(key_res, 'key'),
        }
        payload_nc = {"credenciales": credenciales, "datos_factura": datos_factura}
        try:
            import os, requests
            bases = [
                os.getenv("FACTURACION_API_URL", ""),
                "https://facturador-ima.sistemataup.online/afipws/facturador",
            ]
            bases = [b for b in bases if b]
            last_error: Optional[str] = None
            cae_nc: Optional[str] = None
            for base in bases:
                base = base.rstrip("/")
                url = f"{base}"
                try:
                    logger.info(f"Llamando microservicio NC url={url}")
                    resp = requests.post(url, json=payload_nc, timeout=40, headers={"Content-Type": "application/json"})
                    ct = resp.headers.get("Content-Type", "")
                    text = resp.text
                    data = resp.json() if ct.startswith("application/json") else {}
                    if resp.status_code != 200:
                        last_error = f"{resp.status_code} {str(data or text)[:500]}"
                        logger.error(f"Microservicio respondió error: {last_error}")
                        continue
                    cae_nc = str(data.get("cae") or data.get("CAE") or "").strip()
                    if cae_nc:
                        break
                    last_error = "Respuesta sin CAE"
                    logger.error("Microservicio respondió sin CAE en JSON")
                except Exception as e:
                    last_error = str(e)
                    logger.error(f"Falla al llamar microservicio: {e}", exc_info=True)
                    continue
            if not cae_nc:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"No se pudo obtener CAE de NC: {last_error}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Error llamando microservicio NC: {e}")

        # Persistir anulación con código NC emitido por AFIP
        from datetime import date
        row.anulada = True
        row.fecha_anulacion = date.today()
        row.codigo_nota_credito = cae_nc
        if body and body.motivo:
            row.motivo_anulacion = body.motivo
        db.add(row)
        db.commit()
        try:
            from backend.utils.tablasHandler import TablasHandler
            h = TablasHandler()
            h.refrescar_drive()
            _ok = h.marcar_boleta_anulada(str(row.ingreso_id))
            if not _ok:
                logger.warning(f"Sheets: no se pudo marcar Anulada para ingreso_id={row.ingreso_id}")
        except Exception as se:
            logger.warning(f"Sheets: error marcando Anulada: {se}")
        return {"status": "OK", "factura_id": factura_id, "codigo_nota_credito": cae_nc}
    except HTTPException as he:
        db.rollback()
        logger.error(f"Anulación AFIP error HTTP {he.status_code}: {he.detail}")
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error inesperado en anular_afip: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno procesando anulación")
    finally:
        db.close()

class AnularLotePayload(BaseModel):
    ids: List[str]
    motivo: Optional[str] = None

@router.post("/anular-lote", status_code=status.HTTP_200_OK)
async def anular_facturas_en_lote(payload: AnularLotePayload) -> Dict[str, Any]:
    resultados: List[Dict[str, Any]] = []
    for fid in payload.ids:
        try:
            res = await anular_afip(fid, AnularAfipPayload(motivo=payload.motivo, force=True))
            resultados.append({"id": fid, **res})
        except HTTPException as he:
            resultados.append({"id": fid, "status": "ERROR", "error": str(he.detail), "code": he.status_code})
        except Exception as e:
            resultados.append({"id": fid, "status": "ERROR", "error": str(e)})
    return {"status": "OK", "resultados": resultados}
