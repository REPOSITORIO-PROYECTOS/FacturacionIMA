from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from typing import Any, Dict, List
from pydantic import BaseModel
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

        username = usuario_actual.get("nombre_usuario", "")
        rol = usuario_actual.get("rol_id", "")

        if ( rol == "1"):   #si es admin le mando todas
            try:
                todas_las_boletas = handler.cargar_ingresos()

                return todas_las_boletas[skip : skip + limit]

            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar todas las boletas: {e}")


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



class RazonSocialRequest(BaseModel):
    razon_social: str


@router.post("/obtener-por-razon-social", response_model=List[Dict[str, Any]])
def traer_todas_por_razon_social(
    request_data: RazonSocialRequest,
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite) 
):
    try:
        rol = usuario_actual.get("rol_id", "")

        if (rol == "1"):
            try:
                todas_las_boletas = handler.cargar_ingresos()
                return todas_las_boletas[skip : skip + limit]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error al cargar todas las boletas para el admin: {e}")

        razon_social_buscada = request_data.razon_social
        if not razon_social_buscada:
            raise HTTPException(status_code=400, detail="La razón social no puede estar vacía.")

        todas_las_boletas = handler.cargar_ingresos()
        boletas_encontradas = []

        for boleta in todas_las_boletas:
            razon_social_excel = boleta.get("Razon Social", "")
            
            if razon_social_excel:
                ratio = fuzz.token_set_ratio(razon_social_buscada, razon_social_excel)

                if ratio > 80:
                    boletas_encontradas.append(boleta)

        return boletas_encontradas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al buscar boletas por razón social: {e}")




class FechaRequest(BaseModel):
    fecha: str

@router.post("/obtener-por-dia", response_model=List[Dict[str, Any]])
def traer_todas_por_dia(
    request_data: FechaRequest,
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite) 
):
    try:
        rol = usuario_actual.get("rol_id", "")

        if (rol == "1"):
            try:
                todas_las_boletas = handler.cargar_ingresos()
                return todas_las_boletas[skip : skip + limit]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error al cargar todas las boletas para el admin: {e}")

        fecha_buscada_str = request_data.fecha
        if not fecha_buscada_str:
            raise HTTPException(status_code=400, detail="La fecha no puede estar vacía.")


        try:
            fecha_buscada_obj = datetime.strptime(fecha_buscada_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="El formato de fecha es inválido. Por favor, usa AAAA-MM-DD.")

        todas_las_boletas = handler.cargar_ingresos()
        boletas_del_dia = []

        for boleta in todas_las_boletas:

            fecha_excel_raw = boleta.get("Fecha", "")
            
            if not fecha_excel_raw:
                continue 

            try:
                fecha_excel_obj = None
                if isinstance(fecha_excel_raw, datetime):
                    fecha_excel_obj = fecha_excel_raw.date()
                elif isinstance(fecha_excel_raw, str):
                    fecha_sin_hora = fecha_excel_raw.split(" ")[0]
                    fecha_excel_obj = datetime.strptime(fecha_sin_hora, "%d/%m/%Y").date()

                if fecha_excel_obj and fecha_excel_obj == fecha_buscada_obj:
                    boletas_del_dia.append(boleta)

            except (ValueError, TypeError):
                continue

        return boletas_del_dia[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al buscar boletas por día: {e}")



@router.get("/repartidores", response_model=List[Dict[str, Any]])
def listar_repartidores(
    skip: int = 0,
    limit: int = 1000,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)
):
    """
    Devuelve una lista de repartidores y las razones sociales asociadas.
    - Si el usuario es admin (rol_id == "1"), devuelve todos los repartidores encontrados.
    - Si no es admin, intenta devolver únicamente el repartidor asociado al usuario
      (se usa fuzzy matching sobre el campo 'Repartidor').
    Esto permite obtener desde el frontend el nombre de repartidor "seguro" según
    el usuario autenticado y las razones sociales relacionadas a sus boletas.
    """
    try:
        rol = usuario_actual.get("rol_id", "")
        username = usuario_actual.get("nombre_usuario", "")

        todas_las_boletas = handler.cargar_ingresos()

        # Construir mapping repartidor -> set(razon social)
        mapping: Dict[str, set] = {}
        for boleta in todas_las_boletas:
            repartidor = boleta.get("Repartidor") or boleta.get("repartidor") or ""
            razon = (
                boleta.get("Razon Social")
                or boleta.get("razon_social")
                or boleta.get("Razon social")
                or ""
            )
            if not repartidor:
                continue
            if repartidor not in mapping:
                mapping[repartidor] = set()
            if razon:
                mapping[repartidor].add(razon)

        results: List[Dict[str, Any]] = []

        if rol == "1":
            # Admin: devolver todos
            for r, razones in mapping.items():
                results.append({"repartidor": r, "razones_sociales": list(razones)})
            return results[skip: skip + limit]

        # No admin: intentar filtrar por el usuario autenticado
        if not username:
            raise HTTPException(status_code=400, detail="No se pudo obtener el nombre de usuario.")

        for r, razones in mapping.items():
            try:
                ratio = fuzz.token_set_ratio(username, r)
            except Exception:
                ratio = 0
            if ratio > 80:
                results.append({"repartidor": r, "razones_sociales": list(razones)})

        return results[skip: skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al listar repartidores: {e}")
