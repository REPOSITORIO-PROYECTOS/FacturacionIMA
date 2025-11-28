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

@router.get("/test/sheets-cliente/{ingreso_id}")
async def test_sheets_cliente(
    ingreso_id: str
):
    """
    Test para verificar si se pueden obtener datos del cliente desde Google Sheets
    """
    resultado = {
        "ingreso_id": ingreso_id,
        "sheets_disponible": False,
        "cliente_encontrado": False,
        "datos_cliente": None,
        "cajero_encontrado": False,
        "datos_cajero": None,
        "error": None
    }
    
    try:
        from backend.utils.tablasHandler import TablasHandler
        sheets_handler = TablasHandler()
        resultado["sheets_disponible"] = True
        
        # Obtener datos del ingreso desde Google Sheets
        ingresos_data = sheets_handler.cargar_ingresos()
        
        if ingresos_data:
            logger.info(f"Sheets cargados: {len(ingresos_data)} registros")
            
            # Buscar el ingreso por ID
            for ingreso in ingresos_data:
                if str(ingreso.get('ID Ingresos', '')) == str(ingreso_id):
                    logger.info(f"Ingreso encontrado: {ingreso}")
                    
                    # Extraer nombre del cliente
                    nombre_cliente = (ingreso.get('Razon Social') or 
                                    ingreso.get('cliente') or
                                    ingreso.get('nombre') or
                                    ingreso.get('Cliente'))
                    
                    if nombre_cliente:
                        resultado["cliente_encontrado"] = True
                        resultado["datos_cliente"] = {
                            "nombre": nombre_cliente,
                            "razon_social": ingreso.get('Razon Social'),
                            "cliente": ingreso.get('cliente'),
                            "nombre_campo": ingreso.get('nombre'),
                            "Cliente": ingreso.get('Cliente')
                        }
                    
                    # Extraer cajero/repartidor
                    cajero_nombre = (ingreso.get('Repartidor') or
                                   ingreso.get('repartidor') or
                                   ingreso.get('cajero') or
                                   ingreso.get('vendedor') or
                                   ingreso.get('operador'))
                    
                    if cajero_nombre:
                        resultado["cajero_encontrado"] = True
                        resultado["datos_cajero"] = {
                            "nombre": cajero_nombre,
                            "Repartidor": ingreso.get('Repartidor'),
                            "repartidor": ingreso.get('repartidor'),
                            "cajero": ingreso.get('cajero'),
                            "vendedor": ingreso.get('vendedor'),
                            "operador": ingreso.get('operador')
                        }
                    
                    break
            else:
                resultado["error"] = f"No se encontró ingreso con ID {ingreso_id}"
        else:
            resultado["error"] = "No se pudieron cargar datos de Google Sheets"
            
    except Exception as e:
        resultado["error"] = str(e)
        logger.error(f"Error en test de Google Sheets: {e}", exc_info=True)
    
    return resultado

