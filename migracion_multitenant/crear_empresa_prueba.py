import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from sqlalchemy import text
from backend.database import engine

def crear_empresa_prueba():
    with engine.connect() as connection:
        trans = connection.begin()
        try:
            # Verificar si ya existe
            existe = connection.execute(text("SELECT id FROM empresas WHERE nombre_legal = 'Empresa Prueba' LIMIT 1;")).scalar()
            if existe:
                print("Empresa de prueba ya existe.")
                return existe

            # Crear empresa
            connection.execute(text("""
                INSERT INTO empresas (nombre_legal, nombre_fantasia, cuit, activa)
                VALUES ('Empresa Prueba', 'Prueba SA', '20304050607', true);
            """))
            empresa_id = connection.execute(text("SELECT id FROM empresas WHERE nombre_legal = 'Empresa Prueba' LIMIT 1;")).scalar()
            trans.commit()
            print(f"Empresa de prueba creada con ID: {empresa_id}")
            return empresa_id

        except Exception as e:
            print(f"Error creando empresa: {e}")
            trans.rollback()
            raise

if __name__ == "__main__":
    crear_empresa_prueba()
