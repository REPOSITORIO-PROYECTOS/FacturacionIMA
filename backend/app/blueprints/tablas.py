from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

from backend.utils.tablasHandler import TablasHandler

router = APIRouter(
    prefix="/api",
    tags=["tablas"]
)

handler = TablasHandler()


@router.get("/tablas", response_model=List[Dict[str, Any]])
def obtener_tablas():
    """Devuelve una lista de tablas disponibles (id, nombre).
    Usa TablasHandler.cargar_ingresos() para leer los registros y extraer
    los valores únicos de la columna 'tabla' (si existe).
    """
    try:
        registros = handler.cargar_ingresos() or []
        nombres = []
        for r in registros:
            # Normalizamos: puede venir como 'tabla' o 'TABLA' u otro campo
            if isinstance(r, dict):
                val = None
                for key in ("tabla", "TABLA", "Tabla"):
                    if key in r and r[key] not in (None, ""):
                        val = str(r[key]).strip()
                        break
                if val:
                    if val not in nombres:
                        nombres.append(val)

        resultado = [{"id": idx + 1, "nombre": nombre} for idx, nombre in enumerate(nombres)]
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener tablas: {e}")
