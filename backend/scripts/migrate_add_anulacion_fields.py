import sys
from sqlalchemy import text as sa_text
from backend.database import SessionLocal

def column_exists(db, table, column):
    q = sa_text("""
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = :table AND COLUMN_NAME = :column
    """)
    return bool(db.execute(q, {"table": table, "column": column}).scalar())

def main():
    db = SessionLocal()
    try:
        if not column_exists(db, "facturas_electronicas", "anulada"):
            db.execute(sa_text("ALTER TABLE facturas_electronicas ADD COLUMN anulada TINYINT(1) DEFAULT 0"))
            print("OK: Columna anulada añadida")
        if not column_exists(db, "facturas_electronicas", "fecha_anulacion"):
            db.execute(sa_text("ALTER TABLE facturas_electronicas ADD COLUMN fecha_anulacion DATE NULL"))
            print("OK: Columna fecha_anulacion añadida")
        if not column_exists(db, "facturas_electronicas", "codigo_nota_credito"):
            db.execute(sa_text("ALTER TABLE facturas_electronicas ADD COLUMN codigo_nota_credito VARCHAR(64) NULL"))
            print("OK: Columna codigo_nota_credito añadida")
        if not column_exists(db, "facturas_electronicas", "motivo_anulacion"):
            db.execute(sa_text("ALTER TABLE facturas_electronicas ADD COLUMN motivo_anulacion VARCHAR(255) NULL"))
            print("OK: Columna motivo_anulacion añadida")
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"ERROR en migración: {e}")
        sys.exit(2)
    finally:
        db.close()

if __name__ == "__main__":
    main()
