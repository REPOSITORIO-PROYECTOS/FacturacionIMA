"""Import AFIP credentials from environment variables into DB (afip_credenciales).

Reads env vars:
  AFIP_CUIT, AFIP_CERT, AFIP_KEY

If present, upserts into DB (activating the record). Prints fingerprints and lengths only.

Usage:
  PYTHONPATH=. python backend/scripts/import_env_afip_credentials.py
"""
from __future__ import annotations
import os, hashlib
from sqlmodel import select
from backend.database import SessionLocal
from backend.modelos import AfipCredencial


def sha1(txt: str | None) -> str | None:
    if not txt:
        return None
    return hashlib.sha1(txt.encode('utf-8', errors='ignore')).hexdigest()


def main():
    cuit = os.getenv('AFIP_CUIT')
    cert = os.getenv('AFIP_CERT')
    key = os.getenv('AFIP_KEY')
    if not (cuit and cert and key):
        print("[ABORT] Missing one of AFIP_CUIT / AFIP_CERT / AFIP_KEY env variables.")
        return 1
    cuit = cuit.strip()
    with SessionLocal() as db:
        row = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == cuit)).first()
        if not row:
            row = AfipCredencial(cuit=cuit)
            db.add(row)
        row.certificado_pem = cert
        row.clave_privada_pem = key
        row.fingerprint_cert = sha1(cert)
        row.fingerprint_key = sha1(key)
        row.activo = True
        db.commit(); db.refresh(row)
        print("[OK] Credentials imported to DB.")
        print({
            'cuit': row.cuit,
            'fingerprint_cert': row.fingerprint_cert,
            'fingerprint_key': row.fingerprint_key,
            'len_cert': len(cert),
            'len_key': len(key)
        })
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
