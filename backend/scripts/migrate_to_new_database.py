"""Script de migración desde una BD MySQL LEGACY a una nueva BD propia.

USO:
  1. Exporta / configura en .env las variables (pueden estar en un .env separado):
     LEGACY_DB_HOST, LEGACY_DB_USER, LEGACY_DB_PASSWORD, LEGACY_DB_NAME
     NEW_DB_HOST, NEW_DB_USER, NEW_DB_PASSWORD, NEW_DB_NAME
  2. (Opcional) Crea el nuevo schema vacío en MySQL: CREATE DATABASE NEW_DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  3. Activa el entorno virtual:  source .venv/bin/activate
  4. Ejecuta:  python backend/scripts/migrate_to_new_database.py
  5. Verifica el resumen final y valida conteos.

QUÉ HACE:
  - Carga los modelos SQLModel y crea todas las tablas en la NUEVA base.
  - Copia datos tabla por tabla desde LEGACY a NEW para aquellas tablas que existan en la legacy.
  - Desactiva claves foráneas durante el copiado para evitar problemas de orden.
  - Usa INSERT IGNORE para no fallar si hay registros ya insertados (puedes cambiarlo por REPLACE si quieres sobrescribir).

LIMITACIONES / NOTAS:
  - Supone que el esquema legacy es compatible (mismas columnas). Si hay columnas extra en legacy se ignoran.
  - Si faltan columnas nuevas que añadimos aquí (p.ej. columnas de diagnóstico) quedarán NULL.
  - Puedes personalizar la lista TABLAS_PRIORITARIAS para forzar orden.
"""
from __future__ import annotations
import os
import sys
from typing import List, Dict, Any
import mysql.connector
from mysql.connector import Error
from sqlmodel import SQLModel, create_engine

# Asegurar que el backend esté en sys.path
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if ROOT not in sys.path:
    sys.path.append(ROOT)

try:
    from backend import modelos  # noqa: F401  (Importa todas las definiciones de tablas)
except Exception as e:
    print(f"ERROR: No se pudieron importar los modelos: {e}")
    sys.exit(1)

# Leer variables de entorno
LEGACY_DB_HOST = os.getenv("LEGACY_DB_HOST")
LEGACY_DB_USER = os.getenv("LEGACY_DB_USER")
LEGACY_DB_PASSWORD = os.getenv("LEGACY_DB_PASSWORD")
LEGACY_DB_NAME = os.getenv("LEGACY_DB_NAME")

NEW_DB_HOST = os.getenv("NEW_DB_HOST")
NEW_DB_USER = os.getenv("NEW_DB_USER")
NEW_DB_PASSWORD = os.getenv("NEW_DB_PASSWORD")
NEW_DB_NAME = os.getenv("NEW_DB_NAME")

missing_legacy = [k for k,v in {
    'LEGACY_DB_HOST':LEGACY_DB_HOST,
    'LEGACY_DB_USER':LEGACY_DB_USER,
    'LEGACY_DB_PASSWORD':LEGACY_DB_PASSWORD,
    'LEGACY_DB_NAME':LEGACY_DB_NAME
}.items() if not v]
missing_new = [k for k,v in {
    'NEW_DB_HOST':NEW_DB_HOST,
    'NEW_DB_USER':NEW_DB_USER,
    'NEW_DB_PASSWORD':NEW_DB_PASSWORD,
    'NEW_DB_NAME':NEW_DB_NAME
}.items() if not v]

if missing_legacy:
    print(f"ADVERTENCIA: Faltan variables de LEGACY: {missing_legacy}")
if missing_new:
    print(f"ERROR: Faltan variables de NUEVA BD: {missing_new}")
    sys.exit(1)

if missing_legacy:
    print("Se continuará, pero sólo se crearán tablas en la nueva BD (no habrá copia de datos).")

# Crear engine para nueva base
new_engine_url = f"mysql+pymysql://{NEW_DB_USER}:{NEW_DB_PASSWORD}@{NEW_DB_HOST}/{NEW_DB_NAME}"
print(f"Creando engine nueva BD: {new_engine_url}")
new_engine = create_engine(new_engine_url, echo=False)

print("Creando tablas en la NUEVA base (si no existen)...")
SQLModel.metadata.create_all(new_engine)
print("Tablas creadas / verificadas.")

# Obtener listado de tablas de nuestros modelos
model_tables = {t.name: t for t in SQLModel.metadata.tables.values()}

