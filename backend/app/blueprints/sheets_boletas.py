"""
Endpoint para cargar boletas directamente desde Google Sheets.
Ya no depende de gestion_ima_db - todo desde Sheets.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from datetime import datetime
import time
import os
import logging
from typing import Dict, Any, List, Optional

from backend.security import obtener_usuario_actual
from backend.modelos import Usuario
from backend.utils.tablasHandler import TablasHandler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sheets", tags=["sheets"])

# Cache simple en memoria
_last_cache: dict = {"ts": 0, "tipo": None, "items": []}
CACHE_TTL_SEC = int(os.getenv('SHEETS_CACHE_TTL_SEC', '60'))  # Reducido a 60s para mayor frescura

@router.get("/boletas")
async def obtener_boletas_desde_sheets(
    usuario: Usuario = Depends(obtener_usuario_actual),
    tipo: Optional[str] = Query(None, description="Filtro: 'no-facturadas', 'facturadas', o None para todas"),
    limit: Optional[int] = Query(300, description="Límite de registros"),
    nocache: Optional[int] = Query(None, description="1 para forzar recarga"),
    fecha_desde: Optional[str] = Query(None, description="YYYY-MM-DD"),
    fecha_hasta: Optional[str] = Query(None, description="YYYY-MM-DD")
) -> List[Dict[str, Any]]:
    """
    Obtiene todas las boletas directamente desde Google Sheets.
    Soporta caché y filtrado robusto.
    """
    global _last_cache
    
    # Lógica de Caché
    now = int(time.time())
    use_cache = (nocache != 1) and (_last_cache["tipo"] == tipo) and (now - _last_cache["ts"] < CACHE_TTL_SEC)
    
    if use_cache and _last_cache["items"]:
        logger.info(f"⚡ Sirviendo {len(_last_cache['items'])[:limit]} boletas desde caché (tipo={tipo})")
        return _last_cache["items"][:limit]

    try:
        sheets_handler = TablasHandler()
        
        # Cargar todos los ingresos desde el Sheet
        logger.info(f"📊 Cargando boletas desde Google Sheets (tipo={tipo}, limit={limit})...")
        boletas = sheets_handler.cargar_ingresos()
        
        if not boletas:
            logger.warning("⚠️ No se encontraron boletas en Google Sheets")
            return []
        
        logger.info(f"✅ Boletas cargadas desde Sheets: {len(boletas)}")
        
        # Helper para normalizar el estado de facturación
        def _normalizar_estado(b: Dict[str, Any]) -> str:
            val = str(b.get('facturacion', '') or b.get('Facturacion', '')).strip().lower()
            return val

        # 1. Filtrar registros vacíos (sin información útil de estado)
        # Se omiten aquellos donde el estado sea vacío/None
        boletas_antes_vacias = len(boletas)
        boletas = [
            b for b in boletas
            if _normalizar_estado(b) != ''
        ]
        logger.info(f"🧹 Filtro de vacíos: {boletas_antes_vacias} → {len(boletas)} boletas (se eliminaron registros sin estado)")

        # Filtrar según el tipo solicitado
        if tipo == "no-facturadas":
            boletas_antes = len(boletas)
            # Solo mostrar: "Falta Facturar" (o variantes similares que indiquen pendiente)
            # Excluir explícitamente: "Facturado", "Anulada", "No falta facturar"
            # Nota: Como ya filtramos los vacíos arriba, aquí nos queda lo que tiene texto.
            boletas = [
                b for b in boletas
                if _normalizar_estado(b) in ['falta facturar', 'pendiente', 'falta'] 
                or (_normalizar_estado(b) not in ['facturado', 'facturada', 'si', 'sí', 'yes', 'true', 'anulada', 'anulado', 'no falta facturar', 'no falta'])
            ]
            logger.info(f"🔍 Filtro 'no-facturadas': {boletas_antes} → {len(boletas)} boletas")
            
        elif tipo == "facturadas":
            boletas_antes = len(boletas)
            # Incluye Facturado y Anulada
            # Excluye "Falta facturar", "No falta facturar"
            boletas = [
                b for b in boletas
                if _normalizar_estado(b) in ['facturado', 'facturada', 'si', 'sí', 'yes', 'true', 'anulada', 'anulado']
            ]
            logger.info(f"🔍 Filtro 'facturadas': {boletas_antes} → {len(boletas)} boletas")

        # Nota: Si tipo es None (todas), se mostrarán "Falta facturar", "Facturado" y "No falta facturar".
        # Los vacíos ya fueron eliminados al inicio.


        # Helper para parsear fechas
        def _parse_fecha_key(raw: str) -> int:
            t = str(raw or '').strip()
            # Intentar formato ISO YYYY-MM-DD
            if '-' in t:
                parts = t.split(' ')[0].split('-')
                if len(parts) == 3:
                    try:
                        return int(parts[0]) * 10000 + int(parts[1]) * 100 + int(parts[2])
                    except: pass
            # Intentar formato DD/MM/YYYY
            if '/' in t:
                parts = t.split(' ')[0].split('/')
                if len(parts) == 3:
                    try:
                        y = int(parts[2])
                        if y < 100: y += 2000
                        return y * 10000 + int(parts[1]) * 100 + int(parts[0])
                    except: pass
            return 0

        # Filtro por fechas
        if fecha_desde or fecha_hasta:
            desde_key = int(fecha_desde.replace('-', '')) if fecha_desde else 0
            hasta_key = int(fecha_hasta.replace('-', '')) if fecha_hasta else 99999999
            
            antes = len(boletas)
            boletas = [
                b for b in boletas
                if desde_key <= _parse_fecha_key(str(b.get('Fecha') or b.get('fecha') or b.get('FECHA') or '')) <= hasta_key
            ]
            logger.info(f"📆 Filtro por fecha: {antes} → {len(boletas)} boletas")

        # Ordenar por fecha descendente (más recientes primero)
        boletas.sort(key=lambda b: _parse_fecha_key(str(b.get('Fecha') or b.get('fecha') or b.get('FECHA') or '')), reverse=True)
        
        # Actualizar caché con TODOS los resultados filtrados (sin límite aplicado aún para reuso)
        # Nota: El caché es por 'tipo'. Si se filtra por fecha, el caché podría ser incorrecto si se pide otro rango.
        # Para seguridad, solo cacheamos si NO hay filtro de fecha.
        if not fecha_desde and not fecha_hasta:
            _last_cache["ts"] = int(time.time())
            _last_cache["tipo"] = tipo
            _last_cache["items"] = boletas
        
        # Aplicar límite para respuesta
        if limit and limit > 0:
            boletas = boletas[:limit]
            logger.info(f"📏 Límite aplicado: mostrando {len(boletas)} boletas")
        
        logger.info(f"🎯 Retornando {len(boletas)} boletas al frontend")
        
        # Normalizar campos para el frontend
        boletas_normalizadas = []
        for b in boletas:
            boleta_norm = {
                'ID Ingresos': b.get('ID Ingresos') or b.get('id_ingreso') or b.get('id', ''),
                'Fecha': b.get('Fecha') or b.get('fecha', ''),
                'Repartidor': b.get('Repartidor') or b.get('repartidor', ''),
                'Razon Social': b.get('Razon Social') or b.get('razon_social', ''),
                'CUIT': b.get('CUIT') or b.get('cuit', ''),
                'INGRESOS': b.get('INGRESOS') or b.get('total') or b.get('Total a Pagar', 0),
                'Tipo Pago': b.get('Tipo Pago') or b.get('medio_pago', 'Efectivo'),
                'facturacion': b.get('facturacion') or b.get('Facturacion', ''),
                'Domicilio': b.get('Domicilio') or b.get('domicilio', ''),
                'condicion_iva': b.get('condicion_iva') or b.get('condicion-iva', 'CONSUMIDOR_FINAL'),
                # Incluir todos los demás campos originales
                **b
            }
            boletas_normalizadas.append(boleta_norm)
        
        return boletas_normalizadas
        
    except Exception as e:
        logger.error(f"Error obteniendo boletas desde Sheets: {e}", exc_info=True)
        # En caso de error, devolver lista vacía para no romper el frontend, pero loguear fuerte
        return []

@router.post("/sincronizar")
async def sincronizar_boletas(
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> Dict[str, Any]:
    """
    Fuerza una re-sincronización de boletas desde Google Sheets.
    Invalida el caché.
    """
    global _last_cache
    try:
        # Invalidar caché
        _last_cache = {"ts": 0, "tipo": None, "items": []}
        
        sheets_handler = TablasHandler()
        boletas = sheets_handler.cargar_ingresos()
        
        return {
            "success": True,
            "message": "Sincronización exitosa",
            "total_boletas": len(boletas),
            "timestamp": str(logging.time)
        }
    except Exception as e:
        logger.error(f"Error en sincronización: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error sincronizando: {str(e)}"
        )
