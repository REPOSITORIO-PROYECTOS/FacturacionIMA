# back/database.py
# VERSIÓN CORREGIDA Y COMPATIBLE

import os
from sqlmodel import create_engine, Session, SQLModel
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

def _get(val: str):
    v = os.getenv(val)
    return v.strip() if isinstance(v, str) else v

DB_HOST = _get("DB_HOST")
DB_USER = _get("DB_USER")
DB_PASSWORD = _get("DB_PASSWORD")
DB_NAME = _get("DB_NAME")
DB_PORT = _get("DB_PORT") or "3306"

USE_NEW = (_get('USE_NEW_DB') or '0').lower() in ('1','true','yes','on')
NEW_DB_HOST = _get('NEW_DB_HOST')
NEW_DB_USER = _get('NEW_DB_USER')
NEW_DB_PASSWORD = _get('NEW_DB_PASSWORD')
NEW_DB_NAME = _get('NEW_DB_NAME')

if USE_NEW and all([NEW_DB_HOST, NEW_DB_USER, NEW_DB_PASSWORD, NEW_DB_NAME]):
    print('[DB] Override -> usando NEW_DB_*')
    DB_HOST, DB_USER, DB_PASSWORD, DB_NAME = NEW_DB_HOST, NEW_DB_USER, NEW_DB_PASSWORD, NEW_DB_NAME
elif USE_NEW:
    print('[DB] USE_NEW_DB=1 pero faltan variables NEW_DB_* completas; se mantiene base original')

if not all([DB_USER, DB_PASSWORD, DB_HOST, DB_NAME]):
    raise ValueError('Faltan variables de entorno para la base de datos (DB_* o NEW_DB_* incompletas).')

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
print(f"[DB] DATABASE_URL destino (ocultando password): mysql+pymysql://{DB_USER}:***@{DB_HOST}:{DB_PORT}/{DB_NAME}")

# Aumentamos el pool de conexiones para evitar QueuePool limit errors en procesos de fondo (DB-Sync)
engine = create_engine(
    DATABASE_URL, 
    echo=False, # Reducimos verbosidad en producción si es posible, o mantenemos True si prefieres debug
    pool_size=20, 
    max_overflow=40,
    pool_recycle=3600,
    pool_pre_ping=True
)

# --- ESTA ES LA ADICIÓN CLAVE ---
# Creamos una "Fábrica de Sesiones" que puede ser importada y usada por scripts externos.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session) # <--- 2. AÑADIMOS ESTA LÍNEA

# --- TU CÓDIGO ORIGINAL SE MANTIENE ---
# Esta función sigue siendo perfecta para la inyección de dependencias de FastAPI.
def get_db():
    db = SessionLocal() # Ahora usamos SessionLocal para crear la sesión
    try:
        yield db
    finally:
        db.close()

def create_db_and_tables():
    # Para evitar importaciones circulares, importamos los modelos aquí dentro
    from backend import modelos 
    print("Creando tablas en la base de datos...")
    SQLModel.metadata.create_all(engine)
    print("Tablas creadas exitosamente.")