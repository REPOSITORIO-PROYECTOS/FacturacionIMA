"""Migration script to enlarge afip_credenciales PEM columns from VARCHAR(255) to MEDIUMTEXT.

Execute once after deploying model change to avoid truncation of real certificates.

Usage:
  PYTHONPATH=. python backend/scripts/migrate_afip_credentials_columns.py
"""
from __future__ import annotations
from backend.database import engine
from sqlalchemy import text

STATEMENTS = [
    "ALTER TABLE afip_credenciales MODIFY certificado_pem MEDIUMTEXT NULL",
    "ALTER TABLE afip_credenciales MODIFY clave_privada_pem MEDIUMTEXT NULL",
]

def main():
    with engine.begin() as conn:
        for stmt in STATEMENTS:
            print(f"-> {stmt}")
            conn.execute(text(stmt))
    print("Migration completed.")

if __name__ == "__main__":
    main()
