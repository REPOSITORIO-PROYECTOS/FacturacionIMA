from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from datetime import datetime, date, timezone
import time
import os
import json
import logging
import asyncio
import re
from typing import Dict, Any, List, Optional

from sqlmodel import select, desc, or_, func, Float
from sqlalchemy import text
from backend.database import get_db, SessionLocal
from backend.security import obtener_usuario_actual
from backend.modelos import Usuario, IngresoSheets, FacturaElectronica, Empresa, ConfiguracionEmpresa
from backend.utils.tablasHandler import TablasHandler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sheets", tags=["sheets"])

# Tiempo mínimo entre sincronizaciones automáticas en background (para no saturar Sheets)
# Aumentado a 5 minutos para evitar error 429 (Quota Exceeded) de Google API
SYNC_COOLDOWN_SEC = 300

def _parse_fecha_key(raw: Any) -> date | None:
    if not raw: return None
    if isinstance(raw, datetime): return raw.date()
    if isinstance(raw, date): return raw
    
    t = str(raw).strip()
    if not t or t.lower() in ('none', 'null', ''): return None
    
    # Intentar varios formatos comunes
    formatos = [
        '%Y-%m-%d',        # 2023-12-31
        '%d/%m/%Y',        # 31/12/2023
        '%Y/%m/%d',        # 2023/12/31
        '%d-%m-%Y',        # 31-12-2023
        '%d/%m/%y',        # 31/12/23
        '%Y-%m-%dT%H:%M:%S', # ISO con tiempo
        '%Y-%m-%dT%H:%M:%S.%f'
    ]
    
    # Limpieza previa: si tiene tiempo (espacio o T), tomar solo la parte fecha
    t_date_part = t.split(' ')[0].split('T')[0]
    
    for fmt in formatos:
        try:
            return datetime.strptime(t_date_part if '%' in fmt and not 'T' in fmt else t, fmt).date()
        except:
            continue
            
    # Fallback: intentar parsing manual simple para DD/MM/YYYY o YYYY-MM-DD
    try:
        if '/' in t_date_part:
            parts = t_date_part.split('/')
            if len(parts) == 3:
                if len(parts[0]) == 4: # YYYY/MM/DD
                    return date(int(parts[0]), int(parts[1]), int(parts[2]))
                else: # DD/MM/YYYY
                    return date(int(parts[2]), int(parts[1]), int(parts[0]))
        if '-' in t_date_part:
            parts = t_date_part.split('-')
            if len(parts) == 3:
                if len(parts[0]) == 4: # YYYY-MM-DD
                    return date(int(parts[0]), int(parts[1]), int(parts[2]))
                else: # DD-MM-YYYY
                    return date(int(parts[2]), int(parts[1]), int(parts[0]))
    except:
        pass
        
    return None

# Flag global para evitar múltiples sincronizaciones simultáneas
_sync_in_progress = False

def _extract_sheet_id(url: str) -> Optional[str]:
    if not url: return None
    # Match patterns like /d/1BxiMVs0XRA5nFMdKvBdBZjGMUUqptlbs74OgvE2upms/
    match = re.search(r"/d/([a-zA-Z0-9-_]+)", url)
    if match:
        return match.group(1)
    # Si no parece URL, asumir que es el ID directo
    if len(url) > 20 and "/" not in url:
        return url
    return None

def _ensure_ingresos_sheets_id_empresa(db) -> bool:
    try:
        res = db.exec(text("SHOW COLUMNS FROM ingresos_sheets LIKE 'id_empresa'")).first()
        if res:
            return True
    except Exception:
        pass

    try:
        db.exec(text("ALTER TABLE ingresos_sheets ADD COLUMN id_empresa INTEGER DEFAULT 1"))
        db.commit()
        return True
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        msg = str(e).lower()
        if "duplicate column" in msg or "already exists" in msg:
            return True
        return False

