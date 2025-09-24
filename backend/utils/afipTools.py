from dataclasses import dataclass
from datetime import datetime
import os
import requests
import json
from .json_utils import default_json
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

# Intentar resolver credenciales desde variables de entorno primero,
# y si no existen, intentar leerlas desde la bóveda temporal (boveda_afip_temporal)
try:
    from backend.utils import afip_tools_manager
    import os as _os
except Exception:
    afip_tools_manager = None

def _resolve_afip_credentials(emisor_cuit: str | None = None):
    """Devuelve (cuit, certificado_pem, clave_privada_pem, fuente)
    Fuente puede ser 'env', 'boveda' o 'none'. Si emisor_cuit se pasa,
    intentará primero localizar el certificado de ese CUIT en la bóveda.
    """
    # 1) Si se indicó un emisor específico, preferir su certificado en la bóveda
    try:
        if afip_tools_manager:
            if emisor_cuit:
                try:
                    cfg = afip_tools_manager.obtener_configuracion_emisor(emisor_cuit)
                except Exception:
                    cfg = {}
                if cfg.get('existe'):
                    cert_path = _os.path.join(afip_tools_manager.BOVEDA_TEMPORAL_PATH, f"{emisor_cuit}.crt")
                    key_path = _os.path.join(afip_tools_manager.BOVEDA_TEMPORAL_PATH, f"{emisor_cuit}.key")
                    if _os.path.exists(cert_path) and _os.path.exists(key_path):
                        with open(cert_path, 'r', encoding='utf-8') as f:
                            cert_pem = f.read()
                        with open(key_path, 'r', encoding='utf-8') as f:
                            key_pem = f.read()
                        return emisor_cuit, cert_pem, key_pem, 'boveda'

            # 2) Si no se pidió un CUIT específico (o no está disponible), intentar variables de entorno
            if AFIP_CUIT and AFIP_CERT and AFIP_KEY:
                return AFIP_CUIT, AFIP_CERT, AFIP_KEY, 'env'

            # 3) Si no hay variables de entorno, buscar cualquiera disponible en la bóveda
            disponibles = afip_tools_manager.listar_certificados_disponibles()
            if disponibles:
                for item in disponibles:
                    if item.get('tiene_clave'):
                        cuit = item.get('cuit')
                        cert_path = item.get('certificado_path')
                        key_path = _os.path.join(afip_tools_manager.BOVEDA_TEMPORAL_PATH, f"{cuit}.key")
                        try:
                            with open(cert_path, 'r', encoding='utf-8') as f:
                                cert_pem = f.read()
                            with open(key_path, 'r', encoding='utf-8') as f:
                                key_pem = f.read()
                            return cuit, cert_pem, key_pem, 'boveda'
                        except Exception:
                            continue
    except Exception:
        pass

    return None, None, None, 'none'

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
    emisor_cuit: str | None = None,
) -> Dict[str, Any]:
    
    print(f"Iniciando proceso de facturación (emisor solicitado: {emisor_cuit})")

    # Resolver credenciales dando preferencia al emisor solicitado (si se proporcionó)
    cuit_res, cert_res, key_res, fuente = _resolve_afip_credentials(emisor_cuit)

    print(f"Credenciales resueltas: cuit={cuit_res} (fuente={fuente})")

    if not (cuit_res and cert_res and key_res):
        raise ValueError("Faltan credenciales críticas de AFIP (CUIT, Certificado, o Clave Privada). Revise variables de entorno o bóveda.")

    credenciales = {
        "cuit": cuit_res,
        "certificado": cert_res,
        "clave_privada": key_res
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
        # Log seguro de credenciales (no imprimir la clave completa)
        try:
            safe_cred = {
                'cuit': cuit_res,
                'cert_present': bool(cert_res and len(cert_res) > 0),
                'key_present': bool(key_res and len(key_res) > 0),
                'cert_preview': (cert_res[:30] + '...') if cert_res and len(cert_res) > 30 else cert_res,
                'key_preview': ('<private key hidden>' if key_res else None)
            }
            print(f"Credenciales (seguras): {safe_cred}")
        except Exception:
            print("Credenciales: <no disponible para previsualizar>")

        response = requests.post(
            FACTURACION_API_URL,
            json=payload,
            timeout=20,
        )

        response.raise_for_status()

        resultado_afip = response.json()
        print(f"Respuesta del microservicio de facturación: {resultado_afip}")

        # Si el microservicio devuelve un cuerpo JSON con mensajes que parecen
        # indicar un problema de conexión en el servidor (p. ej. ConnectionResetError),
        # tratamos eso como un error transitorio y lanzamos una excepción de conexión
        # para que la capa que llama pueda reintentar.
        try:
            if isinstance(resultado_afip, dict):
                msgs = []
                for k in ("message", "error", "errores"):
                    v = resultado_afip.get(k)
                    if v:
                        if isinstance(v, str):
                            msgs.append(v)
                        else:
                            # Intentar convertir a string/JSON para inspección
                            try:
                                msgs.append(json.dumps(v, ensure_ascii=False, default=default_json))
                            except Exception:
                                msgs.append(str(v))
                joined = " ".join(msgs)
                # Marcar como transitorio si el body contiene indicios de errores de conexión/SSL
                if any(x in joined for x in ("ConnectionResetError", "ConnectionReset", "SSLError", "ssl.SSLError", "ssl")):
                    print(f"Microservicio reportó error transitorio en body: {joined}")
                    raise requests.exceptions.ConnectionError(f"Microservicio: {joined}")
        except requests.exceptions.ConnectionError:
            # Propagar para que el bloque exterior lo capture y/o para que la capa de reintentos funcione
            raise
        except Exception:
            # No crítico; continuar con el flujo normal
            pass
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
                # Usar ISO string para evitar problemas de serialización al guardar en BD
                "fecha_comprobante": datetime.now().isoformat(),
                "importe_total": total,
                    # usar el CUIT resuelto para el emisor, no la variable global AFIP_CUIT
                    "cuit_emisor": int(cuit_res) if cuit_res is not None else None,
                # DEBUG: indicar qué CUIT y qué fuente de credenciales se usaron (no incluir claves)
                "debug_cuit_usado": str(cuit_res),
                "debug_fuente_credenciales": fuente,
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
                        try:
                            from .json_utils import default_json
                            body_text = json.dumps(body, ensure_ascii=False, default=default_json)
                        except Exception:
                            body_text = json.dumps(body, ensure_ascii=False, default=default_json)
                except ValueError:
                    body_text = e.response.text
        except Exception:
            body_text = str(e)

        safe_msg = f"Status: {status_code}. Body: {body_text}"
        print(f"ERROR: El microservicio de facturación rechazó la petición. {safe_msg}")
        # Si el body contiene indicios de SSL/EOF/ConnectionReset, tratar como error de conexión
        try:
            joined = (body_text or "").lower()
            if any(x in joined for x in ("ssl", "unexpected_eof_while_reading", "connectionreseterror", "connectionreset", "ssl.sslerror", "unexpected eof")):
                print("Detected SSL/EOF/ConnectionReset indicator in microservice body -> raising ConnectionError to allow retry")
                raise requests.exceptions.ConnectionError(f"Microservicio transient error: {body_text}")
        except requests.exceptions.ConnectionError:
            raise
        except Exception:
            pass

        raise RuntimeError(f"Error en el servicio de facturación: {safe_msg}")

    except requests.exceptions.RequestException as e:
        # Request exceptions pueden contener detalles útiles; no intentar subscriptarlos
        print(f"ERROR: No se pudo conectar con el microservicio de facturación. Detalle: {repr(e)}")
        # Si es un error SSL u otro error de conexión, transformarlo en ConnectionError
        try:
            import ssl
            # Algunos wrappers envuelven la excepción original; intentar detectar ssl.SSLError
            if isinstance(e, ssl.SSLError) or 'ssl' in repr(e).lower() or 'unexpected eof' in repr(e).lower() or 'connectionreset' in repr(e).lower():
                print('Transformando excepción SSL/EOF/ConnectionReset en ConnectionError para reintento')
                raise requests.exceptions.ConnectionError(f"SSL/Connection error: {e}")
        except Exception:
            pass
        raise RuntimeError(f"El servicio de facturación no está disponible en este momento. Detalle: {repr(e)}")
    
    except Exception as e:
        # Algunos errores fatales pueden contener en su mensaje pistas de problemas
        # con la conexión SSL/EOF/ConnectionReset generados por la librería de AFIP.
        # Detectarlos y transformarlos en ConnectionError para permitir reintentos.
        msg = repr(e).lower()
        if any(x in msg for x in ("ssl", "unexpected eof", "connectionreset", "connection reset", "ssl.sserror", "ssl.sserror")):
            print(f"Transformando excepción inesperada con indicios SSL/EOF en ConnectionError: {e}")
            raise requests.exceptions.ConnectionError(f"Transient SSL/Connection error detected: {e}")

        print(f"ERROR: Ocurrió un error inesperado durante la facturación. Detalle: {e}")
        raise RuntimeError(f"Error inesperado durante la facturación: {e}")