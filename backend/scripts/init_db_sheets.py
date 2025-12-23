from sqlmodel import SQLModel, create_engine
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.config import DATABASE_URL
from backend import modelos

def create_tables():
    print(f"Conectando a BD: {DATABASE_URL}")
    engine = create_engine(DATABASE_URL)
    print("Creando tablas faltantes...")
    SQLModel.metadata.create_all(engine)
    print("Tablas creadas/actualizadas exitosamente.")

if __name__ == "__main__":
    create_tables()
