from backend.database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        print("Iniciando migración de afip_emisores_empresa...")
        try:
            conn.execute(text("ALTER TABLE afip_emisores_empresa ADD COLUMN ingresos_brutos VARCHAR(255) NULL;"))
            print("Columna ingresos_brutos agregada.")
        except Exception as e:
            print(f"Nota sobre ingresos_brutos: {e}")
            
        try:
            conn.execute(text("ALTER TABLE afip_emisores_empresa ADD COLUMN fecha_inicio_actividades VARCHAR(255) NULL;"))
            print("Columna fecha_inicio_actividades agregada.")
        except Exception as e:
            print(f"Nota sobre fecha_inicio_actividades: {e}")
            
        conn.commit()
        print("Migración finalizada.")

if __name__ == "__main__":
    migrate()
