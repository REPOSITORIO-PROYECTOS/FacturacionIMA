"""Run a self-contained diagnostic of the AFIP emission pipeline.

Objetivo:
  - Verificar resolución de credenciales (fuente = db)
  - Insertar/actualizar una credencial dummy en la tabla afip_credenciales
  - Guardar configuración de emisor básica en bóveda temporal
  - Ejecutar la prueba /api/afip/prueba-factura-1peso en modo mock y modo "real" (stub microservicio)
  - Mostrar un resumen compacto para auditoría: CAE, QR, tipo, fingerprints

Modo de uso:
  (activar tu virtualenv y variables .env ya cargadas)
    python backend/scripts/run_afip_diagnostic_tests.py

NOTA: No contacta realmente al microservicio AFIP: parchea requests.post con un stub
que retorna una respuesta exitosa simulada.
"""

from __future__ import annotations
import os
import json
from datetime import date
from contextlib import contextmanager

import importlib

def main():  # noqa: C901 (intencionalmente procedimental)
    print("==== AFIP DIAGNOSTIC TEST START ====")

    # 1. Imports tardíos para no fallar si entorno incompleto.
    try:
        from sqlmodel import select
        from backend.database import SessionLocal
        from backend.modelos import AfipCredencial
        from backend.utils.afipTools import preflight_afip_credentials
        from backend.utils.afip_tools_manager import guardar_configuracion_emisor
    except Exception as e:
        print(f"[FATAL] No se pudieron importar dependencias del backend: {e}")
        return 1

    TEST_CUIT = os.getenv('TEST_AFIP_CUIT', '20123456789')
    print(f"* Usando CUIT de prueba: {TEST_CUIT}")

    # 2. Preflight antes de tocar nada (para ver baseline)
    pre_before = preflight_afip_credentials(TEST_CUIT)
    print("-- Preflight (antes):", json.dumps(pre_before, indent=2, ensure_ascii=False))

    # 3. Upsert credencial dummy en BD
    dummy_cert = "-----BEGIN CERTIFICATE-----\nMIID...DUMMY...CERT\n-----END CERTIFICATE-----\n"
    dummy_key = "-----BEGIN PRIVATE KEY-----\nMIIE...DUMMY...KEY\n-----END PRIVATE KEY-----\n"
    with SessionLocal() as db:
        row = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == TEST_CUIT)).first()
        if not row:
            row = AfipCredencial(cuit=TEST_CUIT)
            db.add(row)
        row.certificado_pem = dummy_cert
        row.clave_privada_pem = dummy_key
        row.activo = True
        # Simple fingerprint
        import hashlib
        row.fingerprint_cert = hashlib.sha1(dummy_cert.encode()).hexdigest()
        row.fingerprint_key = hashlib.sha1(dummy_key.encode()).hexdigest()
        db.commit(); db.refresh(row)
        print(f"-- Credencial dummy upsert OK (id={row.id})")

    # 4. Configurar emisor en bóveda temporal (para metadata ticket)
    try:
        cfg_res = guardar_configuracion_emisor(
            cuit_empresa=TEST_CUIT,
            razon_social="EMPRESA TEST DIAGNOSTICO",
            nombre_fantasia="TEST IMA",
            condicion_iva="MONOTRIBUTO",
            punto_venta=1,
            direccion="Domicilio Test",
            telefono="000-0000",
            email="test@example.com"
        )
        print("-- Configuración emisor guardada en bóveda:")
        print(json.dumps(cfg_res, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"[WARN] No se pudo guardar configuración de emisor: {e}")

    # 5. Preflight después (debería fuente=boveda o db; ahora con row en DB, esperamos 'db')
    pre_after = preflight_afip_credentials(TEST_CUIT)
    print("-- Preflight (después):", json.dumps(pre_after, indent=2, ensure_ascii=False))

    # 6. Simulación vía endpoint lógico prueba_factura_un_peso (mock=True)
    from backend.app.blueprints.afip import prueba_factura_un_peso
    import asyncio

    async def run_mock():
        return await prueba_factura_un_peso(emisor_cuit=TEST_CUIT, tipo_forzado=11, mock=True)

    mock_result = asyncio.run(run_mock())
    print("-- Resultado endpoint mock (sin microservicio):")
    print(json.dumps(mock_result, indent=2, ensure_ascii=False))

    # 7. Parche requests.post para emular microservicio real
    import requests
    class _FakeResponse:
        status_code = 200
        def json(self):
            return {
                'cae': '12345678901234',
                'vencimiento_cae': str(date.today()),
                'numero_comprobante': 4321,
                'qr_url_afip': 'https://example.com/qr/test-diag'
            }
        def raise_for_status(self):
            return None

    original_post = requests.post
    def fake_post(url, json=None, timeout=20, **kwargs):  # noqa: D401
        return _FakeResponse()

    requests.post = fake_post  # monkeypatch
    try:
        from backend.utils.afipTools import generar_factura_para_venta, ReceptorData
        receptor = ReceptorData(cuit_o_dni='0', condicion_iva='CONSUMIDOR_FINAL', nombre_razon_social='TEST CONSUMIDOR FINAL', domicilio='S/D')
        real_like = generar_factura_para_venta(total=1.0, cliente_data=receptor, emisor_cuit=TEST_CUIT, tipo_forzado=11)
        print("-- Resultado generación 'real-like' (stub microservicio):")
        print(json.dumps(real_like, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"[ERROR] Falló generación con stub microservicio: {e}")
    finally:
        requests.post = original_post

    # 8. Resumen final
    summary = {
        'cuit_test': TEST_CUIT,
        'preflight_inicial_fuente': pre_before.get('fuente'),
        'preflight_final_fuente': pre_after.get('fuente'),
        'fingerprint_cert': pre_after.get('cert_fingerprint'),
        'fingerprint_key': pre_after.get('key_fingerprint'),
        'mock_qr_presente': mock_result.get('resultado_afip', {}).get('qr_present'),
        'mock_tipo': mock_result.get('resultado_afip', {}).get('tipo_comprobante'),
        'mock_cae': mock_result.get('resultado_afip', {}).get('cae'),
    }
    print("-- RESUMEN COMPACTO --")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print("==== AFIP DIAGNOSTIC TEST END ====")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
