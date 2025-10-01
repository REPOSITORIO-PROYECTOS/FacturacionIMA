import logging
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import json  # NUEVO
from .json_utils import default_json
import base64 # NUEVO
try:
    import qrcode  # NUEVO
except Exception:
    qrcode = None
from io import BytesIO # NUEVO
from datetime import datetime, date
from decimal import Decimal


try:
    # --- Importaciones de tu aplicación ---
    from .afipTools import generar_factura_para_venta, ReceptorData
    from .tablasHandler import TablasHandler
    # --- NUEVO: Importaciones para la Base de Datos ---
    from backend.database import SessionLocal  # Asume que tienes un `database.py` que crea la sesión
    from backend.modelos import FacturaElectronica  # Asume que tienes un `models.py` con tu tabla de facturas
except ImportError as e:
    # Algunos módulos son opcionales en entornos de demo; registrar y seguir adelante
    logging.critical(f"No se pudieron importar algunos módulos opcionales: {e} — continuando en modo degradado.")
    # Marcar objetos faltantes como None para no romper la importación del módulo.
    try:
        generar_factura_para_venta
    except NameError:
        generar_factura_para_venta = None
    try:
        ReceptorData
    except NameError:
        ReceptorData = None
    try:
        TablasHandler
    except NameError:
        TablasHandler = None
    try:
        SessionLocal
    except NameError:
        SessionLocal = None
    try:
        FacturaElectronica
    except NameError:
        FacturaElectronica = None

