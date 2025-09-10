import sys
import os
import requests
import logging
from datetime import datetime

# --- PASO 1: Configurar el entorno para que Python encuentre tus módulos ---
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

# Ahora podemos importar el handler que lee los datos del Google Sheet
from backend.utils.tablasHandler import TablasHandler

# --- PASO 2: Configurar un log para saber qué está pasando ---
log_file_path = os.path.join(project_root, 'facturacion_automatica.log')
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file_path),
        logging.StreamHandler()
    ]
)

# --- PASO 3: Definir la URL de tu endpoint ---
API_URL = "https://facturador-ima.sistemataup.online/api/facturador/facturar-por-cantidad"

def parse_monto(monto: str) -> float:
    if not monto or not isinstance(monto, str): return 0.0
    numero_limpio = monto.replace('$', '').replace('.', '').replace(',', '.').strip()
    return float(numero_limpio) if numero_limpio else 0.0

def ejecutar_facturacion_automatica():
    logging.info("--- INICIANDO PROCESO DE FACTURACIÓN AUTOMÁTICA ---")
    
    try:
        # --- TAREA 1: OBTENER BOLETAS PENDIENTES ---
        handler = TablasHandler()
        todas_las_boletas = handler.cargar_ingresos()
        boletas_a_facturar = [
            b for b in todas_las_boletas 
            if b.get("facturacion") == "falta facturar"
        ]

        if not boletas_a_facturar:
            logging.info("No se encontraron boletas pendientes. Proceso finalizado.")
            return

        logging.info(f"Se encontraron {len(boletas_a_facturar)} boletas pendientes.")

        # --- TAREA 2: PREPARAR LOS DATOS PARA LA API ---
        # Convertimos los datos del Google Sheet al formato que espera tu endpoint (InvoiceItemPayload)
        payloads = []
        for boleta in boletas_a_facturar:
            total = parse_monto(boleta.get("INGRESOS", "0"))
            if total > 0:
                payloads.append({
                    "id": boleta.get("ID Ingresos"),
                    "total": total,
                    "cliente_data": {
                        "cuit_o_dni": str(boleta.get("CUIT", "0")),
                        "nombre_razon_social": boleta.get("Razon Social") or boleta.get("Cliente") or "Consumidor Final",
                        "domicilio": boleta.get("Domicilio", ""),
                        "condicion_iva": boleta.get("condicion-iva") or "CONSUMIDOR_FINAL"
                    }
                })
        
        if not payloads:
            logging.info("Ninguna boleta pendiente tenía un monto válido para facturar. Proceso finalizado.")
            return

        # --- TAREA 3: LLAMAR A TU PROPIO ENDPOINT ---
        logging.info(f"Enviando lote de {len(payloads)} facturas a la API en {API_URL}")
        
        response = requests.post(API_URL, json=payloads)
        
        # --- TAREA 4: REGISTRAR EL RESULTADO ---
        if response.status_code == 200:
            logging.info("La API procesó el lote exitosamente.")
            # Aquí deberías añadir la lógica para actualizar el Google Sheet
            # y marcar estas boletas como "facturado (auto)" para no volver a procesarlas.
        else:
            logging.error(f"Error al llamar a la API. Status: {response.status_code}, Detalle: {response.text}")

    except Exception as e:
        logging.error(f"Error crítico en el script de facturación: {e}", exc_info=True)
    
    logging.info("--- PROCESO DE FACTURACIÓN AUTOMÁTICA FINALIZADO ---")

# Esto permite que ejecutes el script con "python3 facturador_automatico.py"
if __name__ == "__main__":
    ejecutar_facturacion_automatica()