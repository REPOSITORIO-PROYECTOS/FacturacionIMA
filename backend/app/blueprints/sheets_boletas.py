"""
Endpoint para cargar boletas directamente desde Google Sheets.
Ya no depende de gestion_ima_db - todo desde Sheets.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.security import obtener_usuario_actual
from backend.modelos import Usuario
from backend.utils.tablasHandler import TablasHandler
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sheets", tags=["sheets"])


@router.get("/boletas")
async def obtener_boletas_desde_sheets(
    usuario: Usuario = Depends(obtener_usuario_actual),
    tipo: Optional[str] = Query(None, description="Filtro: 'no-facturadas', 'facturadas', o None para todas"),
    limit: Optional[int] = Query(300, description="Límite de registros")
) -> List[Dict[str, Any]]:
    """
    Obtiene todas las boletas directamente desde Google Sheets.
    
    Parámetros:
    - tipo: 'no-facturadas' | 'facturadas' | None
    - limit: máximo número de registros a devolver
    
    Retorna lista de boletas con todos los campos del Sheet.
    """
    try:
        sheets_handler = TablasHandler()
        
        # Cargar todos los ingresos desde el Sheet
        logger.info(f"📊 Cargando boletas desde Google Sheets (tipo={tipo}, limit={limit})...")
        boletas = sheets_handler.cargar_ingresos()
        
        if not boletas:
            logger.warning("⚠️ No se encontraron boletas en Google Sheets")
            return []
        
        logger.info(f"✅ Boletas cargadas desde Sheets: {len(boletas)}")
        
        # Filtrar según el tipo solicitado
        if tipo == "no-facturadas":
            boletas_antes = len(boletas)
            boletas = [
                b for b in boletas
                if str(b.get('facturacion', '')).strip().lower() not in ['facturado', 'facturada', 'si', 'sí', 'yes', 'true']
            ]
            logger.info(f"🔍 Filtro 'no-facturadas': {boletas_antes} → {len(boletas)} boletas")
        elif tipo == "facturadas":
            boletas_antes = len(boletas)
            boletas = [
                b for b in boletas
                if str(b.get('facturacion', '')).strip().lower() in ['facturado', 'facturada', 'si', 'sí', 'yes', 'true']
            ]
            logger.info(f"🔍 Filtro 'facturadas': {boletas_antes} → {len(boletas)} boletas")
        
        # Aplicar límite
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
        raise HTTPException(
            status_code=500,
            detail=f"Error cargando boletas desde Google Sheets: {str(e)}"
        )


@router.post("/sincronizar")
async def sincronizar_boletas(
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> Dict[str, Any]:
    """
    Fuerza una re-sincronización de boletas desde Google Sheets.
    Útil cuando se han hecho cambios manuales en el Sheet.
    """
    try:
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
