import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend import config # (y otros que necesites)
from backend.utils.mysql_handler import get_db_connection
from backend.app.blueprints import auth_router, boletas, facturador, tablas, afip, setup, usuarios, impresion, ventas_detalle, comprobantes, sheets_boletas, admin_empresa  # NUEVO: administración global de empresas

app = FastAPI(
    title="API Facturacion IMA",
    description="API para interactuar con el backend del sistema de facturacion",
    version="1.0.0"
)
# --- Configuración de CORS ---
origins = [
    # Orígenes para desarrollo local
    "https://localhost",
    "https://localhost:3000",
    
    # Orígenes para producción (sin www y con www)
    "https://facturador-ima.sistemataup.online",
    "https://www.facturador-ima.sistemataup.online",
]

# ...existing code...

API_PREFIX = os.getenv('API_PREFIX', '').strip()

def _mount(router):
    # Si se define un prefijo global (ej /api) y el router no lo tiene ya, recrear con prefix compuesto
    if API_PREFIX and not router.prefix.startswith(API_PREFIX):
        # FastAPI no soporta cambiar prefix directamente; asumimos routers ya correctos excepto facturador
        app.include_router(router, prefix=API_PREFIX + router.prefix)
    else:
        app.include_router(router)

_mount(boletas.router)
_mount(impresion.router)
_mount(auth_router.router)
_mount(facturador.router)
if ventas_detalle:  # Condicional: solo montar si el módulo se importó
    _mount(ventas_detalle.router)
if comprobantes:  # Condicional: solo montar si el módulo se importó
    _mount(comprobantes.router)
if sheets_boletas:  # Nuevo: endpoint para Google Sheets
    _mount(sheets_boletas.router)
# tablas.router no existe, se comenta para evitar error
# app.include_router(tablas.router)
# afip.router already uses prefix '/api' internally; include it directly
if afip:
    app.include_router(afip.router)
# setup.router for temporal user creation
if setup:
    app.include_router(setup.router)
# usuarios.router para gestión de usuarios
app.include_router(usuarios.router)

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
        dev_mode = os.getenv('DEV_MODE', '0') == '1'
        if dev_mode:
            print("⚠️  ADVERTENCIA: No se pudo conectar a MySQL, pero arrancando en modo DEV (DEV_MODE=1).")
        else:
            print("❌ ERROR CRÍTICO: No se pudo conectar a la base de datos MySQL.")
            # En producción podrías decidir cerrar la app; aquí solo lo registramos.
    
    if config.GOOGLE_SHEET_ID:
        print(f"ℹ️  Google Sheets configurado para reportes (ID: {config.GOOGLE_SHEET_ID[:10]}...).")

    # Listar rutas para depuración
    try:
        print("--- Rutas registradas ---")
        for r in app.router.routes:
            try:
                methods = ",".join(sorted(getattr(r, 'methods', [])))
                print(f"{methods:15} {getattr(r, 'path', '')}")
            except Exception:
                continue
        print("--------------------------")
    except Exception:
        pass



@app.get("/saludo")
def read_root():
    return {"message": "Hola, este es un saludo desde el back"}


@app.get("/healthz", tags=["infra"], summary="Health check básico")
def healthz():
    """Devuelve el estado básico del servicio para monitoreo / load balancers.

    Incluye:
    - estado: always 'ok' si entra al handler
    - version de la app
    - base de datos: true/false según conexión MySQL
    - google_sheets: true/false si hay configuración de sheet
    """
    db_ok = False
    try:
        conn = get_db_connection()
        if conn:
            db_ok = True
            conn.close()
    except Exception:
        db_ok = False

    return {
        "status": "ok",
        "version": "1.0.0",
        "database": db_ok,
        "google_sheets": bool(config.GOOGLE_SHEET_ID),
    }

# Al final del montaje de routers:
if admin_empresa:
    app.include_router(admin_empresa.router)