def _sync_sheets_to_db(full_sync: bool = False, id_empresa: int = 1, google_sheet_id: Optional[str] = None):
    """
    Función síncrona que descarga de Sheets y actualiza la tabla SQL 'ingresos_sheets'.
    full_sync: Si es True, trae todo el histórico. Si es False, solo últimos 30 días.
    id_empresa: ID de la empresa para la que se sincroniza.
    google_sheet_id: ID del Google Sheet específico de la empresa.
    """
    global _sync_in_progress
    if _sync_in_progress:
        logger.info("⏭️ DB-Sync: Ya hay una sincronización en curso. Saltando.")
        return

    _sync_in_progress = True
    sync_type = "COMPLETA" if full_sync else "INCREMENTAL (30 días)"
    logger.info(f"🔄 DB-Sync ({sync_type}) Empresa {id_empresa}: Iniciando descarga desde Sheets...")

    # Variable para rastrear si actualizamos algo
    any_update_performed = False

    try:
        sheets_handler = TablasHandler(google_sheet_id=google_sheet_id)
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
            multi_empresa_enabled = _ensure_ingresos_sheets_id_empresa(db)
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

            if not full_sync and boletas:
                ids_a_procesar = [str(b.get('ID Ingresos') or b.get('id_ingreso') or b.get('id', '')).strip() for b in boletas]
                ids_a_procesar = [id for id in ids_a_procesar if id]
                q = select(IngresoSheets).where(IngresoSheets.id_ingreso.in_(ids_a_procesar))
                if multi_empresa_enabled:
                    q = q.where(IngresoSheets.id_empresa == id_empresa)
                existing_objs = {obj.id_ingreso: obj for obj in db.exec(q).all()}
            else:
                q = select(IngresoSheets)
                if multi_empresa_enabled:
                    q = q.where(IngresoSheets.id_empresa == id_empresa)
                existing_objs = {obj.id_ingreso: obj for obj in db.exec(q).all()}

            # Fecha de sincronización de este lote
            sync_time = datetime.now(timezone.utc)

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
                    new_obj_kwargs = dict(
                        id_ingreso=id_ingreso,
                        fecha=fecha_val,
                        facturacion=facturacion_val,
                        data_json=data_json_val,
                        last_synced_at=sync_time,
                    )
                    if multi_empresa_enabled:
                        new_obj_kwargs["id_empresa"] = id_empresa
                    new_obj = IngresoSheets(**new_obj_kwargs)
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

