from backend.database import engine
from sqlalchemy import text

def add_column():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE ingresos_sheets ADD COLUMN id_empresa INTEGER DEFAULT 1"))
            conn.commit()
            print("Column added successfully")
        except Exception as e:
            print(f"Error (maybe column exists): {e}")

if __name__ == "__main__":
    add_column()
