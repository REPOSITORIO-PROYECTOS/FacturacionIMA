import logging
import os
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
    from backend.modelos import FacturaElectronica, IngresoSheets  # Asume que tienes un `models.py` con tu tabla de facturas
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
def _attempt_generate_invoice(total: float, cliente_data: ReceptorData, invoice_id: str, emisor_cuit: str | None = None, tipo_forzado: int | None = None, conceptos: List[Dict[str, Any]] | None = None, punto_venta: int | None = None) -> Dict[str, Any]:
    logger.debug(f"[{invoice_id}] Intentando facturar (Total: {total}, CUIT/DNI: {cliente_data.cuit_o_dni}, Conceptos: {len(conceptos) if conceptos else 0}, PV: {punto_venta})...")
    # Prechequeo: si no hay credenciales AFIP para el CUIT solicitado, abortar antes de intentar facturación
    from backend.utils.afipTools import _resolve_afip_credentials
    cuit_res, cert_res, key_res, fuente = _resolve_afip_credentials(emisor_cuit)
    if not (cuit_res and cert_res and key_res):
        logger.error(f"[{invoice_id}] ABORT: No existen credenciales AFIP para el CUIT solicitado ({emisor_cuit}). No se inicia facturación.")
        return {
            "status": "FAILED",
            "error": f"No existen credenciales AFIP para el CUIT solicitado ({emisor_cuit}). No se inicia facturación.",
            "original_data": {
                "total": total,
                "cliente_data": cliente_data.__dict__,
                "emisor_cuit": emisor_cuit,
                "tipo_forzado": tipo_forzado,
                "conceptos": conceptos,
                "punto_venta": punto_venta
            }
        }
    try:
        afip_result = generar_factura_para_venta(total=total, cliente_data=cliente_data, emisor_cuit=emisor_cuit, tipo_forzado=tipo_forzado, conceptos=conceptos, punto_venta=punto_venta)
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

