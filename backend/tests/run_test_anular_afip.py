import os
from types import SimpleNamespace

from fastapi import HTTPException

from backend.app.blueprints import facturador as mod


class FakeRow:
    def __init__(self):
        self.id = 73
        self.tipo_comprobante = 11
        self.cae = "CAE-ORIG"
        self.punto_venta = 1
        self.numero_comprobante = 123
        self.cuit_emisor = "20123456789"
        self.tipo_doc_receptor = 80
        self.nro_doc_receptor = "20333444556"
        self.importe_total = 100.0
        self.fecha_comprobante = "2025-01-01"
        self.anulada = False
        self.codigo_nota_credito = None


class FakeSession:
    def __init__(self, row: FakeRow):
        self._row = row
    def get(self, _model, _id):
        return self._row if _id == self._row.id else None
    def add(self, _row):
        pass
    def commit(self):
        pass
    def rollback(self):
        pass
    def close(self):
        pass


class RespOK:
    status_code = 200
    headers = {"Content-Type": "application/json"}
    text = "{\"cae\": \"CAE-NC-OK\"}"
    def json(self):
        return {"cae": "CAE-NC-OK"}


class RespFail:
    status_code = 500
    headers = {"Content-Type": "text/plain"}
    text = "microservice error"
    def json(self):
        return {"error": "fail"}


def test_ok():
    row = FakeRow()
    mod.SessionLocal = lambda: FakeSession(row)
    def fake_post(url, json=None, timeout=None, headers=None):
        return RespOK()
    import backend.app.blueprints.facturador as f
    import builtins
    import types
    # monkeypatch requests.post
    import requests
    real_post = requests.post
    requests.post = fake_post
    try:
        res = mod.anular_afip.__wrapped__(73, mod.AnularAfipPayload(motivo="prueba", force=True)) if hasattr(mod.anular_afip, "__wrapped__") else None
        if res is None:
            # call directly if not wrapped by FastAPI dependency tools
            import asyncio
            res = asyncio.get_event_loop().run_until_complete(mod.anular_afip(73, mod.AnularAfipPayload(motivo="prueba", force=True)))
        assert res.get("status") == "OK"
        assert str(res.get("codigo_nota_credito")) == "CAE-NC-OK"
        print("PASS ok")
    finally:
        requests.post = real_post


def test_fail():
    row = FakeRow()
    mod.SessionLocal = lambda: FakeSession(row)
    def fake_post(url, json=None, timeout=None, headers=None):
        return RespFail()
    import requests
    real_post = requests.post
    requests.post = fake_post
    try:
        import asyncio
        try:
            asyncio.get_event_loop().run_until_complete(mod.anular_afip(73, mod.AnularAfipPayload(motivo="prueba")))
            raise AssertionError("expected HTTPException")
        except HTTPException as he:
            assert he.status_code == 502
            print("PASS fail→HTTP 502")
    finally:
        requests.post = real_post


if __name__ == "__main__":
    os.environ["FACTURACION_API_URL"] = "https://facturador-ima.sistemataup.online/afipws/facturador"
    test_ok()
    test_fail()
    print("All tests passed")
