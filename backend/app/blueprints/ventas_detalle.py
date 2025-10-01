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
    venta_id: str,  # Ahora acepta string (ingreso_id)
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> List[Dict[str, Any]]:
    """
    Obtiene los conceptos/productos de una venta específica.
    Acepta tanto ID numérico como ingreso_id (string).
    Retorna lista de conceptos con: descripcion, cantidad, precio_unitario, subtotal
    """
    try:
        connection = pymysql.connect(**DB_CONFIG)
        try:
            with connection.cursor() as cursor:
                # Intentar primero por ID numérico, luego por ingreso_id
                # Determinar si es un número o string
                try:
                    venta_id_num = int(venta_id)
                    # Es numérico, buscar por ID
                    query_venta = "SELECT id FROM ventas WHERE id = %s LIMIT 1"
                    cursor.execute(query_venta, (venta_id_num,))
                except (ValueError, TypeError):
                    # Es string, buscar por datos_factura->ingreso_id o timestamp
                    query_venta = """
                    SELECT id FROM ventas 
                    WHERE JSON_UNQUOTE(JSON_EXTRACT(datos_factura, '$.ingreso_id')) = %s
                       OR id = %s
                    LIMIT 1
                    """
                    cursor.execute(query_venta, (venta_id, venta_id))
                
                venta_row = cursor.fetchone()
                if not venta_row:
                    logger.warning(f"No se encontró venta con identificador: {venta_id}")
                    return []
                
                venta_id_real = venta_row['id']
                
                # Obtener conceptos de la venta
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
                cursor.execute(query, (venta_id_real,))
                results = cursor.fetchall()
                
                if not results:
                    logger.warning(f"No se encontraron conceptos para venta_id={venta_id_real}")
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
                
                logger.info(f"Venta {venta_id} (ID real: {venta_id_real}): {len(conceptos)} conceptos obtenidos")
                return conceptos
                
        finally:
            connection.close()
            
    except Exception as e:
        logger.error(f"Error obteniendo conceptos de venta {venta_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error obteniendo conceptos: {str(e)}")


@router.post("/{venta_id}/marcar-facturada")
async def marcar_venta_facturada(
    venta_id: str,
    usuario: Usuario = Depends(obtener_usuario_actual)
) -> Dict[str, Any]:
    """
    Marca una venta como facturada en la BD.
    Acepta tanto ID numérico como ingreso_id (string).
    """
    try:
        connection = pymysql.connect(**DB_CONFIG)
        try:
            with connection.cursor() as cursor:
                # Buscar la venta por ID o ingreso_id
                try:
                    venta_id_num = int(venta_id)
                    query_venta = "SELECT id FROM ventas WHERE id = %s LIMIT 1"
                    cursor.execute(query_venta, (venta_id_num,))
                except (ValueError, TypeError):
                    query_venta = """
                    SELECT id FROM ventas 
                    WHERE JSON_UNQUOTE(JSON_EXTRACT(datos_factura, '$.ingreso_id')) = %s
                       OR id = %s
                    LIMIT 1
                    """
                    cursor.execute(query_venta, (venta_id, venta_id))
                
                venta_row = cursor.fetchone()
                if not venta_row:
                    raise HTTPException(status_code=404, detail=f"Venta {venta_id} no encontrada")
                
                venta_id_real = venta_row['id']
                
                # Actualizar venta a facturada = 1
                update_query = "UPDATE ventas SET facturada = 1 WHERE id = %s"
                cursor.execute(update_query, (venta_id_real,))
                connection.commit()
                
                logger.info(f"Venta {venta_id} (ID real: {venta_id_real}) marcada como facturada")
                return {
                    "success": True,
                    "message": f"Venta {venta_id} marcada como facturada",
                    "venta_id": venta_id_real
                }
                
        finally:
            connection.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marcando venta {venta_id} como facturada: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error marcando como facturada: {str(e)}")
