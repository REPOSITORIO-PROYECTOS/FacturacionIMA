from fastapi import APIRouter, HTTPException

from typing import Any, Dict, List

from backend.utils.tablasHandler import TablasHandler

router = APIRouter(
    prefix="/boletas"
)

@router.get("/obtener-todas", response_model=List[Dict[str, Any]])
def traer_boletas():
    handler = TablasHandler()
    try:
        boletas = handler.cargar_ingresos()
        return boletas
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado: {e}")


@router.get("/obtener-no-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas():
    handler = TablasHandler()
    try:
        boletas = handler.cargar_ingresos()
        boletas_filtradas = [b for b in boletas if b.get("facturacion") == "falta facturar"]
        return boletas_filtradas
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado: {e}")
    


@router.get("/obtener-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas():
    handler = TablasHandler()
    try:
        boletas = handler.cargar_ingresos()
        boletas_filtradas = [b for b in boletas if b.get("facturacion") == "facturado"]
        return boletas_filtradas
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado: {e}")
    

