from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend import config # (y otros que necesites)
from backend.utils.mysql_handler import get_db_connection
from backend.app.blueprints import auth_router, boletas, facturador

app = FastAPI(
    title="API Facturacion IMA",
    description="API para interactuar con el backend del sistema de facturacion",
    version="1.0.0"
)
# --- Configuración de CORS ---
origins = [
    "http://localhost",
    "http://localhost:3000",
    "https://facturador-ima.sistemataup.online/",
    "https://www.facturador-ima.sistemataup.online/",
    "https://www.facturador-ima.sistemataup.online",
]

app.include_router(boletas.router)
app.include_router(auth_router.router)
app.include_router(facturador.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Verificación Inicial ---
@app.on_event("startup")
def startup_event():
    """
    Código que se ejecuta una sola vez al iniciar la API.
    Ideal para verificar conexiones a bases de datos.
    """
    print("--- Evento de Inicio de la API ---")
    print(f"Verificando conexión a la base de datos '{config.DB_NAME}' en '{config.DB_HOST}'...")
    conn = get_db_connection()
    if conn:
        print("✅ Conexión a la base de datos MySQL verificada exitosamente.")
        conn.close()
    else:
        print("❌ ERROR CRÍTICO: No se pudo conectar a la base de datos MySQL.")
        # En un entorno real, podrías decidir si la app debe detenerse aquí.
    
    if config.GOOGLE_SHEET_ID:
        print(f"ℹ️  Google Sheets configurado para reportes (ID: {config.GOOGLE_SHEET_ID[:10]}...).")



@app.get("/saludo")
def read_root():
    return {"message": "Hola, este es un saludo desde el back"}