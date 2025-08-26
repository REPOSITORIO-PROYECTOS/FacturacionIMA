import os
from dotenv import load_dotenv, find_dotenv
from pathlib import Path  #

# --- Carga de .env ---
print("--- Cargando config.py (Versión Explícita) ---")

# Definimos la ruta absoluta al archivo .env
# Esto elimina cualquier ambigüedad sobre dónde buscarlo.
dotenv_path = "/home/sgi_user/proyectos/facturacionIMA/.env"

# Cargamos las variables desde esa ruta específica
load_dotenv(dotenv_path=dotenv_path)

print(f"DEBUG_CFG: Intentando cargar .env desde: '{dotenv_path}'")
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

# --- Verificaciones Críticas ---

if not GOOGLE_SERVICE_ACCOUNT_FILE:
     raise ValueError("CRÍTICO: GOOGLE_SERVICE_ACCOUNT_FILE no está configurado en .env.")


#===========================FACTURADOR=========================================
AFIP_CUIT: str = os.getenv("AFIP_CUIT")
AFIP_CERT: str = os.getenv("AFIP_CERT")
AFIP_KEY: str = os.getenv("AFIP_KEY")

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
# ...