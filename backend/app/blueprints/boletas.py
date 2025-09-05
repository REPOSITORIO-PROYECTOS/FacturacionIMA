from fastapi import APIRouter, HTTPException

from typing import Any, Dict, List

from backend.utils.mysql_handler import get_db_connection
from backend.utils.tablasHandler import TablasHandler

router = APIRouter(
    prefix="/boletas"
)

handler = TablasHandler() # Optimizamos creando el handler una sola vez si es posible

# --- Endpoint 1: Todas las boletas (PAGINADO) ---
@router.get("/obtener-todas", response_model=List[Dict[str, Any]])
def traer_todas_las_boletas(skip: int = 0, limit: int = 20):
    """
    Devuelve una porción (página) de TODAS las boletas.
    """
    try:
        # 1. Carga la lista completa de boletas UNA SOLA VEZ.
        todas_las_boletas = handler.cargar_ingresos()
        
        # 2. Devuelve solo la "rebanada" correspondiente a la página solicitada.
        return todas_las_boletas[skip : skip + limit]

    except Exception as e:
        # Usamos f-strings para un mensaje de error más claro.
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar todas las boletas: {e}")


# --- Endpoint 2: Boletas NO facturadas (PAGINADO) ---
@router.get("/obtener-no-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_no_facturadas(skip: int = 0, limit: int = 20):
    """
    Filtra las boletas no facturadas y devuelve una porción (página).
    """
    try:
        # 1. Carga la lista completa de boletas.
        todas_las_boletas = handler.cargar_ingresos()
        
        # 2. Filtra la lista para obtener solo las que "falta facturar".
        boletas_filtradas = [
            boleta for boleta in todas_las_boletas 
            if boleta.get("facturacion") == "falta facturar"
        ]
        
        # 3. Devuelve la "rebanada" de la lista YA FILTRADA.
        return boletas_filtradas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar boletas no facturadas: {e}")


# --- Endpoint 3: Boletas SÍ facturadas (PAGINADO) ---
@router.get("/obtener-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_facturadas_desde_db(skip: int = 0, limit: int = 20):
    """
    Obtiene una página de boletas ya facturadas directamente desde la
    base de datos MySQL de la tabla 'facturas_electronicas'.
    """
    conn = None
    try:
 
        conn = get_db_connection()
        if not conn:

            raise HTTPException(status_code=503, detail="No se pudo establecer conexión con la base de datos.")
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT * 
            FROM facturas_electronicas 
            ORDER BY id DESC 
            LIMIT %s OFFSET %s
        """

        cursor.execute(query, (limit, skip))
        facturas_guardadas = cursor.fetchall()
        return facturas_guardadas

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al consultar la base de datos: {e}")

    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()