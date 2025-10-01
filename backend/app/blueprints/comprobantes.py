"""
Endpoint para generar comprobante PDF con todos los datos obligatorios de AFIP
"""
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.responses import FileResponse
from typing import Dict, Any, Optional
import logging
from datetime import datetime
from io import BytesIO
from backend.security import obtener_usuario_actual
from backend.modelos import Usuario, FacturaElectronica
from backend.database import SessionLocal

# Reportlab para generar PDF
try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, Table, TableStyle
    from reportlab.lib import colors
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comprobantes", tags=["comprobantes"])

def generar_pdf_comprobante(factura: FacturaElectronica, conceptos: list = None) -> bytes:
    """
    Genera un PDF del comprobante fiscal con todos los datos obligatorios de AFIP
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("ReportLab no está instalado. Ejecute: pip install reportlab")
    
    buffer = BytesIO()
    
    # Crear canvas (80mm de ancho para ticket térmico, o A4 para hoja completa)
    # Usamos A4 por defecto
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    # Posición inicial
    y = height - 40
    
    # ===== ENCABEZADO =====
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y, "COMPROBANTE FISCAL")
    y -= 30
    
    # Tipo de comprobante
    tipo_map = {1: "FACTURA A", 6: "FACTURA B", 11: "FACTURA C"}
    tipo_nombre = tipo_map.get(factura.tipo_comprobante, f"Tipo {factura.tipo_comprobante}")
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, tipo_nombre)
    y -= 25
    
    # ===== DATOS DEL EMISOR =====
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "DATOS DEL EMISOR")
    y -= 20
    c.setFont("Helvetica", 10)
    
    # Estos datos deberían venir de la configuración o BD
    c.drawString(50, y, f"Razón Social: IMA SISTEM")
    y -= 15
    c.drawString(50, y, f"CUIT: {factura.cuit_emisor}")
    y -= 15
    c.drawString(50, y, f"Condición IVA: RESPONSABLE INSCRIPTO")
    y -= 15
    c.drawString(50, y, f"Domicilio: [Domicilio Comercial]")
    y -= 15
    c.drawString(50, y, f"Punto de Venta: {str(factura.punto_venta).zfill(4)}")
    y -= 25
    
    # ===== DATOS DEL COMPROBANTE =====
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "DATOS DEL COMPROBANTE")
    y -= 20
    c.setFont("Helvetica", 10)
    
    numero_completo = f"{str(factura.punto_venta).zfill(4)}-{str(factura.numero_comprobante).zfill(8)}"
    c.drawString(50, y, f"Número: {numero_completo}")
    y -= 15
    c.drawString(50, y, f"Fecha: {factura.fecha_comprobante.strftime('%d/%m/%Y')}")
    y -= 15
    c.drawString(50, y, f"CAE: {factura.cae}")
    y -= 15
    c.drawString(50, y, f"Vencimiento CAE: {factura.vencimiento_cae.strftime('%d/%m/%Y')}")
    y -= 25
    
    # ===== DATOS DEL CLIENTE =====
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "DATOS DEL CLIENTE")
    y -= 20
    c.setFont("Helvetica", 10)
    
    tipo_doc_map = {80: "CUIT", 96: "DNI", 99: "Consumidor Final"}
    tipo_doc_nombre = tipo_doc_map.get(factura.tipo_doc_receptor, "Documento")
    c.drawString(50, y, f"{tipo_doc_nombre}: {factura.nro_doc_receptor}")
    y -= 25
    
    # ===== DETALLE DE LA OPERACIÓN =====
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y, "DETALLE DE LA OPERACIÓN")
    y -= 20
    
    if conceptos and len(conceptos) > 0:
        # Encabezado de tabla
        c.setFont("Helvetica-Bold", 9)
        c.drawString(50, y, "Descripción")
        c.drawString(300, y, "Cant.")
        c.drawString(350, y, "P. Unit.")
        c.drawString(420, y, "Subtotal")
        y -= 15
        
        # Items
        c.setFont("Helvetica", 9)
        for concepto in conceptos:
            desc = concepto.get('descripcion', '')[:40]  # Limitar longitud
            cant = concepto.get('cantidad', 1)
            precio = concepto.get('precio_unitario', 0)
            subtotal = concepto.get('subtotal', 0)
            
            c.drawString(50, y, desc)
            c.drawString(300, y, f"{cant:.2f}")
            c.drawString(350, y, f"${precio:.2f}")
            c.drawString(420, y, f"${subtotal:.2f}")
            y -= 12
        y -= 10
    else:
        c.setFont("Helvetica", 10)
        c.drawString(50, y, "Venta general")
        y -= 20
    
    # ===== TOTALES =====
    c.setFont("Helvetica-Bold", 11)
    c.drawString(300, y, "Neto:")
    c.drawString(420, y, f"${float(factura.importe_neto):.2f}")
    y -= 15
    c.drawString(300, y, "IVA:")
    c.drawString(420, y, f"${float(factura.importe_iva):.2f}")
    y -= 15
    c.setFont("Helvetica-Bold", 13)
    c.drawString(300, y, "TOTAL:")
    c.drawString(420, y, f"${float(factura.importe_total):.2f}")
    y -= 30
    
    # ===== CÓDIGO QR =====
    if factura.qr_url_afip:
        c.setFont("Helvetica", 8)
        c.drawString(50, y, "Código QR AFIP:")
        y -= 12
        # Aquí se puede agregar el QR real con qrcode + reportlab
        c.drawString(50, y, factura.qr_url_afip[:80])
        y -= 12
        if len(factura.qr_url_afip) > 80:
            c.drawString(50, y, factura.qr_url_afip[80:])
    
    # Finalizar PDF
    c.showPage()
    c.save()
    
    buffer.seek(0)
    return buffer.getvalue()


@router.get("/{factura_id}/pdf")
async def descargar_comprobante_pdf(
    factura_id: int,
    usuario: Usuario = Depends(obtener_usuario_actual)
):
    """
    Genera y descarga el PDF del comprobante fiscal
    """
    db = SessionLocal()
    try:
        # Obtener la factura
        factura = db.query(FacturaElectronica).filter(FacturaElectronica.id == factura_id).first()
        
        if not factura:
            raise HTTPException(status_code=404, detail="Factura no encontrada")
        
        # Obtener conceptos si existen (desde raw_response o buscar en BD)
        conceptos = []
        # TODO: Obtener conceptos de la venta original si están disponibles
        
        # Generar PDF
        pdf_bytes = generar_pdf_comprobante(factura, conceptos)
        
        # Nombre del archivo
        filename = f"comprobante_{factura.punto_venta}_{factura.numero_comprobante}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"Error generando PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")
    finally:
        db.close()
