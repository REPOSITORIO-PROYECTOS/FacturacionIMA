import logging
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import json  # NUEVO
import base64 # NUEVO
import qrcode # NUEVO
from io import BytesIO # NUEVO


try:
    # --- Importaciones de tu aplicación ---
    from .afipTools import generar_factura_para_venta, ReceptorData
    from .tablasHandler import TablasHandler
    # --- NUEVO: Importaciones para la Base de Datos ---
    from backend.database import SessionLocal  # Asume que tienes un `database.py` que crea la sesión
    from backend.modelos import FacturaElectronica  # Asume que tienes un `models.py` con tu tabla de facturas
except ImportError as e:
    logging.critical(f"ERROR CRÍTICO: No se pudo importar un módulo necesario (afipTools, tablasHandler, database, o models): {e}")
    raise

# --- Importación de Tenacity ---
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    before_log,
    after_log,
    retry_if_exception_type
)

# --- Configuración de Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ==============================================================================
# NUEVA FUNCIÓN PARA GENERAR EL QR
# ==============================================================================
def generar_qr_afip(afip_data: Dict[str, Any]) -> tuple[str | None, str | None]:
    """
    Genera la URL de AFIP para el QR y la imagen del QR como Data URL.

    Args:
        afip_data: El diccionario con la respuesta de una facturación exitosa de AFIP.

    Returns:
        Una tupla conteniendo:
        - La URL base para el QR (para guardar en la BD).
        - La imagen del QR como un string Data URL (para enviar al frontend).
        O (None, None) si faltan datos.
    """
    try:
        # 1. Armar el objeto JSON con los datos requeridos por AFIP
        datos_para_qr = {
            "ver": 1,
            "fecha": afip_data["fecha_comprobante"].strftime("%Y-%m-%d"),
            "cuit": int(afip_data["cuit_emisor"]),
            "ptoVta": int(afip_data["punto_venta"]),
            "tipoCmp": int(afip_data["tipo_comprobante"]),
            "nroCmp": int(afip_data["numero_comprobante"]),
            "importe": float(afip_data["importe_total"]),
            "moneda": "PES",
            "ctz": 1,
            "tipoDocRec": int(afip_data["tipo_doc_receptor"]),
            "nroDocRec": int(afip_data["nro_doc_receptor"]),
            "tipoCodAut": "E",
            "codAut": int(afip_data["cae"])
        }

        # 2. Convertir a JSON string y luego a Base64
        json_string = json.dumps(datos_para_qr)
        datos_base64 = base64.b64encode(json_string.encode('utf-8')).decode('utf-8')

        # 3. Armar la URL final de AFIP
        url_para_qr = f"https://www.afip.gob.ar/fe/qr/?p={datos_base64}"

        # 4. Generar la imagen del QR y convertirla a Data URL
        img = qrcode.make(url_para_qr)
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        qr_data_url = f"data:image/png;base64,{img_str}"

        return url_para_qr, qr_data_url

    except (KeyError, TypeError) as e:
        logger.error(f"Error generando QR: Faltan datos en la respuesta de AFIP. Error: {e}", exc_info=True)
        return None, None
    except Exception as e:
        logger.error(f"Error inesperado al generar el QR: {e}", exc_info=True)
        return None, None
# ==============================================================================

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before=before_log(logger, logging.DEBUG),
    after=after_log(logger, logging.WARNING),
    retry=(
        retry_if_exception_type(requests.exceptions.ConnectionError) |
        retry_if_exception_type(requests.exceptions.Timeout) |
        retry_if_exception_type(requests.exceptions.HTTPError)
    ),
    reraise=True
)
def _attempt_generate_invoice(total: float, cliente_data: ReceptorData, invoice_id: str) -> Dict[str, Any]:
    logger.debug(f"[{invoice_id}] Intentando facturar (Total: {total}, CUIT/DNI: {cliente_data.cuit_o_dni})...")
    afip_result = generar_factura_para_venta(total=total, cliente_data=cliente_data)
    logger.info(f"[{invoice_id}] Factura generada exitosamente. CAE: {afip_result.get('cae')}")
    return afip_result

