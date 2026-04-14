#!/usr/bin/env python3
"""
Auditoría en BD: empresa SKAL FAM / CUIT 30718331680 y flag aplicar_desglose_77.

Uso (desde raíz del repo, con .env cargado por database.py):
  PYTHONPATH=. python3 backend/scripts/audit_skal_fam_config.py
"""
from __future__ import annotations

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

NEEDLE = "30718331680"


def main() -> int:
    from sqlmodel import select
    from backend.utils.afipTools import _cuit_solo_digitos
    from backend.database import SessionLocal
    from backend.modelos import Empresa, ConfiguracionEmpresa

    print("=== Auditoría SKAL FAM / desglose 77 ===\n")

    try:
        with SessionLocal() as db:
            empresas = db.exec(select(Empresa)).all()
            matches: list[tuple[Empresa, str]] = []
            for e in empresas:
                d = _cuit_solo_digitos(e.cuit)[:11]
                name = (e.nombre_legal or "") + " " + (e.nombre_fantasia or "")
                if d == NEEDLE or NEEDLE in name.upper() or "SKAL" in name.upper():
                    matches.append((e, d))

            if not matches:
                print(f"No se encontró empresa con CUIT dígitos {NEEDLE} ni nombre SKAL.")
                print(f"Total empresas en BD: {len(empresas)}")
                return 1

            for emp, d11 in matches:
                cfg = db.exec(
                    select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == emp.id)
                ).first()
                print(f"Empresa id={emp.id}")
                print(f"  nombre_legal: {emp.nombre_legal!r}")
                print(f"  cuit (tabla): {emp.cuit!r}")
                print(f"  cuit 11 dígitos: {d11}")
                print(f"  activa: {emp.activa}")
                if cfg:
                    print(f"  configuracion_empresa.id_empresa: {cfg.id_empresa}")
                    print(f"  configuracion_empresa.cuit: {cfg.cuit!r}")
                    print(f"  aplicar_desglose_77: {cfg.aplicar_desglose_77}")
                    print(f"  link_google_sheets: {(cfg.link_google_sheets or '')[:60]}...")
                else:
                    print("  configuracion_empresa: SIN FILA (aplicar_desglose_77 no aplicable por BD)")
                print()

            print("--- Payload típico dashboard (grupo) ---")
            print("Campos enviados: id, total, cliente_data{...}, emisor_cuit")
            print("NO envía: aplicar_desglose_77, conceptos, tributos, punto_venta, tipo_forzado")
            print("El backend activa desglose 77 si configuracion_empresa.aplicar_desglose_77 es True")
            print("(resolución por id_empresa tras matchear Empresa por CUIT).")
    except Exception as ex:
        print(f"Error de conexión o consulta: {ex}")
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
