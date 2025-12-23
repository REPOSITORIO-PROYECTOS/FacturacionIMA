import json
import os
import sys
import logging
import argparse
from typing import List, Dict, Any
from datetime import datetime

# Añadir el directorio raíz al path para importar módulos del backend
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(current_dir))
sys.path.insert(0, project_root)

from backend.utils.billige_manage import process_invoice_batch_for_endpoint, TablasHandler
from backend.database import SessionLocal
from backend.modelos import FacturaElectronica
from sqlalchemy import text as sa_text
from sqlalchemy import insert as sa_insert

# Configuración de Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [REPROCESS] - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(os.path.join(project_root, 'reprocess.log'))
    ]
)
logger = logging.getLogger(__name__)

def save_to_db_from_json(invoice_id: str, afip_data: Dict[str, Any], original_data: Dict[str, Any]) -> bool:
    """
    Intenta guardar una factura en la BD usando los datos ya obtenidos de AFIP (recuperación de fallo parcial).
    """
    db = SessionLocal()
    try:
        # Verificar si ya existe
        existing = db.query(FacturaElectronica).filter(FacturaElectronica.ingreso_id == str(invoice_id)).first()
        if existing:
            logger.info(f"[{invoice_id}] La factura ya existe en la BD (ID: {existing.id}). Saltando inserción.")
            return True

        logger.info(f"[{invoice_id}] Intentando recuperar guardado en BD...")
        
        # Preparar valores (lógica similar a billige_manage.py)
        # Nota: Simplificado para recuperación. Asumimos que afip_data tiene lo necesario.
        
        try:
            fecha_val = afip_data.get("fecha_comprobante")
            if isinstance(fecha_val, str):
                fecha_val = datetime.fromisoformat(fecha_val).date()
        except:
            fecha_val = None

        try:
            vto_val = afip_data.get("vencimiento_cae")
            if isinstance(vto_val, str):
                vto_val = datetime.fromisoformat(vto_val).date()
        except:
            vto_val = None

        insert_values = {
            "ingreso_id": str(invoice_id),
            "cae": afip_data.get("cae"),
            "numero_comprobante": afip_data.get("numero_comprobante"),
            "punto_venta": int(afip_data.get("punto_venta")) if afip_data.get("punto_venta") else None,
            "tipo_comprobante": int(afip_data.get("tipo_comprobante")) if afip_data.get("tipo_comprobante") else None,
            "fecha_comprobante": fecha_val,
            "vencimiento_cae": vto_val,
            "resultado_afip": afip_data.get("resultado"),
            "cuit_emisor": str(afip_data.get("cuit_emisor")) if afip_data.get("cuit_emisor") else None,
            "tipo_doc_receptor": afip_data.get("tipo_doc_receptor"),
            "nro_doc_receptor": afip_data.get("nro_doc_receptor"),
            "importe_total": float(afip_data.get("importe_total")) if afip_data.get("importe_total") else None,
            "importe_neto": float(afip_data.get("neto")) if afip_data.get("neto") else None,
            "importe_iva": float(afip_data.get("iva")) if afip_data.get("iva") else None,
            "raw_response": json.dumps(afip_data), # Guardamos lo que tenemos
            "qr_url_afip": afip_data.get("qr_code") or afip_data.get("qr_url_afip"), # Intentar recuperar QR si existe
        }

        # Insertar
        table_obj = FacturaElectronica.__table__
        stmt = sa_insert(table_obj).values(**insert_values)
        db.execute(stmt)
        db.commit()
        logger.info(f"[{invoice_id}] RECUPERADO: Guardado exitosamente en BD.")
        return True

    except Exception as e:
        db.rollback()
        logger.error(f"[{invoice_id}] ERROR CRÍTICO al recuperar BD: {e}")
        return False
    finally:
        db.close()

def update_sheets(invoice_id: str) -> bool:
    """Intenta actualizar Google Sheets."""
    try:
        handler = TablasHandler()
        success = handler.marcar_boleta_facturada(id_ingreso=str(invoice_id))
        if success:
            logger.info(f"[{invoice_id}] Sheets actualizado correctamente.")
        else:
            logger.warning(f"[{invoice_id}] Sheets no se pudo actualizar.")
        return success
    except Exception as e:
        logger.error(f"[{invoice_id}] Error conectando con Sheets: {e}")
        return False