def process_invoice_batch_for_endpoint(
    invoices_payload: List[Dict[str, Any]],
    max_workers: int = 5
) -> List[Dict[str, Any]]:
    
    logger.info(f"Endpoint: Recibido lote de {len(invoices_payload)} facturas para procesamiento con {max_workers} workers.")

    try:
        sheets_handler = TablasHandler()
        logger.info("Handler de Google Sheets inicializado correctamente.")
    except Exception as e:
        logger.error(f"No se pudo inicializar TablasHandler para Google Sheets: {e}", exc_info=True)
        sheets_handler = None

    db = SessionLocal()
    results_for_response: List[Dict[str, Any]] = []

    try:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures_map = {}
            for original_invoice_data in invoices_payload:
                # ... (código de validación de `total` y `cliente_data` sin cambios)
                invoice_id = original_invoice_data.get("id", f"batch_{len(futures_map)}")
                total = original_invoice_data.get("total")

                if total is None:
                    logger.error(f"[{invoice_id}] Factura sin 'total'. No se procesará.")
                    results_for_response.append({
                        "id": invoice_id,
                        "status": "FAILED",
                        "error": "Campo 'total' es requerido y faltante.",
                        "original_data": original_invoice_data
                    })
                    continue

                try:
                    cliente_data_dict = original_invoice_data["cliente_data"]
                    cliente_data = ReceptorData(
                        cuit_o_dni=cliente_data_dict["cuit_o_dni"],
                        nombre_razon_social=cliente_data_dict.get("nombre_razon_social"),
                        domicilio=cliente_data_dict.get("domicilio"),
                        condicion_iva=cliente_data_dict["condicion_iva"]
                    )
                except (KeyError, TypeError) as e:
                    logger.error(f"[{invoice_id}] Datos de cliente_data incompletos o inválidos: {e}. No se procesará esta factura.")
                    results_for_response.append({
                        "id": invoice_id,
                        "status": "FAILED",
                        "error": f"Datos de cliente_data incompletos o inválidos: {e}",
                        "original_data": original_invoice_data
                    })
                    continue

                future = executor.submit(_attempt_generate_invoice, total, cliente_data, invoice_id)
                futures_map[future] = {"id": invoice_id, "original_data": original_invoice_data}

            for future in as_completed(futures_map):
                context = futures_map[future]
                invoice_id = context["id"]
                original_invoice_data = context["original_data"]

                single_invoice_result = {
                    "id": invoice_id,
                    "original_data": original_invoice_data
                }

                try:
                    afip_data = future.result()
                    single_invoice_result.update({
                        "status": "SUCCESS",
                        "result": afip_data
                    })
                    logger.info(f"[{invoice_id}] Procesamiento de AFIP completado: SUCCESS")

                    # --- NUEVO: INICIO Bloque de generación de QR ---
                    qr_url, qr_data_url = generar_qr_afip(afip_data)
                    if qr_data_url:
                        single_invoice_result["result"]["qr_code"] = qr_data_url
                        logger.info(f"[{invoice_id}] Código QR generado exitosamente.")
                    else:
                        single_invoice_result["qr_generation_status"] = "FAILED"
                        logger.warning(f"[{invoice_id}] No se pudo generar el código QR.")
                    # --- NUEVO: FIN Bloque de generación de QR ---
                    
                    # --- 1. Guardar en la Base de Datos ---
                    try:
                        invoice_db = FacturaElectronica(
                            ingreso_id=str(invoice_id),
                            cae=afip_data.get("cae"),
                            numero_comprobante=afip_data.get("numero_comprobante"),
                            punto_venta=afip_data.get("punto_venta"),
                            tipo_comprobante=afip_data.get("tipo_comprobante"),
                            fecha_comprobante=afip_data.get("fecha_comprobante"),
                            vencimiento_cae=afip_data.get("vencimiento_cae"),
                            resultado_afip=afip_data.get("resultado"),
                            cuit_emisor=afip_data.get("cuit_emisor"),
                            tipo_doc_receptor=afip_data.get("tipo_doc_receptor"),
                            nro_doc_receptor=afip_data.get("nro_doc_receptor"),
                            importe_total=afip_data.get("importe_total"),
                            importe_neto=afip_data.get("neto"),
                            importe_iva=afip_data.get("iva"),
                            raw_response=afip_data,
                            qr_url_afip=qr_url  # NUEVO: Guardar la URL del QR
                        )
                        db.add(invoice_db)
                        db.commit()
                        db.refresh(invoice_db)
                        single_invoice_result["db_save_status"] = "SUCCESS"
                        logger.info(f"[{invoice_id}] Factura guardada en la base de datos con ID: {invoice_db.id}")

                    except Exception as db_error:
                        db.rollback()
                        single_invoice_result["db_save_status"] = "FAILED"
                        single_invoice_result["error_db"] = str(db_error)
                        logger.error(f"[{invoice_id}] ERROR al guardar en la base de datos: {db_error}", exc_info=True)

                    # --- 2. Actualizar Google Sheets (sin cambios) ---
                    if single_invoice_result.get("db_save_status") == "SUCCESS" and sheets_handler:
                        # ... (código de sheets sin cambios)
                        try:
                            update_success = sheets_handler.marcar_boleta_facturada(id_ingreso=str(invoice_id))
                            single_invoice_result["sheets_update_status"] = "SUCCESS" if update_success else "FAILED"
                            if update_success:
                                logger.info(f"[{invoice_id}] Boleta marcada exitosamente en Google Sheets.")
                            else:
                                logger.warning(f"[{invoice_id}] No se pudo marcar la boleta en Google Sheets.")
                        except Exception as sheets_error:
                            single_invoice_result["sheets_update_status"] = "ERROR"
                            single_invoice_result["error_sheets"] = str(sheets_error)
                            logger.error(f"[{invoice_id}] Excepción al marcar la boleta en Google Sheets: {sheets_error}", exc_info=True)
                    elif not sheets_handler:
                        single_invoice_result["sheets_update_status"] = "SKIPPED"


                except Exception as afip_error:
                    single_invoice_result.update({
                        "status": "FAILED",
                        "error": str(afip_error)
                    })
                    logger.warning(f"[{invoice_id}] Procesamiento de AFIP completado: FAILED. Error: {afip_error}")

                results_for_response.append(single_invoice_result)
    finally:
        db.close()
        logger.info("Sesión de base de datos cerrada.")

    logger.info(f"Endpoint: Procesamiento de lote finalizado. Total de resultados: {len(results_for_response)}")
    return results_for_response