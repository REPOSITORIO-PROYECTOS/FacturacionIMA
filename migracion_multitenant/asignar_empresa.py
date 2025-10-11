import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from sqlalchemy import text
from backend.database import engine

def asignar_empresa_a_datos_existentes():
    with engine.connect() as connection:
        trans = connection.begin()
        try:
            # Obtener la primera empresa (asumiendo que ya existe)
            empresa_id = connection.execute(text("SELECT id FROM empresas LIMIT 1;")).scalar()
            if not empresa_id:
                print("No hay empresas registradas. Crea una empresa primero.")
                return

            print(f"Asignando empresa ID {empresa_id} a registros existentes...")

            # Tablas a actualizar
            tablas = [
                "usuarios",
                "terceros",
                "categorias",
                "marcas",
                "articulos",
                "compras",
                "ventas",
                "facturaelectronica",
                "caja_sesiones",
                "stock_movimientos"
            ]

            for tabla in tablas:
                try:
                    # Verificar si la columna existe
                    result = connection.execute(text(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{tabla}' AND column_name = 'id_empresa';"))
                    if result.fetchone():
                        # Asignar empresa si no tiene
                        connection.execute(text(f"UPDATE {tabla} SET id_empresa = :empresa_id WHERE id_empresa IS NULL OR id_empresa = 0;"), {"empresa_id": empresa_id})
                        print(f"Actualizada tabla '{tabla}'.")
                    else:
                        print(f"Tabla '{tabla}' no tiene columna id_empresa.")
                except Exception as e:
                    print(f"Error en tabla '{tabla}': {e}")

            trans.commit()
            print("\n¡Asignación completada!")

        except Exception as e:
            print(f"Error: {e}")
            trans.rollback()
            raise

if __name__ == "__main__":
    asignar_empresa_a_datos_existentes()
