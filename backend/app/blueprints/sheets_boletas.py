from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from datetime import datetime, date
import time
import os
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional

from sqlmodel import select, desc, or_, func, Float
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

# Flag global para evitar múltiples sincronizaciones simultáneas
_sync_in_progress = False

def _sync_sheets_to_db(full_sync: bool = False):
    """
    Función síncrona que descarga de Sheets y actualiza la tabla SQL 'ingresos_sheets'.
    full_sync: Si es True, trae todo el histórico. Si es False, solo últimos 30 días.
    """
    global _sync_in_progress
    if _sync_in_progress:
        logger.info("⏭️ DB-Sync: Ya hay una sincronización en curso. Saltando.")
        return

    _sync_in_progress = True
    sync_type = "COMPLETA" if full_sync else "INCREMENTAL (30 días)"
    logger.info(f"🔄 DB-Sync ({sync_type}): Iniciando descarga desde Sheets...")

    # Variable para rastrear si actualizamos algo
    any_update_performed = False

    try:
        sheets_handler = TablasHandler()
        try:
            # En sync incremental, podríamos intentar traer menos datos si la librería lo permite,
            # pero por ahora filtramos en Python para mantener la DB limpia de duplicados 
            # y procesar solo lo necesario.
            boletas = sheets_handler.cargar_ingresos() or []
        except Exception as e:
            if "429" in str(e) or "Quota exceeded" in str(e):
                logger.warning(f"⚠️ Google API Quota Exceeded (429). Saltando.")
                return
            raise e

        if not boletas:
            logger.warning("⚠️ DB-Sync: Lista vacía desde Sheets. No se actualiza DB.")
            return

        db = SessionLocal()
        try:
            count_new = 0
            count_updated = 0
            
            # Si no es full_sync, filtramos las boletas de los últimos 30 días
            if not full_sync:
                hoy = date.today()
                from datetime import timedelta
                hace_30_dias = hoy - timedelta(days=30)
                
                boletas_original_count = len(boletas)
                boletas = [
                    b for b in boletas 
                    if _parse_fecha_key(b.get('Fecha') or b.get('fecha') or b.get('FECHA')) is None or 
                       _parse_fecha_key(b.get('Fecha') or b.get('fecha') or b.get('FECHA')) >= hace_30_dias
                ]
                logger.info(f"📉 Sync Incremental: Procesando {len(boletas)} de {boletas_original_count} boletas (últimos 30 días).")

            # Optimización: Solo traer los IDs que vamos a procesar si es incremental
            if not full_sync and boletas:
                ids_a_procesar = [str(b.get('ID Ingresos') or b.get('id_ingreso') or b.get('id', '')).strip() for b in boletas]
                ids_a_procesar = [id for id in ids_a_procesar if id]
                existing_objs = {obj.id_ingreso: obj for obj in db.exec(select(IngresoSheets).where(IngresoSheets.id_ingreso.in_(ids_a_procesar))).all()}
            else:
                existing_objs = {obj.id_ingreso: obj for obj in db.exec(select(IngresoSheets)).all()}

            # Fecha de sincronización de este lote
            sync_time = datetime.utcnow()

            last_obj_processed = None # Guardamos el último objeto procesado

            for b in boletas:
                id_ingreso = str(b.get('ID Ingresos') or b.get('id_ingreso') or b.get('id', '')).strip()
                if not id_ingreso: continue

                fecha_val = _parse_fecha_key(b.get('Fecha') or b.get('fecha') or b.get('FECHA'))
                facturacion_val = str(b.get('facturacion') or b.get('Facturacion', '')).strip()
                data_json_val = json.dumps(b, ensure_ascii=False)

                if id_ingreso in existing_objs:
                    obj = existing_objs[id_ingreso]
                    last_obj_processed = obj

                    # Verificamos si los datos REALES cambiaron
                    datos_cambiaron = (
                        obj.facturacion != facturacion_val or
                        obj.fecha != fecha_val or
                        obj.data_json != data_json_val
                    )

                    if datos_cambiaron:
                        obj.fecha = fecha_val
                        obj.facturacion = facturacion_val
                        obj.data_json = data_json_val
                        obj.last_synced_at = sync_time # Actualizamos fecha
                        db.add(obj)
                        count_updated += 1
                        any_update_performed = True
                else:
                    new_obj = IngresoSheets(
                        id_ingreso=id_ingreso,
                        fecha=fecha_val,
                        facturacion=facturacion_val,
                        data_json=data_json_val,
                        last_synced_at=sync_time # Nueva fecha
                    )
                    db.add(new_obj)
                    existing_objs[id_ingreso] = new_obj
                    last_obj_processed = new_obj
                    count_new += 1
                    any_update_performed = True

            # === EL FIX (Anti-Loop) ===
            # Si no hubo actualizaciones de datos (porque el sheet no cambió),
            # forzamos actualizar la fecha del último objeto para avisar que "ya revisamos".
            if not any_update_performed and last_obj_processed:
                last_obj_processed.last_synced_at = sync_time
                db.add(last_obj_processed)
                logger.info("⏱️ Sync sin cambios de datos: Actualizando timestamp para resetear cooldown.")

            db.commit()
            logger.info(f"✅ DB-Sync: Completado. Nuevos: {count_new}, Actualizados: {count_updated}")

        except Exception as e:
            db.rollback()
            logger.error(f"❌ DB-Sync Error insertando en BD: {e}")
        finally:
            db.close()

    except Exception as e:
        logger.error(f"❌ DB-Sync Error general: {e}")
    finally:
        _sync_in_progress = False

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
    limit: int = Query(50, description="Tamaño de página"),
    offset: int = Query(0, description="Cuántos saltar (para paginación)"),
    search: Optional[str] = Query(None, description="Búsqueda por cliente, ID o repartidor"),
    nocache: Optional[int] = Query(None, description="1 para forzar recarga síncrona"),
    fecha_desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    fecha_hasta: Optional[str] = Query(None, description="YYYY-MM-DD"),
    status: Optional[str] = Query(None, description="Filtro para facturadas: 'activas' o 'anuladas'")
) -> Dict[str, Any]:
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
    
    # Filtros base
    query = query.where(IngresoSheets.facturacion != "")
    
    if tipo == "no-facturadas":
        query = query.where(IngresoSheets.facturacion.notin_(['Facturado', 'Facturada', 'Anulada', 'Anulado', 'No falta facturar', 'No falta']))
    elif tipo == "facturadas":
        query = query.where(IngresoSheets.facturacion.in_(['Facturado', 'Facturada', 'Anulada', 'Anulado']))
    
    # --- NUEVO: Filtro de Búsqueda SQL (Case Insensitive) ---
    if search:
        search_term = f"%{search}%"
        query = query.where(or_(
            IngresoSheets.id_ingreso.like(search_term),
            IngresoSheets.data_json.like(search_term)
        ))

    # Filtro Fechas
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
        
    # 3. Contar total (para saber cuántas páginas hay)
    # Clonamos la query para contar sin límite
    total_count = db.exec(select(func.count()).select_from(query.subquery())).one()

    # 4. Ordenar y Paginar
    query = query.order_by(desc(IngresoSheets.fecha))
    query = query.offset(offset).limit(limit)
    
    results = db.exec(query).all()
    
    # 5. Respuesta
    items = []
    for obj in results:
        try:
            item = json.loads(obj.data_json)
            item['ID Ingresos'] = obj.id_ingreso
            items.append(item)
        except: continue
            
    return {
        "data": items,
        "total": total_count,
        "page": (offset // limit) + 1,
        "limit": limit
    }

@router.post("/sincronizar")
async def sincronizar_boletas(
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> Dict[str, Any]:
    """
    Fuerza actualización síncrona DB <-> Sheets (Incremental - 30 días).
    """
    try:
        # Ejecutar sync en el hilo principal (bloqueante pero seguro)
        _sync_sheets_to_db(full_sync=False)
        
        # Contar total
        db = SessionLocal()
        total = db.query(IngresoSheets).count()
        db.close()
        
        return {
            "success": True,
            "message": "Sincronización incremental exitosa",
            "total_boletas": total,
            "timestamp": str(datetime.now())
        }
    except Exception as e:
        logger.error(f"Error en sincronización: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error sincronizando: {str(e)}")

@router.post("/full-sync")
async def sincronizar_completa(
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> Dict[str, Any]:
    """
    Fuerza actualización síncrona DB <-> Sheets (Completa - Todo el histórico).
    """
    # Solo permitir a administradores (opcional, dependiendo de la política)
    if usuario.rol != "admin":
        raise HTTPException(status_code=403, detail="No tiene permisos para realizar una sincronización completa.")

    try:
        logger.info(f"🚀 Iniciando sincronización COMPLETA solicitada por {usuario.username}")
        _sync_sheets_to_db(full_sync=True)
        
        db = SessionLocal()
        total = db.query(IngresoSheets).count()
        db.close()
        
        return {
            "success": True,
            "message": "Sincronización completa exitosa",
            "total_boletas": total,
            "timestamp": str(datetime.now())
        }
    except Exception as e:
        logger.error(f"Error en sincronización completa: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error sincronizando: {str(e)}")

@router.get("/stats/mensuales")
async def obtener_stats_mensuales(
    db = Depends(get_db),
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> List[Dict[str, Any]]:
    """
    Obtiene totales de registros agrupados por mes y año.
    """
    # Consulta para agrupar por mes y año
    # Usamos func.strftime para SQLite o func.extract para Postgres/MySQL
    # Asumimos SQLite por el contexto previo del proyecto
    
    query = select(
        func.strftime('%Y-%m', IngresoSheets.fecha).label('periodo'),
        func.count(IngresoSheets.id).label('cantidad'),
        func.sum(
            func.cast(
                func.json_extract(IngresoSheets.data_json, '$.INGRESOS'),
                Float
            )
        ).label('total_ingresos')
    ).where(
        IngresoSheets.fecha != None
    ).group_by(
        'periodo'
    ).order_by(
        desc('periodo')
    )
    
    results = db.exec(query).all()
    
    stats = []
    for periodo, cantidad, total_ingresos in results:
        # periodo viene como 'YYYY-MM'
        year, month = periodo.split('-')
        stats.append({
            "periodo": periodo,
            "year": int(year),
            "month": int(month),
            "cantidad": cantidad,
            "total_ingresos": float(total_ingresos or 0)
        })
        
    return stats