# --- Importación de Tenacity (reintentos en caso de errores de conexión transitorios) ---
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
        # fecha_comprobante puede ser str ISO o datetime/date
        fecha_val = afip_data.get("fecha_comprobante")
        if isinstance(fecha_val, str):
            try:
                fecha_str = fecha_val.split("T")[0]
            except Exception:
                fecha_str = fecha_val
        elif isinstance(fecha_val, (datetime, date)):
            fecha_str = fecha_val.strftime("%Y-%m-%d")
        else:
            fecha_str = datetime.now().strftime("%Y-%m-%d")

        datos_para_qr = {
            "ver": 1,
            "fecha": fecha_str,
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
        json_string = json.dumps(datos_para_qr, default=default_json)
        datos_base64 = base64.b64encode(json_string.encode('utf-8')).decode('utf-8')

        # 3. Armar la URL final de AFIP
        url_para_qr = f"https://www.afip.gob.ar/fe/qr/?p={datos_base64}"

        # 4. Generar la imagen del QR y convertirla a Data URL (si la dependencia está disponible)
        if qrcode is not None:
            img = qrcode.make(url_para_qr)
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
            qr_data_url = f"data:image/png;base64,{img_str}"
            return url_para_qr, qr_data_url
        else:
            # qrcode no está instalado; devolver solo la URL
            return url_para_qr, None

    except (KeyError, TypeError) as e:
        logger.error(f"Error generando QR: Faltan datos en la respuesta de AFIP. Error: {e}", exc_info=True)
        return None, None
    except Exception as e:
        logger.error(f"Error inesperado al generar el QR: {e}", exc_info=True)
        return None, None
# ==============================================================================

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=20),
    before=before_log(logger, logging.DEBUG),
    after=after_log(logger, logging.WARNING),
    retry=(
        retry_if_exception_type(requests.exceptions.ConnectionError) |
        retry_if_exception_type(requests.exceptions.Timeout) |
        retry_if_exception_type(requests.exceptions.HTTPError)
    ),
    reraise=True
)
def _attempt_generate_invoice(total: float, cliente_data: ReceptorData, invoice_id: str, emisor_cuit: str | None = None, tipo_forzado: int | None = None, conceptos: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    logger.debug(f"[{invoice_id}] Intentando facturar (Total: {total}, CUIT/DNI: {cliente_data.cuit_o_dni}, Conceptos: {len(conceptos) if conceptos else 0})...")
    try:
        afip_result = generar_factura_para_venta(total=total, cliente_data=cliente_data, emisor_cuit=emisor_cuit, tipo_forzado=tipo_forzado, conceptos=conceptos)
        logger.info(f"[{invoice_id}] Factura generada exitosamente. CAE: {afip_result.get('cae')}")
        return afip_result
    except Exception as e:
        # Si el error contiene indicios de problemas con AFIP/SSL/ConnectionReset, tratar como transitorio
        try:
            msg = str(e).lower()
            if any(x in msg for x in ("error interno del servidor", "connectionreset", "connection reset", "ssl", "unexpected eof", "ssLError".lower(), "sslexception")):
                logger.warning(f"[{invoice_id}] Error detectado como transitorio (AFIP/SSL) - provocando retry: {e}")
                # Lanzar ConnectionError para que tenacity reintente
                raise requests.exceptions.ConnectionError(e)
        except Exception:
            pass
        # No es un error transitorio que debamos reintentar: propagar
        logger.error(f"[{invoice_id}] Error no transitorio al facturar: {e}")
        raise

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

                emisor_cuit = original_invoice_data.get('emisor_cuit')
                tipo_forzado = original_invoice_data.get('tipo_forzado')
                conceptos = original_invoice_data.get('conceptos')  # Nuevo: obtener conceptos
                future = executor.submit(_attempt_generate_invoice, total, cliente_data, invoice_id, emisor_cuit, tipo_forzado, conceptos)
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
                    # Detectar mismatch entre tipo_forzado solicitado y tipo final
                    try:
                        if tipo_forzado is not None:
                            if int(afip_data.get('tipo_comprobante')) != int(tipo_forzado):
                                single_invoice_result['tipo_forzado_intentado'] = int(tipo_forzado)
                                single_invoice_result['tipo_mismatch'] = True
                            else:
                                single_invoice_result['tipo_forzado_intentado'] = int(tipo_forzado)
                                single_invoice_result['tipo_mismatch'] = False
                    except Exception:
                        pass
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
                        # Make a JSON-serializable copy of afip_data (convert datetimes to ISO strings)
                        def make_json_serializable(obj: Any) -> Any:
                            # Convierte recursivamente objetos que no son serializables por json.dumps
                            if isinstance(obj, dict):
                                return {k: make_json_serializable(v) for k, v in obj.items()}
                            if isinstance(obj, list):
                                return [make_json_serializable(x) for x in obj]
                            if isinstance(obj, (datetime, date)):
                                return obj.isoformat()
                            if isinstance(obj, Decimal):
                                # Convertir Decimal a float si es seguro; si no, a str
                                try:
                                    return float(obj)
                                except Exception:
                                    return str(obj)
                            if isinstance(obj, bytes):
                                return base64.b64encode(obj).decode('utf-8')
                            return obj

                        serializable_afip = make_json_serializable(afip_data)

                        # Force a round-trip through json to guarantee serializability
                        try:
                            raw_json_text = json.dumps(serializable_afip, ensure_ascii=False, default=default_json)
                            raw_response_final = json.loads(raw_json_text)
                        except Exception as ser_err:
                            logger.error(f"[{invoice_id}] Error serializando la respuesta de AFIP: {ser_err}")
                            # Fallback: store a minimal representation
                            raw_response_final = {"error_serializing_raw_response": str(ser_err), "original_keys": list(serializable_afip.keys()) if isinstance(serializable_afip, dict) else str(type(serializable_afip))}

                        def _normalize_date_field(value: Any):
                            # Acepta datetime, date, ISO strings, y devuelve date
                            if value is None:
                                return None
                            if isinstance(value, date) and not isinstance(value, datetime):
                                return value
                            if isinstance(value, datetime):
                                return value.date()
                            if isinstance(value, str):
                                # Intenta parsear ISO format (fecha o datetime)
                                try:
                                    # date.fromisoformat acepta 'YYYY-MM-DD'
                                    return date.fromisoformat(value)
                                except Exception:
                                    try:
                                        return datetime.fromisoformat(value).date()
                                    except Exception:
                                        return None
                            return None

                        fecha_comprobante_val = _normalize_date_field(afip_data.get("fecha_comprobante"))
                        vencimiento_cae_val = _normalize_date_field(afip_data.get("vencimiento_cae"))

                        # Serializar raw_response a texto JSON con un encoder robusto
                        # Usamos `default_json` importado desde backend.utils.json_utils
                        # para convertir datetimes, Decimals y bytes a representaciones JSON-friendly.

                        try:
                            raw_response_text = json.dumps(afip_data, ensure_ascii=False, default=default_json)
                        except Exception as ser_err:
                            logger.error(f"[{invoice_id}] Error serializando la respuesta de AFIP (final fallback): {ser_err}")
                            raw_response_text = json.dumps({"error_serializing_raw_response": str(ser_err), "original_type": str(type(afip_data))}, ensure_ascii=False, default=default_json)

                        # Insertar usando SQLAlchemy Core para controlar exactamente los valores
                        from sqlalchemy import insert as sa_insert
                        # Normalizar y preparar valores para el INSERT
                        try:
                            punto_venta_val = int(afip_data.get("punto_venta")) if afip_data.get("punto_venta") is not None else None
                        except Exception:
                            punto_venta_val = None
                        try:
                            tipo_comprobante_val = int(afip_data.get("tipo_comprobante")) if afip_data.get("tipo_comprobante") is not None else None
                        except Exception:
                            tipo_comprobante_val = None
                        try:
                            cuit_emisor_val = str(afip_data.get("cuit_emisor")) if afip_data.get("cuit_emisor") is not None else None
                        except Exception:
                            cuit_emisor_val = None

                        # Construir datos de diagnóstico de tipo forzado/mismatch
                        tipo_forzado_intentado = original_invoice_data.get('tipo_forzado') if original_invoice_data.get('tipo_forzado') is not None else None
                        tipo_comprobante_micro = afip_data.get('tipo_comprobante') or afip_data.get('tipo_afip')
                        tipo_mismatch = None
                        try:
                            if tipo_forzado_intentado is not None and tipo_comprobante_micro is not None:
                                tipo_mismatch = int(tipo_forzado_intentado) != int(tipo_comprobante_micro)
                        except Exception:
                            tipo_mismatch = None

                        insert_values = {
                            "ingreso_id": str(invoice_id),
                            "cae": afip_data.get("cae"),
                            "numero_comprobante": afip_data.get("numero_comprobante"),
                            "punto_venta": punto_venta_val,
                            "tipo_comprobante": tipo_comprobante_val,
                            "fecha_comprobante": fecha_comprobante_val,
                            "vencimiento_cae": vencimiento_cae_val,
                            "resultado_afip": afip_data.get("resultado"),
                            "cuit_emisor": cuit_emisor_val,
                            "tipo_doc_receptor": afip_data.get("tipo_doc_receptor"),
                            "nro_doc_receptor": afip_data.get("nro_doc_receptor"),
                            "importe_total": (float(afip_data.get("importe_total")) if afip_data.get("importe_total") is not None else None),
                            "importe_neto": (float(afip_data.get("neto")) if afip_data.get("neto") is not None else None),
                            "importe_iva": (float(afip_data.get("iva")) if afip_data.get("iva") is not None else None),
                            "raw_response": raw_response_text,
                            "qr_url_afip": qr_url,
                            # Nuevos campos de diagnóstico
                            "tipo_forzado_intentado": tipo_forzado_intentado,
                            "tipo_mismatch": tipo_mismatch,
                            "tipo_comprobante_microservicio": tipo_comprobante_micro,
                            "debug_cuit_usado": afip_data.get('debug_cuit_usado'),
                            "debug_fuente_credenciales": afip_data.get('debug_fuente_credenciales'),
                            # Not including created_at/updated_at so DB server defaults apply
                        }

                        # Usar una inserción SQL explícita (text) para controlar exactamente
                        # las columnas que enviamos y evitar pasar created_at/updated_at
                        from sqlalchemy import text as sa_text
                        sql = sa_text(
                            "INSERT INTO facturas_electronicas (ingreso_id, cae, numero_comprobante, punto_venta, tipo_comprobante, fecha_comprobante, vencimiento_cae, resultado_afip, cuit_emisor, tipo_doc_receptor, nro_doc_receptor, importe_total, importe_neto, importe_iva, raw_response, qr_url_afip, tipo_forzado_intentado, tipo_mismatch, tipo_comprobante_microservicio, debug_cuit_usado, debug_fuente_credenciales) VALUES (:ingreso_id, :cae, :numero_comprobante, :punto_venta, :tipo_comprobante, :fecha_comprobante, :vencimiento_cae, :resultado_afip, :cuit_emisor, :tipo_doc_receptor, :nro_doc_receptor, :importe_total, :importe_neto, :importe_iva, :raw_response, :qr_url_afip, :tipo_forzado_intentado, :tipo_mismatch, :tipo_comprobante_microservicio, :debug_cuit_usado, :debug_fuente_credenciales)"
                        )
                        try:
                            # DEBUG: log types to detect non-serializable values
                            try:
                                type_map = {k: type(v).__name__ for k, v in insert_values.items()}
                                logger.debug(f"[{invoice_id}] insert_values types: {type_map}")
                            except Exception:
                                logger.debug(f"[{invoice_id}] insert_values preview failed")

                            result = db.execute(sql, insert_values)
                            # Intentar obtener lastrowid si el driver lo expone
                            try:
                                new_id = int(result.lastrowid) if hasattr(result, 'lastrowid') and result.lastrowid is not None else None
                            except Exception:
                                new_id = None
                        except Exception:
                            # En caso de fallo, reintentar con el Core insert como fallback
                            table_obj = FacturaElectronica.__table__
                            stmt = sa_insert(table_obj).values(**insert_values)
                            result = db.execute(stmt)
                            new_id = None

                        db.commit()
                        single_invoice_result["db_save_status"] = "SUCCESS"
                        single_invoice_result["factura_id"] = new_id  # ⭐ NUEVO: Devolver ID de la factura
                        logger.info(f"[{invoice_id}] Factura insertada en la base de datos. ID (si disponible): {new_id}")

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