# Orden manual recomendado (para minimizar dependencias):
TABLAS_PRIORITARIAS = [
    'empresas','configuracion_empresa','roles','usuarios','terceros',
    'categorias','marcas','articulos','articulo_codigos','articulo_proveedor','articulo_combo',
    'caja_sesiones','caja_movimientos','ventas','venta_detalle','compras','compra_detalle',
    'stock_movimientos','facturas_electronicas','llave_maestra','descuento_proveedor',
    'plantilla_mapeo_proveedor','articulo_proveedor' # (repetido safe) 
]

# Añadir cualquier otra tabla que no esté listada
for tbl in model_tables:
    if tbl not in TABLAS_PRIORITARIAS:
        TABLAS_PRIORITARIAS.append(tbl)

summary: Dict[str, Dict[str, Any]] = {}

if not missing_legacy:
    print("Conectando a LEGACY (origen)...")
    try:
        legacy_conn = mysql.connector.connect(
            host=LEGACY_DB_HOST,
            user=LEGACY_DB_USER,
            password=LEGACY_DB_PASSWORD,
            database=LEGACY_DB_NAME
        )
    except Error as e:
        print(f"ERROR: No se pudo conectar a la BD LEGACY: {e}")
        sys.exit(1)

    if not legacy_conn.is_connected():
        print("ERROR: Conexión legacy no establecida.")
        sys.exit(1)

    print("Conectando a NUEVA (destino raw para inserciones)...")
    try:
        new_raw_conn = mysql.connector.connect(
            host=NEW_DB_HOST,
            user=NEW_DB_USER,
            password=NEW_DB_PASSWORD,
            database=NEW_DB_NAME
        )
    except Error as e:
        print(f"ERROR: No se pudo conectar a la nueva BD: {e}")
        sys.exit(1)

    legacy_cur = legacy_conn.cursor()
    new_cur = new_raw_conn.cursor()

    # Obtener tablas existentes en legacy
    legacy_cur.execute("SHOW TABLES")
    legacy_tables = {row[0] for row in legacy_cur.fetchall()}

    # Desactivar FK checks
    new_cur.execute("SET FOREIGN_KEY_CHECKS=0")

    for table_name in TABLAS_PRIORITARIAS:
        if table_name not in legacy_tables:
            summary[table_name] = {"status": "SKIPPED_NO_SOURCE"}
            continue
        if table_name not in model_tables:
            summary[table_name] = {"status": "SKIPPED_NOT_IN_MODELS"}
            continue
        print(f"Copiando tabla: {table_name} ...")
        try:
            legacy_cur.execute(f"SELECT * FROM `{table_name}`")
            rows = legacy_cur.fetchall()
            if not rows:
                summary[table_name] = {"status": "EMPTY"}
                continue
            # Columnas en origen
            source_cols = [d[0] for d in legacy_cur.description]
            # Columnas en destino (modelo)
            dest_cols = [c.name for c in model_tables[table_name].columns]
            # Intersección manteniendo orden de origen para mapear filas correctamente
            common_cols = [c for c in source_cols if c in dest_cols]
            if not common_cols:
                summary[table_name] = {"status": "NO_COMMON_COLUMNS"}
                continue
            placeholders = ",".join(["%s"] * len(common_cols))
            col_list_sql = ",".join(f"`{c}`" for c in common_cols)
            insert_sql = f"INSERT IGNORE INTO `{table_name}` ({col_list_sql}) VALUES ({placeholders})"
            count = 0
            for row in rows:
                # Map row into common cols indexes
                idx_map = [source_cols.index(c) for c in common_cols]
                values = [row[i] for i in idx_map]
                new_cur.execute(insert_sql, values)
                count += 1
            new_raw_conn.commit()
            summary[table_name] = {"status": "COPIED", "rows": count, "columns": len(common_cols)}
        except Exception as e:
            new_raw_conn.rollback()
            summary[table_name] = {"status": "ERROR", "error": str(e)}
            print(f"  ERROR copiando {table_name}: {e}")

    # Reactivar FK checks
    new_cur.execute("SET FOREIGN_KEY_CHECKS=1")
    legacy_cur.close(); legacy_conn.close()
    new_cur.close(); new_raw_conn.close()
else:
    print("No se migró (faltan variables LEGACY). Sólo se generó el esquema en la nueva BD.")

print("\n==== RESUMEN MIGRACIÓN ====")
for t, info in summary.items():
    print(f"{t}: {info}")
print("Listo.")

if __name__ == '__main__':
    # Nada adicional; la lógica ya se ejecuta al importar/ejecutar
    pass
