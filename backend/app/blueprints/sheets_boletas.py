from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from datetime import datetime, date
import time
import os
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional

from sqlmodel import select, desc
from backend.database import get_db, SessionLocal
from backend.security import obtener_usuario_actual
from backend.modelos import Usuario, IngresoSheets, FacturaElectronica
from backend.utils.tablasHandler import TablasHandler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sheets", tags=["sheets"])

# Tiempo mínimo entre sincronizaciones automáticas en background (para no saturar Sheets)
# Aumentado a 5 minutos para evitar error 429 (Quota Exceeded) de Google API
SYNC_COOLDOWN_SEC = 300

def _parse_fecha_key(raw: str) -> date | None:
    t = str(raw or '').strip()
    if not t: return None
    try:
        # ISO YYYY-MM-DD
        if '-' in t:
            return datetime.strptime(t.split('T')[0], '%Y-%m-%d').date()
        # DD/MM/YYYY
        if '/' in t:
            return datetime.strptime(t.split(' ')[0], '%d/%m/%Y').date()
    except Exception:
        pass
    return None

def _sync_sheets_to_db():
    """
    Función síncrona que descarga de Sheets y actualiza la tabla SQL 'ingresos_sheets'.
    Se ejecuta en background thread.
    """
    logger.info("🔄 DB-Sync: Iniciando descarga desde Sheets...")
    try:
        sheets_handler = TablasHandler()
        try:
            boletas = sheets_handler.cargar_ingresos() or []
        except Exception as e:
            if "429" in str(e) or "Quota exceeded" in str(e):
                logger.warning(f"⚠️ Google API Quota Exceeded (429). Saltando sincronización por ahora. Datos locales intactos.")
                return
            raise e
        
        if not boletas:
            logger.warning("⚠️ DB-Sync: Lista vacía desde Sheets (posible error silencioso o sheet vacío). No se actualiza DB.")
            return

        db = SessionLocal()
        try:
            count_new = 0
            count_updated = 0
            
            # Estrategia: Upsert (Insert or Update)
            # Como SQLModel no tiene upsert nativo portable, lo hacemos manualmente optimizado.
            # 1. Obtener IDs existentes para saber qué hacer
            # select(IngresoSheets.id_ingreso) devuelve valores directos (strings), no objetos
            existing_ids = {i for i in db.exec(select(IngresoSheets.id_ingreso)).all()}
            
            for b in boletas:
                id_ingreso = str(b.get('ID Ingresos') or b.get('id_ingreso') or b.get('id', '')).strip()
                if not id_ingreso: continue
                
                fecha_val = _parse_fecha_key(b.get('Fecha') or b.get('fecha') or b.get('FECHA'))
                facturacion_val = str(b.get('facturacion') or b.get('Facturacion', '')).strip()
                data_json_val = json.dumps(b, ensure_ascii=False)
                
                if id_ingreso in existing_ids:
                    # Update
                    # Optimizacion: Solo actualizar si cambió algo crítico o el JSON
                    # Para simplificar, actualizamos.
                    statement = select(IngresoSheets).where(IngresoSheets.id_ingreso == id_ingreso)
                    obj = db.exec(statement).first()
                    if obj:
                        obj.fecha = fecha_val
                        obj.facturacion = facturacion_val
                        obj.data_json = data_json_val
                        obj.last_synced_at = datetime.utcnow()
                        db.add(obj)
                        count_updated += 1
                else:
                    # Insert
                    new_obj = IngresoSheets(
                        id_ingreso=id_ingreso,
                        fecha=fecha_val,
                        facturacion=facturacion_val,
                        data_json=data_json_val,
                        last_synced_at=datetime.utcnow()
                    )
                    db.add(new_obj)
                    existing_ids.add(id_ingreso)
                    count_new += 1
            
            db.commit()
            logger.info(f"✅ DB-Sync: Completado. Nuevos: {count_new}, Actualizados: {count_updated}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"❌ DB-Sync Error insertando en BD: {e}")
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"❌ DB-Sync Error general: {e}")

async def refresh_sheets_data_background():
    """Wrapper async para correr en background task"""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync_sheets_to_db)

