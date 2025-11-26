from fastapi import APIRouter, FastAPI, HTTPException, Request, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging

from backend.utils.billige_manage import process_invoice_batch_for_endpoint

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
    max_parallel_workers: int = 5 # Permite al cliente especificar el número de workers, con un default
) -> List[Dict[str, Any]]:
    """
    Endpoint para procesar facturas en lote.
    """
    logger.info(f"Recibida solicitud POST /bill/batch con {len(invoices)} facturas.")

    # Convertir los modelos Pydantic a la lista de diccionarios que espera
    # process_invoice_batch_for_endpoint. Aquí también validamos la entrada.
    invoices_for_processing = []
    # Validar que el CUIT emisor corresponda a la empresa del usuario actual
    from fastapi import Request, Depends
    from backend.modelos import Empresa
    from backend.database import get_db
    db = next(get_db())
    usuario_actual = None
    try:
        # Intentar obtener usuario_actual desde contexto FastAPI (si está disponible)
        import contextvars
        usuario_actual = contextvars.ContextVar('usuario_actual').get(None)
    except Exception:
        pass
    # Si no se pudo, intentar obtenerlo de la sesión (para compatibilidad)
    if not usuario_actual:
        try:
            from backend.security import obtener_usuario_actual
            usuario_actual = obtener_usuario_actual()
        except Exception:
            usuario_actual = None
    empresa_cuit = None
    if usuario_actual:
        empresa = db.exec(select(Empresa).where(Empresa.id == usuario_actual.id_empresa)).first()
        if empresa:
            empresa_cuit = str(empresa.cuit)
    for invoice_item in invoices:
        item_dict = {
            "id": invoice_item.id,
            "total": invoice_item.total,
            "cliente_data": invoice_item.cliente_data.dict()
        }
        if invoice_item.conceptos:
            item_dict["conceptos"] = [c.dict() for c in invoice_item.conceptos]
        if invoice_item.detalle_empresa:
            item_dict["detalle_empresa"] = invoice_item.detalle_empresa
        if invoice_item.aplicar_desglose_77:
            item_dict["aplicar_desglose_77"] = True
        # Validación de CUIT emisor
        if invoice_item.emisor_cuit:
            if empresa_cuit and str(invoice_item.emisor_cuit) != empresa_cuit:
                raise HTTPException(status_code=403, detail=f"El CUIT emisor {invoice_item.emisor_cuit} no corresponde a su empresa ({empresa_cuit})")
            item_dict["emisor_cuit"] = invoice_item.emisor_cuit
        if invoice_item.tipo_forzado is not None:
            item_dict["tipo_forzado"] = invoice_item.tipo_forzado
        invoices_for_processing.append(item_dict)

    try:
        # Log seguro del payload resumido (sin datos sensibles extra)
        preview = [
            {
                'id': x.get('id'),
                'total': x.get('total'),
                'emisor_cuit': x.get('emisor_cuit'),
                'tipo_forzado': x.get('tipo_forzado'),
                'cliente_cond_iva': x.get('cliente_data',{}).get('condicion_iva'),
                'cliente_doc': x.get('cliente_data',{}).get('cuit_o_dni')
            } for x in invoices_for_processing
        ]
        logger.info(f"Batch detalle (resumen): {preview}")
    except Exception:
        pass

    try:
        results = process_invoice_batch_for_endpoint(
            invoices_payload=invoices_for_processing,
            max_workers=max_parallel_workers
        )
        return results
    except Exception as e:
        logger.error(f"Error general al procesar el lote de facturas: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno del servidor al procesar el lote: {e}"
        )
