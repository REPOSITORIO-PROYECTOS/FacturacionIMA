import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from sqlalchemy import text
from backend.database import engine

# --- LISTA DE TABLAS A MODIFICAR ---
TABLAS_A_MIGRAR = [
    "usuarios",
    "terceros",
    "categorias",
    "articulos",
    "compras",
    "ventas",
    "facturaelectronica"
]  # Puedes ajustar según tus modelos

def migrar_a_multitenant():
    with engine.connect() as connection:
        trans = connection.begin()
        try:
            print("Paso 1: Creando tabla 'empresas' si no existe...")
            connection.execute(text('''
                CREATE TABLE IF NOT EXISTS empresas (
                    id SERIAL PRIMARY KEY,
                    nombre VARCHAR(255) NOT NULL,
                    fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            '''))

            print("Paso 2: Añadiendo columnas 'id_empresa' y 'datos_adicionales'...")
            for tabla in TABLAS_A_MIGRAR:
                # Añadir id_empresa
                try:
                    connection.execute(text(f'ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS id_empresa INTEGER REFERENCES empresas(id);'))
                except Exception:
                    pass  # Ya existe
                # Añadir campo JSON (ejemplo solo en facturaelectronica y ventas)
                if tabla in ["facturaelectronica", "ventas"]:
                    try:
                        connection.execute(text(f'ALTER TABLE {tabla} ADD COLUMN IF NOT EXISTS datos_adicionales JSONB;'))
                    except Exception:
                        pass

            print("Paso 3: Creando la empresa principal para los datos existentes...")
            connection.execute(text("INSERT INTO empresas (nombre) VALUES ('Empresa Principal (Datos Migrados)') ON CONFLICT DO NOTHING;"))
            empresa_principal_id = connection.execute(text("SELECT id FROM empresas WHERE nombre = 'Empresa Principal (Datos Migrados)' ORDER BY id ASC LIMIT 1;")).scalar()
            print(f"Empresa principal creada con ID: {empresa_principal_id}")

            print("Paso 4: Asignando todos los registros existentes a la empresa principal...")
            for tabla in TABLAS_A_MIGRAR:
                connection.execute(text(f"UPDATE {tabla} SET id_empresa = :empresa_id WHERE id_empresa IS NULL OR id_empresa = 0;"), {"empresa_id": empresa_principal_id})
                print(f"Actualizada la tabla '{tabla}'.")

            trans.commit()
            print("\n¡Migración completada con éxito! Tus datos están a salvo.")

        except Exception as e:
            print(f"\nERROR: Ocurrió un problema. Revirtiendo cambios. Error: {e}")
            trans.rollback()
            raise

if __name__ == "__main__":
    migrar_a_multitenant()