def reprocess_batch(file_path: str, force_failed: bool = False):
    if not os.path.exists(file_path):
        logger.error(f"Archivo no encontrado: {file_path}")
        return

    logger.info(f"Leyendo archivo de reporte: {file_path}")
    with open(file_path, 'r', encoding='utf-8') as f:
        results = json.load(f)

    to_retry_payload = []
    processed_count = 0
    recovered_count = 0
    failed_count = 0

    for item in results:
        invoice_id = item.get("id")
        status = item.get("status")
        
        logger.info(f"--- Analizando ID: {invoice_id} | Estado: {status} ---")

        # CASO 1: ÉXITO TOTAL
        if status == "SUCCESS":
            # Verificar consistencia (DB y Sheets)
            db_status = item.get("db_save_status")
            sheets_status = item.get("sheets_update_status")
            
            needs_db_fix = (db_status != "SUCCESS")
            needs_sheets_fix = (sheets_status != "SUCCESS" and sheets_status != "SKIPPED")
            
            if not needs_db_fix and not needs_sheets_fix:
                logger.info(f"[{invoice_id}] OK. Correctamente procesada.")
                processed_count += 1
                continue
            
            # CASO 2: ÉXITO PARCIAL (AFIP OK, pero falló guardado)
            logger.warning(f"[{invoice_id}] Inconsistencia detectada. DB: {db_status}, Sheets: {sheets_status}. Intentando reparar...")
            
            afip_result = item.get("result", {})
            original_data = item.get("original_data", {})
            
            db_ok = True
            if needs_db_fix:
                db_ok = save_to_db_from_json(invoice_id, afip_result, original_data)
            
            if db_ok and needs_sheets_fix:
                update_sheets(invoice_id)
            
            recovered_count += 1

        # CASO 3: FALLO (AFIP rechazó o error)
        elif status == "FAILED":
            logger.error(f"[{invoice_id}] Falló previamente: {item.get('error')}")
            
            if force_failed:
                logger.info(f"[{invoice_id}] Se agregará a la cola de REINTENTO FORZADO.")
                original_data = item.get("original_data")
                if original_data:
                    to_retry_payload.append(original_data)
                else:
                    logger.error(f"[{invoice_id}] No hay datos originales para reintentar.")
            else:
                logger.info(f"[{invoice_id}] Saltando (use --force para reintentar).")
            
            failed_count += 1

    # Ejecutar reintentos si hay
    if to_retry_payload:
        logger.info(f"=== Iniciando REINTENTO de {len(to_retry_payload)} facturas fallidas ===")
        try:
            # Llamamos a la función principal de facturación
            new_results = process_invoice_batch_for_endpoint(to_retry_payload)
            logger.info("=== Reintento finalizado ===")
            
            # Analizar resultados del reintento
            success_retry = sum(1 for r in new_results if r.get("status") == "SUCCESS")
            logger.info(f"Reintento: {success_retry}/{len(to_retry_payload)} recuperadas exitosamente.")
            
        except Exception as e:
            logger.error(f"Error fatal durante el reintento: {e}")

    logger.info("=== Resumen de Operación ===")
    logger.info(f"Total analizadas: {len(results)}")
    logger.info(f"Correctas originales: {processed_count}")
    logger.info(f"Reparadas (DB/Sheets): {recovered_count}")
    logger.info(f"Fallidas originales: {failed_count}")
    logger.info(f"Reintentadas: {len(to_retry_payload)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Reprocesar lote de facturas fallidas o inconsistentes.')
    parser.add_argument('file', help='Ruta al archivo JSON de resultados (ej: testing/batch_results_....json)')
    parser.add_argument('--force', action='store_true', help='Forzar reintento de facturas con estado FAILED')
    
    args = parser.parse_args()
    
    reprocess_batch(args.file, args.force)
