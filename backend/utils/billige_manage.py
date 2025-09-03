import logging
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

try:
    from .afipTools import generar_factura_para_venta, ReceptorData
    from .tablasHandler import TablasHandler
except ImportError as e:
    logging.critical(f"ERROR: No se pudo importar un módulo necesario (afipTools o tablasHandler): {e}")
    raise

from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    before_log,
    after_log,
    retry_if_exception_type
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

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

    results_for_response: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures_map = {}
        for original_invoice_data in invoices_payload:
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

                if sheets_handler:
                    try:
                        update_success = sheets_handler.marcar_boleta_facturada(id_ingreso=str(invoice_id))
                        if update_success:
                            single_invoice_result["sheets_update_status"] = "SUCCESS"
                            logger.info(f"[{invoice_id}] Boleta marcada exitosamente en Google Sheets.")
                        else:
                            single_invoice_result["sheets_update_status"] = "FAILED"
                            logger.warning(f"[{invoice_id}] No se pudo marcar la boleta en Google Sheets.")
                    except Exception as e:
                        single_invoice_result["sheets_update_status"] = "ERROR"
                        logger.error(f"[{invoice_id}] Excepción al marcar la boleta en Google Sheets: {e}", exc_info=True)
                else:
                    single_invoice_result["sheets_update_status"] = "SKIPPED"
                    logger.warning(f"[{invoice_id}] Se omitió la actualización en Google Sheets porque el handler no está disponible.")

            except Exception as e:
                single_invoice_result.update({
                    "status": "FAILED",
                    "error": str(e)
                })
                logger.warning(f"[{invoice_id}] Procesamiento de AFIP completado: FAILED. Error: {e}")

            results_for_response.append(single_invoice_result)

    logger.info(f"Endpoint: Procesamiento de lote finalizado. Total de resultados: {len(results_for_response)}")
    return results_for_response