from __future__ import annotations

from typing import Any, Dict, Optional, Tuple
import json


def _pick_non_empty(*vals: object) -> str:
    for v in vals:
        if v is None:
            continue
        try:
            s = str(v).strip()
        except Exception:
            continue
        if not s:
            continue
        if s.lower() in ("none", "null"):
            continue
        return s
    return ""


def _parse_raw_response(afip_result: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not afip_result:
        return None
    rr = afip_result.get("raw_response")
    if isinstance(rr, dict):
        return rr
    if isinstance(rr, str) and rr.strip():
        try:
            parsed = json.loads(rr)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None


def extraer_receptor_fields(
    boleta: Dict[str, Any],
    afip_result: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str, str]:
    afip_raw = _parse_raw_response(afip_result)
    afip_receptor = afip_raw.get("receptor") if isinstance(afip_raw, dict) else None
    if not isinstance(afip_receptor, dict):
        afip_receptor = None

    receptor_nombre = _pick_non_empty(
        boleta.get("razon_social"),
        boleta.get("Razon Social"),
        boleta.get("Razón Social"),
        boleta.get("nombre_razon_social"),
        boleta.get("Cliente"),
        boleta.get("cliente"),
        boleta.get("Nombre"),
        boleta.get("nombre"),
        (afip_receptor.get("razonSocial") if afip_receptor else None),
        (afip_receptor.get("razon_social") if afip_receptor else None),
        (afip_receptor.get("nombre") if afip_receptor else None),
        (afip_raw.get("cliente_nombre") if afip_raw else None),
        (afip_raw.get("nombre_cliente") if afip_raw else None),
        (afip_raw.get("razon_social") if afip_raw else None),
        (afip_raw.get("razonSocial") if afip_raw else None),
        (afip_raw.get("nombre_razon_social") if afip_raw else None),
        (afip_result.get("receptor_nombre") if afip_result else None),
        (afip_result.get("razon_social_receptor") if afip_result else None),
    )

    receptor_doc = _pick_non_empty(
        boleta.get("cuit"),
        boleta.get("CUIT"),
        boleta.get("Cuit"),
        boleta.get("dni"),
        boleta.get("DNI"),
        boleta.get("nro_doc_receptor"),
        boleta.get("documento"),
        (afip_receptor.get("nroDoc") if afip_receptor else None),
        (afip_receptor.get("nro_doc") if afip_receptor else None),
        (afip_raw.get("nro_doc_receptor") if afip_raw else None),
    )

    receptor_iva = _pick_non_empty(
        boleta.get("condicion_iva"),
        boleta.get("condicion-iva"),
        boleta.get("Condicion IVA"),
        boleta.get("condicion iva"),
        boleta.get("iva_condicion"),
        (afip_receptor.get("condicionIva") if afip_receptor else None),
        (afip_receptor.get("condicion_iva") if afip_receptor else None),
        (afip_raw.get("condicion_iva") if afip_raw else None),
    )

    return receptor_nombre, receptor_doc, receptor_iva