def generar_pdf_comprobante(factura: FacturaElectronica, conceptos: list = None) -> bytes:
    """
    Genera un PDF del comprobante fiscal estilo ticket térmico de 50mm
    """
    if not REPORTLAB_AVAILABLE:
        raise RuntimeError("ReportLab no está instalado. Ejecute: pip install reportlab")
    
    # Función para formatear números en formato argentino (coma decimal, punto miles)
    def format_number(value):
        if isinstance(value, (int, float)):
            s = "{:.2f}".format(value).replace('.', ',')
            if ',' in s:
                int_part, dec_part = s.split(',')
            else:
                int_part = s
                dec_part = '00'
            # Agregar puntos cada 3 dígitos en la parte entera
            rev = int_part[::-1]
            with_dots = '.'.join([rev[i:i+3] for i in range(0, len(rev), 3)])
            final_int = with_dots[::-1]
            return final_int + ',' + dec_part
        return str(value)
    
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
    
    # ===== CARGAR DATOS DEL EMISOR =====
    # Intentar cargar datos desde el archivo de configuración del emisor
    emisor_data = {
        "nombre_fantasia": "SKAL FAM",
        "razon_social": "SKAL FAM DISTRIBUCIONES S. A. S.",
        "direccion": "Las Chacritas, San Juan",
        "fecha_inicio": "01/01/2024",
        "nro_ingresos_brutos": "30718331680",
        "telefono": "+54 264 5704748"
    }
    
    # Intentar cargar desde archivo JSON si existe
    try:
        import json
        import os
        boveda_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'boveda_afip_temporal')
        emisor_file = os.path.join(boveda_path, f'emisor_{factura.cuit_emisor.strip()}.json')
        if os.path.exists(emisor_file):
            with open(emisor_file, 'r', encoding='utf-8') as f:
                file_data = json.load(f)
                if file_data:
                    emisor_data.update({
                        "nombre_fantasia": file_data.get('nombre_fantasia', emisor_data["nombre_fantasia"]),
                        "razon_social": file_data.get('razon_social', emisor_data["razon_social"]),
                        "direccion": file_data.get('direccion', emisor_data["direccion"]),
                        "fecha_inicio": file_data.get('Fecha Inicio', emisor_data["fecha_inicio"]),
                        "nro_ingresos_brutos": file_data.get('Nro Ingresos Brutos', emisor_data["nro_ingresos_brutos"]),
                        "telefono": file_data.get('telefono', emisor_data["telefono"])
                    })
    except Exception as e:
        logger.warning(f"No se pudo cargar datos del emisor: {e}")
    
    # ===== ENCABEZADO =====
    y = draw_centered(emisor_data["nombre_fantasia"], y, "Helvetica-Bold", 10)
    y -= 4 * mm
    
    y = draw_centered(f"CUIT: {factura.cuit_emisor}", y, "Helvetica", 7)
    y -= 3 * mm
    
    y = draw_centered("RESPONSABLE INSCRIPTO", y, "Helvetica", 6)
    y -= 3 * mm
    
    # Dirección del emisor
    y = draw_centered(emisor_data["direccion"], y, "Helvetica", 6)
    y -= 3 * mm
    
    # Teléfono
    y = draw_centered(emisor_data["telefono"], y, "Helvetica", 6)
    y -= 3 * mm
    
    # Inicio de actividades
    y = draw_centered(f"Inicio Act.: {emisor_data['fecha_inicio']}", y, "Helvetica", 6)
    y -= 3 * mm
    
    # Ingresos Brutos
    y = draw_centered(f"IIBB: {emisor_data['nro_ingresos_brutos']}", y, "Helvetica", 6)
    y -= 3 * mm
    
    y = draw_centered(f"Punto de Venta: {str(factura.punto_venta).zfill(4)}", y, "Helvetica", 7)
    y -= 5 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== TIPO DE COMPROBANTE =====
    # Determinar el tipo basado en el cliente y el tipo de factura
    tipo_map = {1: "FACTURA A", 6: "FACTURA B", 11: "FACTURA C"}
    tipo_base = tipo_map.get(factura.tipo_comprobante, f"Tipo {factura.tipo_comprobante}")
    
    # Si no es consumidor final (tiene CUIT), mostrar como FACTURA A
    es_consumidor_final_check = (factura.tipo_doc_receptor == 99 and factura.nro_doc_receptor == 0)
    if not es_consumidor_final_check and factura.tipo_doc_receptor == 80:  # CUIT
        tipo_nombre = "FACTURA A"
    else:
        tipo_nombre = tipo_base
    
    y = draw_centered(tipo_nombre, y, "Helvetica-Bold", 11)
    y -= 5 * mm
    
    # Número de comprobante
    numero_completo = f"{str(factura.punto_venta).zfill(4)}-{str(factura.numero_comprobante).zfill(8)}"
    y = draw_centered(f"Nro: {numero_completo}", y, "Helvetica-Bold", 9)
    y -= 4 * mm
    
    try:
        import json as _json
        fecha_text = None
        if factura.raw_response:
            try:
                rawd = _json.loads(factura.raw_response)
                fc = rawd.get('fecha_comprobante')
                if isinstance(fc, str) and fc:
                    try:
                        from datetime import datetime as _dt
                        fecha_dt = _dt.fromisoformat(fc)
                        fecha_text = fecha_dt.strftime('%d/%m/%Y %H:%M')
                    except Exception:
                        fecha_text = fc
            except Exception:
                fecha_text = None
        if not fecha_text:
            from datetime import datetime as _dt, time as _time
            try:
                fecha_dt2 = _dt.combine(factura.fecha_comprobante, _dt.now().time())
                fecha_text = fecha_dt2.strftime('%d/%m/%Y %H:%M')
            except Exception:
                fecha_text = _dt.now().strftime('%d/%m/%Y %H:%M')
        y = draw_centered(f"Fecha: {fecha_text}", y, "Helvetica", 7)
    except Exception:
        from datetime import datetime as _dt
        y = draw_centered(f"Fecha: {_dt.now().strftime('%d/%m/%Y %H:%M')}", y, "Helvetica", 7)
    y -= 5 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== CLIENTE =====
    # Determinar si es consumidor final o cliente con datos
    es_consumidor_final = (factura.tipo_doc_receptor == 99 and factura.nro_doc_receptor == 0)
    
    if es_consumidor_final:
        # Consumidor final
        y = draw_centered("CLIENTE FINAL", y, "Helvetica-Bold", 8)
        y -= 5 * mm
    else:
        # Cliente con datos específicos - mostrar CUIT/DNI y nombre si está disponible
        tipo_doc_map = {80: "CUIT", 96: "DNI", 99: "CF"}
        tipo_doc_nombre = tipo_doc_map.get(factura.tipo_doc_receptor, "Doc")
        
        # Mostrar documento
        y = draw_left(f"{tipo_doc_nombre}: {factura.nro_doc_receptor}", y, "Helvetica", 7)
        y -= 3 * mm
        
        # Intentar obtener nombre del cliente desde múltiples fuentes
        nombre_cliente = None
        try:
            import json
            
            # 1. Buscar en raw_response de la factura
            if factura.raw_response:
                raw_data = json.loads(factura.raw_response)
                nombre_cliente = (raw_data.get('cliente_nombre') or 
                                raw_data.get('nombre_cliente') or 
                                raw_data.get('razon_social') or
                                raw_data.get('cliente_data', {}).get('nombre_razon_social'))
            
            # 2. Si no se encontró, buscar en Google Sheets usando ingreso_id
            if not nombre_cliente and factura.ingreso_id:
                try:
                    from backend.utils.tablasHandler import TablasHandler
                    sheets_handler = TablasHandler()
                    
                    # Obtener datos del ingreso desde Google Sheets
                    ingresos_data = sheets_handler.cargar_ingresos()
                    if ingresos_data:
                        # Buscar el ingreso por ID
                        ingreso_encontrado = None
                        for ingreso in ingresos_data:
                            if str(ingreso.get('ID Ingresos', '')) == str(factura.ingreso_id):
                                ingreso_encontrado = ingreso
                                break
                        
                        if ingreso_encontrado:
                            # Extraer nombre del cliente desde diferentes campos posibles
                            nombre_cliente = (ingreso_encontrado.get('Razon Social') or 
                                            ingreso_encontrado.get('cliente') or
                                            ingreso_encontrado.get('nombre') or
                                            ingreso_encontrado.get('Cliente'))
                            
                            # Extraer CUIT del cliente si está disponible
                            cuit_cliente = (ingreso_encontrado.get('CUIT') or
                                          ingreso_encontrado.get('cuit') or
                                          ingreso_encontrado.get('Cuit') or
                                          ingreso_encontrado.get('cuit_cliente'))
                            
                            logger.info(f"Cliente encontrado en Sheets para ingreso {factura.ingreso_id}: {nombre_cliente}, CUIT: {cuit_cliente}")
                    
                except Exception as sheet_error:
                    logger.warning(f"Error buscando cliente en Google Sheets: {sheet_error}")
                    
        except Exception as e:
            logger.warning(f"Error obteniendo datos del cliente: {e}")
        
        if nombre_cliente:
            # Si el nombre es muy largo, dividirlo en dos líneas
            if len(nombre_cliente) > 25:
                y = draw_left(nombre_cliente[:25], y, "Helvetica", 7)
                y -= 3 * mm
                y = draw_left(nombre_cliente[25:50], y, "Helvetica", 7)
                y -= 3 * mm
            else:
                y = draw_left(nombre_cliente, y, "Helvetica", 7)
                y -= 3 * mm
            
            # Mostrar CUIT del cliente si está disponible desde Google Sheets
            if 'cuit_cliente' in locals() and cuit_cliente:
                y = draw_left(f"CUIT Cliente: {cuit_cliente}", y, "Helvetica", 6)
                y -= 3 * mm
        
        y -= 2 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    # ===== DETALLE DE PRODUCTOS =====
    y = draw_centered("DETALLE", y, "Helvetica-Bold", 8)
    y -= 3 * mm
    
    # Desglose especial 77/21 centrado dentro de DETALLE (por cliente)
    aplicar_especial = False
    try:
        import json as _json
        if factura.raw_response:
            raw = _json.loads(factura.raw_response)
            aplicar_especial = bool(raw.get('aplicar_desglose_77') or raw.get('datos_factura', {}).get('aplicar_desglose_77'))
    except Exception:
        aplicar_especial = False

    if not aplicar_especial:
        try:
            from sqlmodel import select
            from backend.database import SessionLocal
            from backend.modelos import Empresa, ConfiguracionEmpresa
            db = SessionLocal()
            try:
                empresa = db.exec(select(Empresa).where(Empresa.cuit == str(factura.cuit_emisor))).first()
                if empresa:
                    conf = db.exec(select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == empresa.id)).first()
                    aplicar_especial = bool(conf and conf.aplicar_desglose_77)
            finally:
                db.close()
        except Exception:
            aplicar_especial = False

    if aplicar_especial:
        total_val = float(factura.importe_total)
        titulo_detalle = "Cigarrillos"
        try:
            import json as _json
            detalle_empresa_txt = None
            if factura.raw_response:
                raw = _json.loads(factura.raw_response)
                detalle_empresa_txt = raw.get('detalle_empresa') or raw.get('datos_factura', {}).get('detalle_empresa')
            if not detalle_empresa_txt:
                from sqlmodel import select
                from backend.database import SessionLocal
                from backend.modelos import Empresa, ConfiguracionEmpresa
                db = SessionLocal()
                try:
                    empresa = db.exec(select(Empresa).where(Empresa.cuit == str(factura.cuit_emisor))).first()
                    if empresa:
                        conf = db.exec(select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == empresa.id)).first()
                        if conf and conf.detalle_empresa_text:
                            titulo_detalle = conf.detalle_empresa_text
                finally:
                    db.close()
            else:
                titulo_detalle = detalle_empresa_txt
        except Exception:
            pass

        y = draw_left(titulo_detalle, y, "Helvetica-Bold", 8)
        y -= 3 * mm
        y = draw_left("~--------------------------------", y, "Helvetica", 7)
        y -= 3 * mm
        y = draw_left("Desglose", y, "Helvetica", 7)
        y -= 3 * mm
        setenta_y_siete = round(total_val * 0.77, 2)
        costo_mas_iva = round(total_val - setenta_y_siete, 2)
        neto_21 = round(costo_mas_iva / 1.21, 2)
        iva_21 = round(costo_mas_iva - neto_21, 2)
 
        y = draw_left(f"- Neto: $ {format_number(neto_21)}", y, "Helvetica", 7)
        y -= 3 * mm
        y = draw_left(f"- IVA: $ {format_number(iva_21)}", y, "Helvetica", 7)
        y -= 4 * mm
        y = draw_left(f"- Impuesto Interno: $ {format_number(setenta_y_siete)}", y, "Helvetica", 7)
        y -= 3 * mm
        y = draw_left(f"TOTAL: $ {format_number(total_val)}", y, "Helvetica-Bold", 9)
        y -= 4 * mm
    else:
        if conceptos and len(conceptos) > 0:
            for concepto in conceptos:
                desc = concepto.get('descripcion', '')
                cant = concepto.get('cantidad', 1)
                precio = concepto.get('precio_unitario', 0)
                subtotal = concepto.get('subtotal', 0)
                
                if len(desc) > 25:
                    y = draw_left(desc[:25], y, "Helvetica", 7)
                    y -= 3 * mm
                    y = draw_left(desc[25:50], y, "Helvetica", 7)
                    y -= 3 * mm
                else:
                    y = draw_left(desc, y, "Helvetica", 7)
                    y -= 3 * mm
                
                detalle_linea = f"{cant:.2f} x ${format_number(precio)} = ${format_number(subtotal)}"
                y = draw_left(detalle_linea, y, "Helvetica", 7)
                y -= 4 * mm
        else:
            y = draw_left("Productos varios", y, "Helvetica", 7)
            y -= 4 * mm
    
    y = draw_separator(y)
    y -= 3 * mm
    
    if not aplicar_especial:
        y = draw_left(f"Neto:  $ {format_number(float(factura.importe_neto))}", y, "Helvetica", 8)
        y -= 3 * mm
        y = draw_left(f"IVA:   $ {format_number(float(factura.importe_iva))}", y, "Helvetica", 8)
        y -= 4 * mm
        y = draw_left(f"TOTAL: $ {format_number(float(factura.importe_total))}", y, "Helvetica-Bold", 10)
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
    
    # ===== CAJERO/VENDEDOR =====
    # Intentar obtener información del cajero/vendedor desde múltiples fuentes
    cajero_nombre = None
    try:
        import json
        
        # 1. Buscar en raw_response de la factura
        if factura.raw_response:
            raw_data = json.loads(factura.raw_response)
            cajero_nombre = (raw_data.get('cajero') or 
                           raw_data.get('vendedor') or 
                           raw_data.get('usuario') or
                           raw_data.get('repartidor') or
                           raw_data.get('operador'))
        
        # 2. Si no se encontró, buscar en Google Sheets usando ingreso_id
        if not cajero_nombre and factura.ingreso_id:
            try:
                from backend.utils.tablasHandler import TablasHandler
                sheets_handler = TablasHandler()
                
                # Obtener datos del ingreso desde Google Sheets
                ingresos_data = sheets_handler.cargar_ingresos()
                if ingresos_data:
                    # Buscar el ingreso por ID
                    for ingreso in ingresos_data:
                        if str(ingreso.get('ID Ingresos', '')) == str(factura.ingreso_id):
                            # Buscar repartidor/cajero en diferentes campos
                            cajero_nombre = (ingreso.get('Repartidor') or
                                           ingreso.get('repartidor') or
                                           ingreso.get('cajero') or
                                           ingreso.get('vendedor') or
                                           ingreso.get('operador'))
                            
                            if cajero_nombre:
                                logger.info(f"Cajero encontrado en Sheets para ingreso {factura.ingreso_id}: {cajero_nombre}")
                            break
            except Exception as sheet_error:
                logger.warning(f"Error buscando cajero en Google Sheets: {sheet_error}")
                
    except Exception as e:
        logger.warning(f"Error obteniendo datos del cajero: {e}")
    
    if cajero_nombre:
        y = draw_centered(f"Cajero: {cajero_nombre}", y, "Helvetica", 6)
        y -= 4 * mm
    else:
        # Fallback: mostrar cajero genérico
        y = draw_centered("Cajero: [Operador]", y, "Helvetica", 6)
        y -= 4 * mm
    
    y = draw_separator(y)
    y -= 2 * mm
    
    # ===== INFORMACIÓN LEGAL OBLIGATORIA =====
    y = draw_centered("Defensa del Consumidor", y, "Helvetica-Bold", 6)
    y -= 2.5 * mm
    
    y = draw_centered("0800-333-6634", y, "Helvetica", 6)
    y -= 4 * mm
    
    # Régimen de Transparencia Fiscal (texto dividido en líneas)
    y = draw_centered("Régimen de Transparencia", y, "Helvetica", 5)
    y -= 2.5 * mm
    y = draw_centered("Fiscal al Consumidor", y, "Helvetica", 5)
    y -= 2.5 * mm
    y = draw_centered("Ley 27.743", y, "Helvetica", 5)
    y -= 5 * mm
    
    y = draw_centered("¡Gracias por su compra!", y, "Helvetica-Bold", 7)
    y -= 4 * mm
    y = draw_separator(y)
    y -= 3 * mm
    y = draw_centered(f"TOTAL: $ {format_number(float(factura.importe_total))}", y, "Helvetica-Bold", 10)
    
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