async def refresh_sheets_data_background(id_empresa: int, google_sheet_id: Optional[str]):
    """Wrapper async para correr en background task"""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _sync_sheets_to_db, False, id_empresa, google_sheet_id)

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

    multi_empresa_enabled = _ensure_ingresos_sheets_id_empresa(db)
    google_sheet_id = None
    try:
        configuracion = db.exec(
            select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == usuario.id_empresa)
        ).first()
        if configuracion and configuracion.link_google_sheets:
            google_sheet_id = _extract_sheet_id(configuracion.link_google_sheets)
        
        # Hotfix Swing Jugos: Si no hay config, verificar CUIT empresa
        if not google_sheet_id:
            empresa_obj = db.exec(select(Empresa).where(Empresa.id == usuario.id_empresa)).first()
            if empresa_obj and str(empresa_obj.cuit) == "20364237740":
                 google_sheet_id = "1yNrBzxXga0TpFOpMcAQw6xvQ2dSa0TC9P7F88eOLveM"
                 logger.info(f"Aplicando Hotfix Sheet ID Swing Jugos para usuario {usuario.nombre_usuario}")

    except Exception as e:
        logger.error(f"Error obteniendo config empresa para usuario {usuario.nombre_usuario}: {e}")

    if multi_empresa_enabled:
        last_sync = db.exec(
            select(IngresoSheets.last_synced_at)
            .where(IngresoSheets.id_empresa == usuario.id_empresa)
            .order_by(desc(IngresoSheets.last_synced_at))
            .limit(1)
        ).first()
    else:
        last_sync = db.exec(
            select(IngresoSheets.last_synced_at).order_by(desc(IngresoSheets.last_synced_at)).limit(1)
        ).first()
    
    should_refresh = False
    
    if not last_sync:
        should_refresh = True # Nunca se sincronizó
    else:
        # Asegurar que last_sync tenga timezone, si no lo tiene, asumir UTC
        last_sync_aware = last_sync.replace(tzinfo=timezone.utc) if last_sync.tzinfo is None else last_sync
        delta = datetime.now(timezone.utc) - last_sync_aware
        if delta.total_seconds() > SYNC_COOLDOWN_SEC:
            should_refresh = True
            
    if nocache == 1:
        logger.info(f"⏳ Forzando sincronización síncrona (nocache=1) para Empresa {usuario.id_empresa}")
        _sync_sheets_to_db(full_sync=False, id_empresa=usuario.id_empresa, google_sheet_id=google_sheet_id)
    elif should_refresh:
        logger.info(f"🕒 Datos antiguos (Empresa {usuario.id_empresa}), disparando sync en background")
        background_tasks.add_task(refresh_sheets_data_background, usuario.id_empresa, google_sheet_id)
        
    query = select(IngresoSheets)
    
    if multi_empresa_enabled:
        query = query.where(IngresoSheets.id_empresa == usuario.id_empresa)

    # Filtros base
    query = query.where(IngresoSheets.facturacion != "")
    
    if tipo == "no-facturadas":
        query = query.where(IngresoSheets.facturacion.notin_(['Facturado', 'Facturada', 'Anulada', 'Anulado', 'No falta facturar', 'No falta']))
    elif tipo == "facturadas":
        query = query.where(IngresoSheets.facturacion.in_(['Facturado', 'Facturada', 'Anulada', 'Anulado']))
    
    logger.info(f"Filtros recibidos: tipo={tipo}, limit={limit}, offset={offset}, search={search}, fecha_desde={fecha_desde}, fecha_hasta={fecha_hasta}, status={status}")
    
    # --- NUEVO: Filtro de Búsqueda SQL (Case Insensitive) ---
    if search:
        search_term = f"%{search}%"
        query = query.where(or_(
            IngresoSheets.id_ingreso.like(search_term),
            IngresoSheets.data_json.like(search_term)
        ))

    # Filtro Fechas
    d_desde = _parse_fecha_key(fecha_desde) if fecha_desde else None
    d_hasta = _parse_fecha_key(fecha_hasta) if fecha_hasta else None
    
    if fecha_desde and not d_desde:
        logger.warning(f"Filtro fecha_desde inválido: {fecha_desde}")
    if fecha_hasta and not d_hasta:
        logger.warning(f"Filtro fecha_hasta inválido: {fecha_hasta}")
    
    if d_desde and d_hasta and d_desde > d_hasta:
        logger.warning(f"Rango de fechas invertido, corrigiendo: desde={d_desde} hasta={d_hasta}")
        d_desde, d_hasta = d_hasta, d_desde
    
    if d_desde:
        query = query.where(IngresoSheets.fecha >= d_desde)
    if d_hasta:
        query = query.where(IngresoSheets.fecha <= d_hasta)
    
    logger.info(f"Aplicando filtros de fecha: desde={d_desde} hasta={d_hasta}")
        
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
    Obtiene totales de registros agrupados por mes y año (Versión segura para formatos de moneda).
    """
    # Traemos fecha y el JSON crudo para procesar en Python (más seguro con formatos de moneda)
    query = select(IngresoSheets.fecha, IngresoSheets.data_json).where(IngresoSheets.fecha != None)
    results = db.exec(query).all()
    
    stats_dict = {}
    
    for row in results:
        if not row.fecha:
            continue
            
        # Clave Mes: "2024-05"
        mes_key = row.fecha.strftime("%Y-%m")
        if mes_key not in stats_dict:
            year, month = mes_key.split('-')
            stats_dict[mes_key] = {
                "periodo": mes_key,
                "year": int(year),
                "month": int(month),
                "cantidad": 0,
                "total_ingresos": 0.0
            }
            
        # Parseo seguro del dinero desde el JSON
        try:
            data = json.loads(row.data_json)
            # Buscamos 'INGRESOS' o 'ingresos'
            raw_ingreso = str(data.get('INGRESOS') or data.get('ingresos') or '0')
            
            # Limpiar símbolos de moneda y convertir formato latino (1.500,00) a SQL float (1500.00)
            # Primero quitamos el símbolo $, luego los puntos de miles, y finalmente cambiamos la coma decimal por punto.
            clean_ingreso = raw_ingreso.replace('$', '').replace('.', '').replace(',', '.').strip()
            monto = float(clean_ingreso)
        except Exception:
            monto = 0.0
            
        stats_dict[mes_key]["cantidad"] += 1
        stats_dict[mes_key]["total_ingresos"] += monto

    # Ordenar por periodo descendente y devolver los últimos 12 meses
    return sorted(stats_dict.values(), key=lambda x: x['periodo'], reverse=True)[:12]