@router.get("/boletas")
async def obtener_boletas_desde_db(
    background_tasks: BackgroundTasks,
    db = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual),
    tipo: Optional[str] = Query(None, description="Filtro: 'no-facturadas', 'facturadas', o None para todas"),
    limit: Optional[int] = Query(300, description="Límite de registros"),
    nocache: Optional[int] = Query(None, description="1 para forzar recarga síncrona"),
    fecha_desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    fecha_hasta: Optional[str] = Query(None, description="YYYY-MM-DD")
) -> List[Dict[str, Any]]:
    """
    Obtiene boletas directamente desde la Base de Datos (espejo de Sheets).
    Dispara sincronización en background si es necesario.
    """
    
    # 1. Verificar frescura de los datos
    last_sync = db.exec(select(IngresoSheets.last_synced_at).order_by(desc(IngresoSheets.last_synced_at)).limit(1)).first()
    should_refresh = False
    
    if not last_sync:
        should_refresh = True # Nunca se sincronizó
    else:
        delta = datetime.utcnow() - last_sync
        if delta.total_seconds() > SYNC_COOLDOWN_SEC:
            should_refresh = True
            
    if nocache == 1:
        # Forzar sincronización bloqueante ahora
        logger.info("⏳ Forzando sincronización síncrona (nocache=1)")
        _sync_sheets_to_db()
    elif should_refresh:
        # Disparar background task
        logger.info("🕒 Datos antiguos, disparando sync en background")
        background_tasks.add_task(refresh_sheets_data_background)
        
    # 2. Construir Query SQL
    query = select(IngresoSheets)
    
    # Filtro 1: No vacíos
    query = query.where(IngresoSheets.facturacion != "")
    
    # Filtro 2: Tipo
    if tipo == "no-facturadas":
        # Pendientes: No es Facturado, No es Anulada, No es 'No falta facturar'
        # Usamos NOT IN para simplificar
        query = query.where(IngresoSheets.facturacion.notin_(['Facturado', 'Facturada', 'Anulada', 'Anulado', 'No falta facturar', 'No falta']))
    elif tipo == "facturadas":
        # Para facturadas, volvemos al orden por fecha común
        query = query.where(IngresoSheets.facturacion.in_(['Facturado', 'Facturada', 'Anulada', 'Anulado']))
    
    # Filtro 3: Fechas
    if fecha_desde:
        try:
            d_desde = datetime.strptime(fecha_desde, '%Y-%m-%d').date()
            query = query.where(IngresoSheets.fecha >= d_desde)
        except: pass
        
    if fecha_hasta:
        try:
            d_hasta = datetime.strptime(fecha_hasta, '%Y-%m-%d').date()
            query = query.where(IngresoSheets.fecha <= d_hasta)
        except: pass
        
    # Ordenar y Limitar
    query = query.order_by(desc(IngresoSheets.fecha))
    
    if limit:
        query = query.limit(limit)
        
    # Ejecutar
    results = db.exec(query).all()
    
    # Serializar respuesta
    # Desempaquetamos el JSON guardado pero sobreescribimos con los valores frescos de las columnas si fuera necesario
    response = []
    for obj in results:
        try:
            item = json.loads(obj.data_json)
            # Asegurar que el ID sea el correcto
            item['ID Ingresos'] = obj.id_ingreso
            response.append(item)
        except:
            continue
            
    return response

@router.post("/sincronizar")
async def sincronizar_boletas(
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> Dict[str, Any]:
    """
    Fuerza actualización síncrona DB <-> Sheets.
    """
    try:
        # Ejecutar sync en el hilo principal (bloqueante pero seguro)
        _sync_sheets_to_db()
        
        # Contar total
        db = SessionLocal()
        total = db.query(IngresoSheets).count()
        db.close()
        
        return {
            "success": True,
            "message": "Sincronización exitosa con Base de Datos",
            "total_boletas": total,
            "timestamp": str(datetime.now())
        }
    except Exception as e:
        logger.error(f"Error en sincronización: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error sincronizando: {str(e)}")
