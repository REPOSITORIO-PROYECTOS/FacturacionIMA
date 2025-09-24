from dataclasses import dataclass
from datetime import datetime
import os
import requests
from dotenv import load_dotenv
from typing import Dict, Any, Optional
from enum import Enum
from backend.config import AFIP_KEY, AFIP_CERT, AFIP_CUIT, AFIP_COND_EMISOR,AFIP_PUNTO_VENTA

from typing import Dict, Any

TASA_IVA_21 = 0.21
# --- Carga de Configuración ---
# Carga las variables desde el archivo .env.ima ubicado en el directorio padre 'back'
DOTENV_IMA_PATH = os.path.join(os.path.dirname(__file__), '..', '.env.ima')
load_dotenv(dotenv_path=DOTENV_IMA_PATH)

# Configuración para la Bóveda de Secretos
BOVEDA_URL = os.getenv("BOVEDA_URL")
BOVEDA_API_KEY = os.getenv("BOVEDA_API_KEY_INTERNA")

# Configuración para el Microservicio de Facturación Real
FACTURACION_API_URL = os.getenv("FACTURACION_API_URL")

# Verificación de configuración crítica al iniciar la aplicación
if not (FACTURACION_API_URL):
    raise SystemExit(
        "ERROR CRÍTICO: falta FACTURACION_API_URL."
    )

@dataclass 
class ReceptorData():
    cuit_o_dni: str
    condicion_iva: str
    nombre_razon_social: Optional[str] = None
    domicilio: Optional[str] = None

class CondicionIVA(Enum):
    RESPONSABLE_INSCRIPTO = 1
    EXENTO = 4
    CONSUMIDOR_FINAL = 5
    MONOTRIBUTO = 6
    NO_CATEGORIZADO = 7

class TipoDocumento(Enum):
    CUIT = 80
    CUIL = 86
    DNI = 96
    CONSUMIDOR_FINAL = 99


def determinar_datos_factura_segun_iva(
    condicion_emisor: CondicionIVA,
    condicion_receptor: CondicionIVA,
    total: float
) -> Dict[str, Any]:
    if condicion_emisor == CondicionIVA.RESPONSABLE_INSCRIPTO:
        neto = round(total / (1 + TASA_IVA_21), 2)
        iva = round(total - neto, 2)
        if condicion_receptor == CondicionIVA.RESPONSABLE_INSCRIPTO:
            return {"tipo_afip": 1, "neto": neto, "iva": iva}
        else:
            return {"tipo_afip": 6, "neto": neto, "iva": iva}

    elif condicion_emisor in [CondicionIVA.MONOTRIBUTO, CondicionIVA.EXENTO]:
        return {"tipo_afip": 11, "neto": total, "iva": 0.0}
    else:
        raise ValueError(f"Condición de IVA del emisor no soportada: {condicion_emisor.name}")



