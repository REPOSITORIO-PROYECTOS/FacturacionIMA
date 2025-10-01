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

# QR Code para generar imagen del código QR
try:
    import qrcode
    from reportlab.lib.utils import ImageReader
    QR_AVAILABLE = True
except ImportError:
    QR_AVAILABLE = False

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/comprobantes", tags=["comprobantes"])

def generar_pdf_comprobante(factura: FacturaElectronica, conceptos: list = None) -> bytes:
    """
    Genera un PDF del comprobante fiscal estilo ticket térmico de 50mm
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("ReportLab no está instalado. Ejecute: pip install reportlab")
    
    buffer = BytesIO()
    
    # Tamaño ticket: 50mm de ancho (142 puntos), altura variable
    ticket_width = 50 * mm  # 50mm ≈ 142 puntos
    ticket_height = 297 * mm  # A4 height como máximo
    
    c = canvas.Canvas(buffer, pagesize=(ticket_width, ticket_height))
    
    # Márgenes
    margin_left = 3 * mm
    margin_right = 3 * mm
    usable_width = ticket_width - margin_left - margin_right
    
    # Posición inicial (desde arriba)
    y = ticket_height - 10 * mm
    
    # Función auxiliar para texto centrado
    def draw_centered(text, y_pos, font_name="Helvetica", font_size=8):
        c.setFont(font_name, font_size)
        text_width = c.stringWidth(text, font_name, font_size)
        x_centered = margin_left + (usable_width - text_width) / 2
        c.drawString(x_centered, y_pos, text)
        return y_pos
    
    # Función auxiliar para texto izquierda
    def draw_left(text, y_pos, font_name="Helvetica", font_size=7):
        c.setFont(font_name, font_size)
        c.drawString(margin_left, y_pos, text)
        return y_pos
    
    # Función auxiliar para línea separadora
    def draw_separator(y_pos):
        c.line(margin_left, y_pos, ticket_width - margin_right, y_pos)
        return y_pos - 2 * mm
    
    # ===== ENCABEZADO =====
    y = draw_centered("SKAL FAM", y, "Helvetica-Bold", 10)
    y -= 4 * mm
    
    y = draw_centered(f"CUIT: {factura.cuit_emisor}", y, "Helvetica", 7)
    y -= 3 * mm
    
    y = draw_centered("RESPONSABLE INSCRIPTO", y, "Helvetica", 6)
    y -= 3 * mm
    
    y = draw_centered(f"Punto de Venta: {str(factura.punto_venta).zfill(4)}", y, "Helvetica", 7)
    y -= 5 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== TIPO DE COMPROBANTE =====
    tipo_map = {1: "FACTURA A", 6: "FACTURA B", 11: "FACTURA C"}
    tipo_nombre = tipo_map.get(factura.tipo_comprobante, f"Tipo {factura.tipo_comprobante}")
    y = draw_centered(tipo_nombre, y, "Helvetica-Bold", 11)
    y -= 5 * mm
    
    # Número de comprobante
    numero_completo = f"{str(factura.punto_venta).zfill(4)}-{str(factura.numero_comprobante).zfill(8)}"
    y = draw_centered(f"Nro: {numero_completo}", y, "Helvetica-Bold", 9)
    y -= 4 * mm
    
    # Fecha
    y = draw_centered(f"Fecha: {factura.fecha_comprobante.strftime('%d/%m/%Y %H:%M')}", y, "Helvetica", 7)
    y -= 5 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== CLIENTE =====
    tipo_doc_map = {80: "CUIT", 96: "DNI", 99: "CF"}
    tipo_doc_nombre = tipo_doc_map.get(factura.tipo_doc_receptor, "Doc")
    y = draw_left(f"{tipo_doc_nombre}: {factura.nro_doc_receptor}", y, "Helvetica", 7)
    y -= 5 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== DETALLE DE PRODUCTOS =====
    y = draw_centered("DETALLE", y, "Helvetica-Bold", 8)
    y -= 3 * mm
    
    if conceptos and len(conceptos) > 0:
        for concepto in conceptos:
            desc = concepto.get('descripcion', '')
            cant = concepto.get('cantidad', 1)
            precio = concepto.get('precio_unitario', 0)
            subtotal = concepto.get('subtotal', 0)
            
            # Descripción (puede ocupar 2 líneas si es larga)
            if len(desc) > 25:
                y = draw_left(desc[:25], y, "Helvetica", 7)
                y -= 3 * mm
                y = draw_left(desc[25:50], y, "Helvetica", 7)
                y -= 3 * mm
            else:
                y = draw_left(desc, y, "Helvetica", 7)
                y -= 3 * mm
            
            # Cantidad x Precio = Subtotal
            detalle_linea = f"{cant:.2f} x ${precio:.2f} = ${subtotal:.2f}"
            y = draw_left(detalle_linea, y, "Helvetica", 7)
            y -= 4 * mm
    else:
        y = draw_left("Venta general", y, "Helvetica", 7)
        y -= 4 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== TOTALES =====
    y = draw_left(f"Neto:  $ {float(factura.importe_neto):.2f}", y, "Helvetica", 8)
    y -= 3 * mm
    
    y = draw_left(f"IVA:   $ {float(factura.importe_iva):.2f}", y, "Helvetica", 8)
    y -= 4 * mm
    
    y = draw_left(f"TOTAL: $ {float(factura.importe_total):.2f}", y, "Helvetica-Bold", 10)
    y -= 5 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== CAE =====
    y = draw_left(f"CAE: {factura.cae}", y, "Helvetica", 6)
    y -= 3 * mm
    
    y = draw_left(f"Venc: {factura.vencimiento_cae.strftime('%d/%m/%Y')}", y, "Helvetica", 6)
    y -= 5 * mm
    
    # ===== CÓDIGO QR =====
    if factura.qr_url_afip and QR_AVAILABLE:
        try:
            # Generar código QR
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=2,
                border=1,
            )
            qr.add_data(factura.qr_url_afip)
            qr.make(fit=True)
            
            # Crear imagen del QR
            qr_img = qr.make_image(fill_color="black", back_color="white")
            
            # Convertir a formato que ReportLab puede usar
            qr_buffer = BytesIO()
            qr_img.save(qr_buffer, format='PNG')
            qr_buffer.seek(0)
            
            # Dimensiones del QR (25mm x 25mm centrado)
            qr_size = 25 * mm
            qr_x = margin_left + (usable_width - qr_size) / 2
            
            # Dibujar QR centrado
            c.drawImage(ImageReader(qr_buffer), qr_x, y - qr_size, 
                       width=qr_size, height=qr_size)
            y -= qr_size + 3 * mm
            
            y = draw_centered("Verificá en QR.AFIP.GOB.AR", y, "Helvetica", 5)
            y -= 5 * mm
            
        except Exception as e:
            logger.warning(f"Error generando QR: {e}")
            # Fallback: mostrar URL como texto
            y = draw_left("QR AFIP:", y, "Helvetica", 6)
            y -= 3 * mm
            # Dividir URL en líneas
            url = factura.qr_url_afip
            chunk_size = 30
            for i in range(0, len(url), chunk_size):
                y = draw_left(url[i:i+chunk_size], y, "Helvetica", 5)
                y -= 2.5 * mm
            y -= 3 * mm
    
    y = draw_separator(y)
    y -= 2 * mm
    
    y = draw_centered("¡Gracias por su compra!", y, "Helvetica-Bold", 7)
    
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
