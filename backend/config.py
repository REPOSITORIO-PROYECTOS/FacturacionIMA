import os
from dotenv import load_dotenv, find_dotenv
from pathlib import Path  #

# --- Carga de .env ---
# Prefer robust .env loading so the app works on Windows, Linux or CI.
print("--- Cargando config.py (Versión Robusta) ---")

# 1) Si el usuario exportó DOTENV_PATH lo usamos
dotenv_path = os.getenv('DOTENV_PATH')
if dotenv_path and Path(dotenv_path).exists():
    load_dotenv(dotenv_path=dotenv_path)
    print(f"DEBUG_CFG: Cargando .env desde DOTENV_PATH: '{dotenv_path}'")
else:
    # 2) Intentar localizar automáticamente con find_dotenv()
    found = find_dotenv()
    if found:
        load_dotenv(found)
        dotenv_path = found
        print(f"DEBUG_CFG: find_dotenv() encontró: '{dotenv_path}'")
    else:
        # 3) Intentar un .env relativo al repo (dos niveles arriba del archivo config.py)
        candidate = Path(__file__).resolve().parents[1] / '.env'
        if candidate.exists():
            load_dotenv(dotenv_path=str(candidate))
            dotenv_path = str(candidate)
            print(f"DEBUG_CFG: Cargando .env desde candidato relativo: '{dotenv_path}'")
        else:
            dotenv_path = None
            print("DEBUG_CFG: No se encontró archivo .env automáticamente.")
# --- Fin Carga .env ---

# --- SEGURIDAD-----
SECRET_KEY_SEC= os.getenv('SECRET_KEY_SEGURIDAD')

# --- Variables de Conexión ---
GOOGLE_SHEET_ID = os.getenv('GOOGLE_SHEET_ID')
GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_SERVICE_ACCOUNT_FILE', "credencial_IA.json") # Default simple

# ===== AÑADE ESTA SECCIÓN AQUÍ =====
DB_HOST = os.getenv("DB_HOST")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# Permitir redirigir la app completa a la nueva base si se exporta USE_NEW_DB=1
if os.getenv('USE_NEW_DB','0').strip() in ('1','true','yes','on'):
    NEW_DB_HOST = os.getenv('NEW_DB_HOST') or DB_HOST
    NEW_DB_USER = os.getenv('NEW_DB_USER') or DB_USER
    NEW_DB_PASSWORD = os.getenv('NEW_DB_PASSWORD') or DB_PASSWORD
    NEW_DB_NAME = os.getenv('NEW_DB_NAME') or DB_NAME
    if NEW_DB_HOST and NEW_DB_USER and NEW_DB_PASSWORD and NEW_DB_NAME:
        print('DEBUG_CFG: Redirigiendo conexión principal a NUEVA BD (USE_NEW_DB=1)')
        DB_HOST, DB_USER, DB_PASSWORD, DB_NAME = NEW_DB_HOST, NEW_DB_USER, NEW_DB_PASSWORD, NEW_DB_NAME
    else:
        print('ADVERTENCIA: USE_NEW_DB=1 pero faltan variables NEW_DB_*, se mantiene BD original.')
# ===================================


# Configuración y Administración
CONFIGURACION_GLOBAL_SHEET = os.getenv('SHEET_NAME_CONFIGURACION_GLOBAL', 'ConfiguracionGlobal')
USUARIOS_SHEET = os.getenv('SHEET_NAME_USUARIOS', 'Usuarios')


ADMIN_TOKEN_DURATION_SECONDS = int(os.getenv('ADMIN_TOKEN_DURATION_SECONDS', 8 * 60 * 60))

# Usuario administrador estático (solo para desarrollo / fallback)
STATIC_ADMIN_USER = os.getenv('STATIC_ADMIN_USER', 'admin')
STATIC_ADMIN_PASS = os.getenv('STATIC_ADMIN_PASS', 'admin123')

# --- Verificaciones Críticas ---

if not GOOGLE_SERVICE_ACCOUNT_FILE:
     raise ValueError("CRÍTICO: GOOGLE_SERVICE_ACCOUNT_FILE no está configurado en .env.")