def generar_factura_para_venta(
    total: float, 
    cliente_data: ReceptorData,
) -> Dict[str, Any]:
    
    print(f"Iniciando proceso de facturación para Emisor CUIT: {AFIP_CUIT}")

    if not (AFIP_CUIT and AFIP_CERT and AFIP_KEY):
        raise ValueError("Faltan credenciales críticas de AFIP (CUIT, Certificado, o Clave Privada).")

    credenciales = {
        "cuit": AFIP_CUIT,
        "certificado": AFIP_CERT,
        "clave_privada": AFIP_KEY
    }
        

    try:
        condicion_emisor = CondicionIVA[AFIP_COND_EMISOR]

    except (KeyError, AttributeError):
        raise ValueError(f"La condición de IVA del emisor '{AFIP_COND_EMISOR}' no es válida o no está soportada.")

    if cliente_data and cliente_data.cuit_o_dni and cliente_data.cuit_o_dni != "0":
        documento = cliente_data.cuit_o_dni
        tipo_documento_receptor = TipoDocumento.CUIT if len(documento) == 11 else TipoDocumento.DNI
        try:
            cond_receptor_str = cliente_data.condicion_iva.upper().replace(' ', '_')
            condicion_receptor = CondicionIVA[cond_receptor_str]
        except (KeyError, AttributeError):
             raise ValueError(f"La condición de IVA del receptor '{cliente_data.condicion_iva}' no es válida o no está soportada.")
    else: 
        documento = "0"
        tipo_documento_receptor = TipoDocumento.CONSUMIDOR_FINAL
        condicion_receptor = CondicionIVA.CONSUMIDOR_FINAL
        
    print(f"Emisor: {condicion_emisor.name}, Receptor: {condicion_receptor.name}, Total: {total}")

    logica_factura = determinar_datos_factura_segun_iva(
        condicion_emisor=condicion_emisor,
        condicion_receptor=condicion_receptor,
        total=total
    )
    print(f"Lógica determinada: {logica_factura}")

    datos_factura = {
        "tipo_afip": logica_factura["tipo_afip"],
        "punto_venta": AFIP_PUNTO_VENTA,
        "tipo_documento": tipo_documento_receptor.value,
        "documento": documento,
        "total": total,
        "id_condicion_iva": condicion_receptor.value,
        "neto": logica_factura["neto"],
        "iva": logica_factura["iva"],
    }
    print(f"LAS CREDENCIALES QUE ESTOY ENVIANDO SON : {credenciales}")
    print(f"LOS DATOS QUE LE ESTOY ENVIANDO A FACTURAR SON : {datos_factura}")

    payload = {
        "credenciales": credenciales,
        "datos_factura": datos_factura,
    }

    print(f"Enviando petición al microservicio de facturación en: {FACTURACION_API_URL}")
    try:
        response = requests.post(
            FACTURACION_API_URL,
            json=payload,
            timeout=20,
        )
        
        response.raise_for_status() 
        
        resultado_afip = response.json()
        print(f"Respuesta exitosa del microservicio de facturación: {resultado_afip}")
        if resultado_afip.get("cae"):
            
            # 2. Construimos el diccionario completo que se guardará
            datos_completos = {
                "estado": "EXITOSO",
                "resultado": resultado_afip.get("resultado", "A"),
                "cae": resultado_afip.get("cae"),
                "vencimiento_cae": resultado_afip.get("vencimiento_cae"),
                "numero_comprobante": resultado_afip.get("numero_comprobante"),
                "punto_venta": datos_factura.get("punto_venta"),
                "tipo_comprobante": datos_factura.get("tipo_afip"),
                "fecha_comprobante": datetime.now(),
                "importe_total": total,
                "cuit_emisor": int(AFIP_CUIT),
                "tipo_doc_receptor": datos_factura.get("tipo_documento"),
                "nro_doc_receptor": int(datos_factura.get("documento")),
                "tipo_documento": datos_factura.get("tipo_documento"),
                "documento": datos_factura.get("documento"),
                "tipo_afip": datos_factura.get("tipo_afip"),
                "total": total,
                "neto": datos_factura.get("neto"),
                "iva": datos_factura.get("iva"),
                "id_condicion_iva": datos_factura.get("id_condicion_iva")
            }
            
            return datos_completos
        else:
            error_msg = resultado_afip.get('errores') or resultado_afip.get('error', 'Error desconocido de AFIP.')
            raise RuntimeError(f"AFIP devolvió un error: {error_msg}")

    except requests.exceptions.HTTPError as e:
        # Extraer información segura del response si está disponible
        status_code = None
        body_text = None
        try:
            if e.response is not None:
                status_code = getattr(e.response, 'status_code', None)
                try:
                    body = e.response.json()
                    # Si body es dict y tiene 'message', úsalo; si no, usa la serialización
                    if isinstance(body, dict) and 'message' in body:
                        body_text = body.get('message')
                    else:
                        body_text = json.dumps(body, ensure_ascii=False)
                except ValueError:
                    body_text = e.response.text
        except Exception:
            body_text = str(e)

        safe_msg = f"Status: {status_code}. Body: {body_text}"
        print(f"ERROR: El microservicio de facturación rechazó la petición. {safe_msg}")
        raise RuntimeError(f"Error en el servicio de facturación: {safe_msg}")

    except requests.exceptions.RequestException as e:
        # Request exceptions pueden contener detalles útiles; no intentar subscriptarlos
        print(f"ERROR: No se pudo conectar con el microservicio de facturación. Detalle: {repr(e)}")
        raise RuntimeError(f"El servicio de facturación no está disponible en este momento. Detalle: {repr(e)}")
    
    except Exception as e:
        print(f"ERROR: Ocurrió un error inesperado durante la facturación. Detalle: {e}")
        raise RuntimeError(f"Error inesperado durante la facturación: {e}")