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
CREDENTIALS_FILE_PATH = CONFIG_DIR / GOOGLE_SERVICE_ACCOUNT_FILE

if not CREDENTIALS_FILE_PATH.exists():
    raise FileNotFoundError(
        f"CRÍTICO: Archivo de credenciales '{CREDENTIALS_FILE_PATH}' no encontrado. "
        f"Verifica el valor en tu .env y la existencia del archivo en la misma carpeta que config.py."
    )
# ===== FIN DE LA MODIFICACIÓN =====

print(f"DEBUG_CFG: Configuración cargada. Usando GOOGLE_SERVICE_ACCOUNT_FILE='{GOOGLE_SERVICE_ACCOUNT_FILE}'")
for key in ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]:
    print(f"{key} = {os.getenv(key)}")