#===========================FACTURADOR (Hardening)=========================================
def _parse_bool(v: str | None, default: bool = False) -> bool:
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "t", "yes", "y", "on")

# Flag para permitir explícitamente el uso de credenciales desde variables de entorno.
# Por defecto DESACTIVADO para obligar a usar la bóveda de certificados.
AFIP_ENABLE_ENV_CREDS = _parse_bool(os.getenv("AFIP_ENABLE_ENV_CREDS"), False)

# Siempre podemos tener un CUIT "por defecto" para seleccionar en la bóveda, pero
# NO cargamos directamente certificado ni clave a menos que la flag lo permita.
AFIP_CUIT: str | None = os.getenv("AFIP_CUIT")
if AFIP_ENABLE_ENV_CREDS:
    AFIP_CERT: str | None = os.getenv("AFIP_CERT")
    AFIP_KEY: str | None = os.getenv("AFIP_KEY")
    if AFIP_CERT and AFIP_KEY:
        print("DEBUG_CFG: Uso de credenciales AFIP desde entorno ACTIVADO por AFIP_ENABLE_ENV_CREDS=1")
    else:
        print("ADVERTENCIA: AFIP_ENABLE_ENV_CREDS=1 pero faltan AFIP_CERT o AFIP_KEY en entorno.")
else:
    AFIP_CERT = None
    AFIP_KEY = None
    if os.getenv("AFIP_CERT") or os.getenv("AFIP_KEY"):
        print("DEBUG_CFG: Credenciales AFIP presentes en entorno pero IGNORADAS (AFIP_ENABLE_ENV_CREDS=0).")

AFIP_COND_EMISOR : str | None = os.getenv("AFIP_COND_EMISOR")
AFIP_PUNTO_VENTA : str | None = os.getenv("AFIP_PUNTO_VENTA")
    # URL del microservicio de facturación
FACTURACION_API_URL: str = os.getenv("FACTURACION_API_URL", "http://localhost:8002/afipws/facturador")

#===========================FIN FACTURADOR=========================================


CONFIG_DIR = Path(__file__).resolve().parent 
# Ruta completa y absoluta al archivo .json
DEV_MODE = os.getenv('DEV_MODE', '0') == '1'

CREDENTIALS_FILE_PATH = CONFIG_DIR / GOOGLE_SERVICE_ACCOUNT_FILE

if not CREDENTIALS_FILE_PATH.exists():
    msg = (
        f"CRÍTICO: Archivo de credenciales '{CREDENTIALS_FILE_PATH}' no encontrado. "
        "Verifica GOOGLE_SERVICE_ACCOUNT_FILE en .env."
    )
    if DEV_MODE:
        print("⚠️  AVISO (DEV_MODE=1): " + msg + " Continuando sin abortar.")
    else:
        raise FileNotFoundError(msg + " (Establece DEV_MODE=1 para no abortar en desarrollo).")
# ===== FIN DE LA MODIFICACIÓN =====

# Construir la URL de SQLAlchemy
DATABASE_URL = ""
if DB_HOST and DB_USER and DB_NAME:
    # Usar mysql+pymysql como driver
    # Si DB_PASSWORD es None o vacío, la URL no debe tener ":None@"
    pwd_part = f":{DB_PASSWORD}" if DB_PASSWORD else ""
    DATABASE_URL = f"mysql+pymysql://{DB_USER}{pwd_part}@{DB_HOST}:3306/{DB_NAME}"
elif os.getenv("SQLITE_DB_PATH"):
    # Fallback a SQLite si se prefiere en dev
    DATABASE_URL = f"sqlite:///{os.getenv('SQLITE_DB_PATH')}"
else:
    # Fallback seguro para que no rompa importaciones si no hay DB configurada
    DATABASE_URL = "sqlite:///:memory:"

print(f"DEBUG_CFG: Configuración cargada. Usando GOOGLE_SERVICE_ACCOUNT_FILE='{GOOGLE_SERVICE_ACCOUNT_FILE}'")
for key in ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]:
    print(f"{key} = {os.getenv(key)}")