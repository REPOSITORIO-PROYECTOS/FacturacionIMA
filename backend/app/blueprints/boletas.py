from fastapi import APIRouter, Depends, HTTPException

from typing import Any, Dict, List

from backend.sqlite_security import obtener_usuario_actual_sqlite
from backend.utils.mysql_handler import get_db_connection
from backend.utils.tablasHandler import TablasHandler
from thefuzz import fuzz 

router = APIRouter(
    prefix="/boletas"
)

handler = TablasHandler() 

@router.get("/obtener-todas", response_model=List[Dict[str, Any]])
def traer_todas_las_boletas(skip: int = 0, limit: int = 20):

    try:
        todas_las_boletas = handler.cargar_ingresos()

        return todas_las_boletas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar todas las boletas: {e}")



@router.get("/obtener-no-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_no_facturadas(skip: int = 0, limit: int = 20):

    try:

        todas_las_boletas = handler.cargar_ingresos()

        boletas_filtradas = [
            boleta for boleta in todas_las_boletas 
            if boleta.get("facturacion") == "falta facturar"
        ]

        return boletas_filtradas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar boletas no facturadas: {e}")


@router.get("/obtener-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_facturadas_desde_db(skip: int = 0, limit: int = 20):

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


@router.get("/obtener-por-repartidor", response_model=List[Dict[str, Any]])
def traer_todas_por_repartidor(
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite) 
):
    try:

        username = usuario_actual.get("username", "")

        if not username:
            raise HTTPException(status_code=400, detail="No se pudo obtener el nombre de usuario.")

        todas_las_boletas = handler.cargar_ingresos()
        boletas_del_repartidor = []

        for boleta in todas_las_boletas:
            nombre_repartidor_excel = boleta.get("Repartidor", "")
            
            if nombre_repartidor_excel:
                ratio = fuzz.token_set_ratio(username, nombre_repartidor_excel)

                if ratio > 80:
                    boletas_del_repartidor.append(boleta)

        return boletas_del_repartidor[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar las boletas: {e}")