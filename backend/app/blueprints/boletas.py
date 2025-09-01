from fastapi import APIRouter, HTTPException

from typing import Any, Dict, List

from utils.tablasHandler import TablasHandler

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
