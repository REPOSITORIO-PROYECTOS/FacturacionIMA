import sys
from sqlmodel import Session
from sqlalchemy import text as sa_text

try:
    from backend.database import SessionLocal
except Exception as e:
    print(f"ERROR: No se pudo importar SessionLocal: {e}")
    sys.exit(1)

def column_exists(db: Session, table: str, column: str) -> bool:
    q = sa_text("""
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = :table AND COLUMN_NAME = :column
    """)
    res = db.execute(q, {"table": table, "column": column}).scalar()
    return bool(res)

def main():
    db = SessionLocal()
    try:
        # aplicar_desglose_77
        if not column_exists(db, "configuracion_empresa", "aplicar_desglose_77"):
            db.execute(sa_text("ALTER TABLE configuracion_empresa ADD COLUMN aplicar_desglose_77 TINYINT(1) DEFAULT 0"))
            print("OK: Columna aplicar_desglose_77 añadida")
        else:
            print("SKIP: aplicar_desglose_77 ya existe")

        # detalle_empresa_text
        if not column_exists(db, "configuracion_empresa", "detalle_empresa_text"):
            db.execute(sa_text("ALTER TABLE configuracion_empresa ADD COLUMN detalle_empresa_text VARCHAR(255) NULL"))
            print("OK: Columna detalle_empresa_text añadida")
        else:
            print("SKIP: detalle_empresa_text ya existe")

        db.commit()
        print("Migración completada")
    except Exception as e:
        db.rollback()
        print(f"ERROR en migración: {e}")
        sys.exit(2)
    finally:
        db.close()

if __name__ == "__main__":
    main()