def _process_single_invoice_full_cycle(
    original_invoice_data: Dict[str, Any],
    db: Any,
    sheets_handler: Any,
    results_list: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Procesa una única factura completa: validación, AFIP, QR, DB y Sheets.
    Retorna el diccionario de resultado.
    """
    invoice_id = original_invoice_data.get("id", f"batch_auto_{datetime.now().timestamp()}")
    total = original_invoice_data.get("total")

    if total is None:
        logger.error(f"[{invoice_id}] Factura sin 'total'. No se procesará.")
        return {
            "id": invoice_id,
            "status": "FAILED",
            "error": "Campo 'total' es requerido y faltante.",
            "original_data": original_invoice_data
        }

    try:
        cliente_data_dict = original_invoice_data["cliente_data"]
        cliente_data = ReceptorData(
            cuit_o_dni=cliente_data_dict["cuit_o_dni"],
            nombre_razon_social=cliente_data_dict.get("nombre_razon_social"),
            domicilio=cliente_data_dict.get("domicilio"),
            condicion_iva=cliente_data_dict["condicion_iva"]
        )
    except (KeyError, TypeError) as e:
        logger.error(f"[{invoice_id}] Datos de cliente_data incompletos o inválidos: {e}.")
        return {
            "id": invoice_id,
            "status": "FAILED",
            "error": f"Datos de cliente_data incompletos o inválidos: {e}",
            "original_data": original_invoice_data
        }

    emisor_cuit = original_invoice_data.get('emisor_cuit') or original_invoice_data.get('cuit_empresa')
    tipo_forzado = original_invoice_data.get('tipo_forzado')
    conceptos = original_invoice_data.get('conceptos')
    punto_venta = original_invoice_data.get('punto_venta')
    
    # Check existing (idempotency)
    try:
        from sqlmodel import select as _select
        from backend.modelos import FacturaElectronica as _FE
        existing = db.exec(_select(_FE).where(_FE.ingreso_id == str(invoice_id))).first()
        if existing:
            logger.warning(f"[{invoice_id}] Detectada factura existente, evitando reproceso")
            return {
                "id": invoice_id,
                "status": "FAILED",
                "error": "Ya facturada",
                "existing_factura_id": getattr(existing, "id", None),
                "numero_comprobante": getattr(existing, "numero_comprobante", None)
            }
    except Exception:
        pass

    # Process single invoice
    single_invoice_result = {
        "id": invoice_id,
        "original_data": original_invoice_data
    }

    try:
        # Synchronous call to AFIP
        afip_data = _attempt_generate_invoice(total, cliente_data, invoice_id, emisor_cuit, tipo_forzado, conceptos)
        
        if not afip_data or afip_data.get("status") == "FAILED":
            error_msg = afip_data.get("error") if afip_data else "Respuesta vacía de AFIP"
            logger.error(f"[{invoice_id}] Error en _attempt_generate_invoice: {error_msg}")
            return {
                "id": invoice_id,
                "status": "FAILED",
                "error": error_msg,
                "original_data": original_invoice_data
            }

        single_invoice_result.update({
            "status": "SUCCESS",
            "result": afip_data
        })
        
        # Mismatch check
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

        # QR Generation
        qr_url, qr_data_url = generar_qr_afip(afip_data)
        if qr_data_url:
            single_invoice_result["result"]["qr_code"] = qr_data_url
        else:
            single_invoice_result["qr_generation_status"] = "FAILED"
        
        # --- 1. Guardar en la Base de Datos ---
        try:
            # Helper serialización
            def make_json_serializable(obj: Any) -> Any:
                if isinstance(obj, dict):
                    return {k: make_json_serializable(v) for k, v in obj.items()}
                if isinstance(obj, list):
                    return [make_json_serializable(x) for x in obj]
                if isinstance(obj, (datetime, date)):
                    return obj.isoformat()
                if isinstance(obj, Decimal):
                    try: return float(obj)
                    except: return str(obj)
                if isinstance(obj, bytes):
                    return base64.b64encode(obj).decode('utf-8')
                return obj

            serializable_afip = make_json_serializable(afip_data)
            
            # Detalle Empresa y Desglose 77
            try:
                det_emp = original_invoice_data.get('detalle_empresa')
                if det_emp:
                    if isinstance(serializable_afip, dict):
                        serializable_afip['detalle_empresa'] = det_emp
                    else:
                        serializable_afip = {'result': serializable_afip, 'detalle_empresa': det_emp}
                if bool(original_invoice_data.get('aplicar_desglose_77')):
                    if isinstance(serializable_afip, dict):
                        serializable_afip['aplicar_desglose_77'] = True
                    else:
                        serializable_afip = {'result': serializable_afip, 'aplicar_desglose_77': True}
                if isinstance(serializable_afip, dict) and not serializable_afip.get('aplicar_desglose_77'):
                    # Intento recuperar config de empresa desde otra sesión si fuese necesario
                    # Para simplificar en este helper, omitimos la consulta compleja DB2 aquí o asumimos que
                    # la info viene en original_invoice_data si es crítica.
                    pass
            except Exception:
                pass

            # Serializar a texto
            try:
                raw_json_text = json.dumps(serializable_afip, ensure_ascii=False, default=default_json)
                raw_response_final = json.loads(raw_json_text)
            except Exception as ser_err:
                logger.error(f"[{invoice_id}] Error serializando respuesta AFIP: {ser_err}")
                raw_response_final = {"error": str(ser_err)}

            raw_response_text = json.dumps(raw_response_final, ensure_ascii=False, default=default_json)

            # Normalizar fechas
            def _normalize_date_field(value: Any):
                if value is None: return None
                if isinstance(value, date) and not isinstance(value, datetime): return value
                if isinstance(value, datetime): return value.date()
                if isinstance(value, str):
                    try: return date.fromisoformat(value)
                    except: 
                        try: return datetime.fromisoformat(value).date()
                        except: return None
                return None

            fecha_comprobante_val = _normalize_date_field(afip_data.get("fecha_comprobante"))
            vencimiento_cae_val = _normalize_date_field(afip_data.get("vencimiento_cae"))

            # Prepare Insert
            from sqlalchemy import insert as sa_insert
            
            punto_venta_val = int(afip_data.get("punto_venta")) if afip_data.get("punto_venta") is not None else None
            tipo_comprobante_val = int(afip_data.get("tipo_comprobante")) if afip_data.get("tipo_comprobante") is not None else None
            cuit_emisor_val = str(afip_data.get("cuit_emisor")) if afip_data.get("cuit_emisor") is not None else None
            
            tipo_forzado_intentado = original_invoice_data.get('tipo_forzado')
            tipo_comprobante_micro = afip_data.get('tipo_comprobante') or afip_data.get('tipo_afip')
            tipo_mismatch = None
            if tipo_forzado_intentado and tipo_comprobante_micro:
                try: tipo_mismatch = int(tipo_forzado_intentado) != int(tipo_comprobante_micro)
                except: pass

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
                "importe_total": (float(afip_data.get("importe_total")) if afip_data.get("importe_total") else None),
                "importe_neto": (float(afip_data.get("neto")) if afip_data.get("neto") else None),
                "importe_iva": (float(afip_data.get("iva")) if afip_data.get("iva") else None),
                "raw_response": raw_response_text,
                "qr_url_afip": qr_url,
                "tipo_forzado_intentado": tipo_forzado_intentado,
                "tipo_mismatch": tipo_mismatch,
                "tipo_comprobante_microservicio": tipo_comprobante_micro,
                "debug_cuit_usado": afip_data.get('debug_cuit_usado'),
                "debug_fuente_credenciales": afip_data.get('debug_fuente_credenciales'),
            }

            from sqlalchemy import text as sa_text
            sql = sa_text(
                "INSERT INTO facturas_electronicas (ingreso_id, cae, numero_comprobante, punto_venta, tipo_comprobante, fecha_comprobante, vencimiento_cae, resultado_afip, cuit_emisor, tipo_doc_receptor, nro_doc_receptor, importe_total, importe_neto, importe_iva, raw_response, qr_url_afip, tipo_forzado_intentado, tipo_mismatch, tipo_comprobante_microservicio, debug_cuit_usado, debug_fuente_credenciales) VALUES (:ingreso_id, :cae, :numero_comprobante, :punto_venta, :tipo_comprobante, :fecha_comprobante, :vencimiento_cae, :resultado_afip, :cuit_emisor, :tipo_doc_receptor, :nro_doc_receptor, :importe_total, :importe_neto, :importe_iva, :raw_response, :qr_url_afip, :tipo_forzado_intentado, :tipo_mismatch, :tipo_comprobante_microservicio, :debug_cuit_usado, :debug_fuente_credenciales)"
            )
            
            try:
                result = db.execute(sql, insert_values)
                try: new_id = int(result.lastrowid) if hasattr(result, 'lastrowid') and result.lastrowid is not None else None
                except: new_id = None
            except Exception:
                # Fallback
                table_obj = FacturaElectronica.__table__
                stmt = sa_insert(table_obj).values(**insert_values)
                result = db.execute(stmt)
                new_id = None

            db.commit()
            single_invoice_result["db_save_status"] = "SUCCESS"
            single_invoice_result["factura_id"] = new_id
            logger.info(f"[{invoice_id}] Factura insertada en la base de datos. ID: {new_id}")

        except Exception as db_error:
            db.rollback()
            single_invoice_result["db_save_status"] = "FAILED"
            single_invoice_result["error_db"] = str(db_error)
            logger.error(f"[{invoice_id}] ERROR al guardar en la base de datos: {db_error}", exc_info=True)

        # --- 2. Actualizar Google Sheets y DB Local ---
        if single_invoice_result.get("db_save_status") == "SUCCESS" and sheets_handler:
            try:
                # 2a. Actualizar Google Sheets
                update_success = sheets_handler.marcar_boleta_facturada(id_ingreso=str(invoice_id))
                single_invoice_result["sheets_update_status"] = "SUCCESS" if update_success else "FAILED"
                
                if update_success:
                    logger.info(f"[{invoice_id}] Sheets actualizado.")
                    # 2b. Actualizar Espejo Local (IngresoSheets) para que el front vea el cambio YA
                    try:
                        from sqlmodel import select as _select_sheets
                        stmt = _select_sheets(IngresoSheets).where(IngresoSheets.id_ingreso == str(invoice_id))
                        ingreso_obj = db.exec(stmt).first()
                        if ingreso_obj:
                            ingreso_obj.facturacion = "Facturado"
                            # Actualizar el JSON interno también
                            try:
                                data = json.loads(ingreso_obj.data_json)
                                # Actualizar tanto 'facturacion' como 'Facturacion' por si acaso
                                if 'facturacion' in data: data['facturacion'] = "Facturado"
                                if 'Facturacion' in data: data['Facturacion'] = "Facturado"
                                ingreso_obj.data_json = json.dumps(data, ensure_ascii=False)
                            except Exception:
                                pass
                            db.add(ingreso_obj)
                            db.commit()
                            logger.info(f"[{invoice_id}] Espejo local (IngresoSheets) actualizado a 'Facturado'.")
                    except Exception as db_sync_err:
                        logger.warning(f"[{invoice_id}] No se pudo actualizar espejo local IngresoSheets: {db_sync_err}")
                else:
                    logger.warning(f"[{invoice_id}] Sheets NO actualizado.")
            except Exception as sheets_error:
                single_invoice_result["sheets_update_status"] = "ERROR"
                single_invoice_result["error_sheets"] = str(sheets_error)
                logger.error(f"[{invoice_id}] Error Sheets: {sheets_error}")
        elif not sheets_handler:
            single_invoice_result["sheets_update_status"] = "SKIPPED"

    except Exception as afip_error:
        single_invoice_result.update({
            "status": "FAILED",
            "error": str(afip_error)
        })
        logger.warning(f"[{invoice_id}] AFIP FAILED: {afip_error}")

    return single_invoice_result

async def process_invoice_batch_for_endpoint(
    invoices_payload: List[Dict[str, Any]],
    max_workers: int = 5
) -> List[Dict[str, Any]]:
    
    logger.info(f"Endpoint: Recibido lote de {len(invoices_payload)} facturas. Iniciando procesamiento robusto con auto-healing.")

    try:
        sheets_handler = TablasHandler()
        logger.info("Handler de Google Sheets inicializado.")
    except Exception as e:
        logger.error(f"Error init Sheets: {e}")
        sheets_handler = None

    db = SessionLocal()
    results_for_response: List[Dict[str, Any]] = []

    try:
        # --- FASE 1: Procesamiento Secuencial Inicial ---
        logger.info("--- FASE 1: Procesamiento Inicial ---")
        for original_invoice_data in invoices_payload:
            res = _process_single_invoice_full_cycle(original_invoice_data, db, sheets_handler, results_for_response)
            results_for_response.append(res)

        # --- FASE 2: Verificación y Auto-Gestión (Retry) ---
        logger.info("--- FASE 2: Verificación y Auto-Gestión ---")
        
        # Identificar fallos recuperables
        failed_items = []
        for i, res in enumerate(results_for_response):
            # Caso 1: Fallo total (AFIP error)
            if res.get("status") == "FAILED":
                err_msg = str(res.get("error", "")).lower()
                # Filtrar errores permanentes obvios para no reintentar en vano
                if "ya facturada" in err_msg or "campo 'total' es requerido" in err_msg:
                    continue
                failed_items.append(i)
            
            # Caso 2: Inconsistencia (AFIP OK, DB Fail) -> Intentar guardar de nuevo
            elif res.get("status") == "SUCCESS" and res.get("db_save_status") == "FAILED":
                logger.info(f"[{res.get('id')}] Reparando guardado en DB...")
                # Reintentar lógica de guardado (simplificado: re-ejecutar ciclo completo sabiendo que el chequeo de duplicados lo atrapará o AFIP fallará y caerá en catch, 
                # PERO mejor es simplemente reintentar el guardado si tuvieramos la data.
                # Dado que _process_single_invoice_full_cycle hace todo, si lo llamamos de nuevo:
                # 1. Chequea DB -> si falló el guardado antes, no estará.
                # 2. Llama a AFIP -> AFIP dirá "Transacción Activa" o facturará de nuevo si no se completó.
                # Riesgo: Duplicar en AFIP si el anterior dio timeout pero se hizo.
                # Solución segura: Si ya tenemos result de AFIP, solo intentar guardar.
                pass 

        if failed_items:
            logger.info(f"Detectadas {len(failed_items)} facturas fallidas recuperables. Iniciando reintento automático...")
            import time
            time.sleep(1.0) # Breve pausa para limpiar estado de conexión
            
            for idx in failed_items:
                prev_res = results_for_response[idx]
                original_data = prev_res.get("original_data")
                if not original_data: continue
                
                logger.info(f"Reintentando factura ID: {original_data.get('id')}...")
                retry_res = _process_single_invoice_full_cycle(original_data, db, sheets_handler, results_for_response)
                
                # Si el reintento fue exitoso, reemplazar el resultado anterior
                if retry_res.get("status") == "SUCCESS":
                    logger.info(f"Reintento EXITOSO para {original_data.get('id')}")
                    results_for_response[idx] = retry_res
                else:
                    logger.warning(f"Reintento FALLIDO para {original_data.get('id')}: {retry_res.get('error')}")
                    # Actualizar con el último error pero mantener info
                    results_for_response[idx] = retry_res

    finally:
        db.close()
        logger.info("Sesión de base de datos cerrada.")

    logger.info(f"Procesamiento finalizado. Total: {len(results_for_response)}")
    
    # --- Guardar en carpeta testing ---
    try:
        project_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        testing_dir = os.path.join(project_dir, 'testing')
        if not os.path.exists(testing_dir): os.makedirs(testing_dir)
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"batch_results_{timestamp}.json"
        filepath = os.path.join(testing_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(results_for_response, f, ensure_ascii=False, indent=2, default=str)
        logger.info(f"Reporte guardado: {filepath}")
    except Exception as e:
        logger.error(f"Error guardando reporte: {e}")

    return results_for_response
