"""
Pequeñas utilidades para serializar objetos a JSON de forma robusta.

Contiene `default_json` que convierte datetimes, dates, Decimals y bytes
en representaciones JSON-friendly (ISO strings, floats o base64).
Usar esta función como `json.dumps(..., default=default_json)` para
evitar problemas cuando el payload contiene objetos no serializables.
"""
from __future__ import annotations
from datetime import datetime, date
from decimal import Decimal
import base64
from typing import Any


def default_json(o: Any) -> Any:
    """Handler por defecto para json.dumps.

    Convierte objetos comunes que json no serializa por defecto.
    - datetime/date -> ISO string
    - Decimal -> float (si posible)
    - bytes -> base64 string
    - otros -> str(o)
    """
    try:
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, Decimal):
            try:
                return float(o)
            except Exception:
                return str(o)
        if isinstance(o, (bytes, bytearray)):
            return base64.b64encode(bytes(o)).decode("utf-8")
        # Fallback genérico
        return str(o)
    except Exception:
        return str(o)
