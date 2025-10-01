"""
Endpoint para obtener el detalle de conceptos/productos de una venta
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
import pymysql
import logging
from backend.security import obtener_usuario_actual
from backend.modelos import Usuario

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ventas", tags=["ventas"])

# Configuración de conexión a la BD gestion_ima_db
DB_CONFIG = {
    'host': 'localhost',
    'user': 'gestion_user',
    'password': 'SistemaIMA123.',
    'database': 'gestion_ima_db',
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

@router.get("/{venta_id}/conceptos")
async def get_venta_conceptos(
    venta_id: int,
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> List[Dict[str, Any]]:
    """
    Obtiene los conceptos/productos de una venta específica.
    Retorna lista de conceptos con: descripcion, cantidad, precio_unitario, subtotal
    """
    try:
        connection = pymysql.connect(**DB_CONFIG)
        try:
            with connection.cursor() as cursor:
                query = """
                SELECT 
                    a.descripcion,
                    vd.cantidad,
                    vd.precio_unitario,
                    (vd.cantidad * vd.precio_unitario - vd.descuento_aplicado) as subtotal
                FROM venta_detalle vd
                LEFT JOIN articulos a ON vd.id_articulo = a.id
                WHERE vd.id_venta = %s
                ORDER BY vd.id
                """
                cursor.execute(query, (venta_id,))
                results = cursor.fetchall()
                
                if not results:
                    logger.warning(f"No se encontraron conceptos para venta_id={venta_id}")
                    return []
                
                # Normalizar los datos
                conceptos = []
                for row in results:
                    conceptos.append({
                        "descripcion": row['descripcion'] or f"Artículo {row.get('id_articulo', 'sin nombre')}",
                        "cantidad": float(row['cantidad']) if row['cantidad'] else 1.0,
                        "precio_unitario": float(row['precio_unitario']) if row['precio_unitario'] else 0.0,
                        "subtotal": float(row['subtotal']) if row['subtotal'] else 0.0
                    })
                
                logger.info(f"Venta {venta_id}: {len(conceptos)} conceptos obtenidos")
                return conceptos
                
        finally:
            connection.close()
            
    except Exception as e:
        logger.error(f"Error obteniendo conceptos de venta {venta_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error obteniendo conceptos: {str(e)}")
