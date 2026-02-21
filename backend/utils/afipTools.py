from dataclasses import dataclass
from datetime import datetime
import os
import requests
import json
import re
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from dotenv import load_dotenv
from typing import Dict, Any, Optional
from enum import Enum
from backend.config import (
    AFIP_KEY,
    AFIP_CERT,
    AFIP_CUIT,
    AFIP_COND_EMISOR,
    AFIP_PUNTO_VENTA,
    # puede no existir si versión vieja; usamos getattr defensivo
)
try:
    from backend.config import AFIP_ENABLE_ENV_CREDS  # type: ignore
except Exception:
    AFIP_ENABLE_ENV_CREDS = False

# Modo estricto: si se solicita emisor_cuit y no se pueden obtener credenciales de bóveda para ese CUIT,
# no continuar con fallback a otro CUIT (evita confusiones). Activable via env STRICT_AFIP_CREDENTIALS=1
STRICT_AFIP_CREDENTIALS = os.getenv('STRICT_AFIP_CREDENTIALS','0').strip() in ('1','true','on','yes')

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
_os = os
try:
    from backend.utils import afip_tools_manager
    # intentar usar un alias local para llamadas a la fs de la bóveda (si está disponible)
    try:
        import os as _os  # pragma: no cover - override only if available
    except Exception:
        _os = os
except Exception:
    afip_tools_manager = None

def _resolve_afip_credentials(emisor_cuit: str | None = None):
    """Devuelve (cuit, certificado_pem, clave_privada_pem, fuente)
    Fuente: 'boveda', 'env', 'none'. Prioridad:
      1) Registro activo en base de datos (afip_credenciales) para CUIT solicitado
      2) Cualquier registro activo en base de datos (si no se solicitó CUIT específico)
      3) CUIT solicitado en bóveda
      4) Cualquier certificado disponible en bóveda
      5) Entorno (solo si AFIP_ENABLE_ENV_CREDS True y hay cert+key)
    """
    try:
        # 1) Base de datos (prioridad absoluta si hay credenciales activas)
        from sqlmodel import select as _select
        from backend.database import SessionLocal as _SessionLocal
        from backend.modelos import AfipCredencial as _AfipCredencial
        from backend.modelos import ConfiguracionEmpresa as _ConfiguracionEmpresa
        
        with _SessionLocal() as _db:
            if emisor_cuit:
                cuit_limpio = str(emisor_cuit).strip()
                # 1.a) Buscar en AfipCredencial (tabla dedicada)
                row = _db.exec(_select(_AfipCredencial).where(_AfipCredencial.cuit == cuit_limpio, _AfipCredencial.activo == True)).first()
                if row and row.certificado_pem and row.clave_privada_pem:
                    return row.cuit, row.certificado_pem, row.clave_privada_pem, 'db_afip_credencial'
                
                # 1.b) Buscar en ConfiguracionEmpresa (tabla de configuración por empresa)
                # Nota: Los campos se llaman 'encrypted' pero en esta versión pueden contener el PEM directo si no se activó encriptación.
                # Se asume que si empiezan con "-----BEGIN" son PEM planos.
                conf = _db.exec(_select(_ConfiguracionEmpresa).where(_ConfiguracionEmpresa.cuit == cuit_limpio)).first()
                if conf and conf.afip_certificado_encrypted and conf.afip_clave_privada_encrypted:
                     return conf.cuit, conf.afip_certificado_encrypted, conf.afip_clave_privada_encrypted, 'db_config_empresa'

                # Si está en modo estricto y no hay credenciales para el CUIT solicitado, NO hacer ningún fallback
                if STRICT_AFIP_CREDENTIALS:
                    print(f"[AFIP_CREDS][STRICT] CUIT solicitado {emisor_cuit} no tiene credenciales en DB y modo estricto activo -> NO fallback")
                    return None, None, None, 'none'
            
            # Si no se pidió CUIT o no está en modo estricto, tomar primera activa
            if not emisor_cuit or not STRICT_AFIP_CREDENTIALS:
                # Intentar AfipCredencial primero
                row_any = _db.exec(_select(_AfipCredencial).where(_AfipCredencial.activo == True)).first()
                if row_any and row_any.certificado_pem and row_any.clave_privada_pem:
                    return row_any.cuit, row_any.certificado_pem, row_any.clave_privada_pem, 'db_afip_credencial_any'
                
                # Intentar ConfiguracionEmpresa
                conf_any = _db.exec(_select(_ConfiguracionEmpresa)).first()
                if conf_any and conf_any.afip_certificado_encrypted and conf_any.afip_clave_privada_encrypted:
                    return conf_any.cuit, conf_any.afip_certificado_encrypted, conf_any.afip_clave_privada_encrypted, 'db_config_empresa_any'

        # Si está en modo estricto y emisor_cuit es None o vacío, abortar y no permitir ningún fallback
        if STRICT_AFIP_CREDENTIALS and (emisor_cuit is None or str(emisor_cuit).strip() == ""):
            print(f"[AFIP_CREDS][STRICT] emisor_cuit no especificado y modo estricto activo -> ABORT")
            return None, None, None, 'none'

        # Si está en modo estricto y se solicitó un CUIT, nunca consultar bóveda ni entorno
        if STRICT_AFIP_CREDENTIALS and emisor_cuit:
            # Ya se devolvió None arriba si no hay credenciales en DB
            return None, None, None, 'none'

        # 2) Bóveda específica: SOLO si NO está en modo estricto
        if afip_tools_manager and (not STRICT_AFIP_CREDENTIALS or not emisor_cuit):
            if emisor_cuit:
                emisor_cuit_digits = ''.join(ch for ch in str(emisor_cuit).strip() if ch.isdigit())
                try:
                    cfg = afip_tools_manager.obtener_configuracion_emisor(emisor_cuit_digits)
                except Exception:
                    cfg = {}
                if cfg.get('existe'):
                    try:
                        if isinstance(cfg.get('cuit_empresa'), str):
                            cfg['cuit_empresa'] = ''.join(ch for ch in cfg['cuit_empresa'].strip() if ch.isdigit())
                    except Exception:
                        pass
                    cert_path = _os.path.join(afip_tools_manager.BOVEDA_TEMPORAL_PATH, f"{emisor_cuit_digits}.crt")
                    key_path = _os.path.join(afip_tools_manager.BOVEDA_TEMPORAL_PATH, f"{emisor_cuit_digits}.key")
                    if _os.path.exists(cert_path) and _os.path.exists(key_path):
                        try:
                            with open(cert_path, 'r', encoding='utf-8') as f:
                                cert_pem = f.read()
                            with open(key_path, 'r', encoding='utf-8') as f:
                                key_pem = f.read()
                            print(f"[AFIP_CREDS] Usando credenciales solicitadas de bóveda para CUIT {emisor_cuit_digits}")
                            return emisor_cuit_digits, cert_pem, key_pem, 'boveda'
                        except Exception:
                            print(f"[AFIP_CREDS][WARN] Falló lectura de archivos de bóveda para CUIT {emisor_cuit_digits}")
                            pass
                # Si está en modo estricto y no hay credenciales para el CUIT solicitado, no hacer ningún fallback
                # (ya se maneja arriba, así que aquí nunca entra en modo estricto)
                pass
            # Si no está en modo estricto, buscar cualquier certificado disponible en bóveda
            if not emisor_cuit or not STRICT_AFIP_CREDENTIALS:
                try:
                    disponibles = afip_tools_manager.listar_certificados_disponibles()
                except Exception:
                    disponibles = []
                if disponibles:
                    for item in disponibles:
                        if not item.get('tiene_clave'):
                            continue
                        cuit = item.get('cuit')
                        if isinstance(cuit, str):
                            cuit = cuit.strip()
                        cert_path = item.get('certificado_path')
                        key_path = _os.path.join(afip_tools_manager.BOVEDA_TEMPORAL_PATH, f"{cuit}.key")
                        if not (_os.path.exists(cert_path) and _os.path.exists(key_path)):
                            continue
                        try:
                            with open(cert_path, 'r', encoding='utf-8') as f:
                                cert_pem = f.read()
                            with open(key_path, 'r', encoding='utf-8') as f:
                                key_pem = f.read()
                            print(f"[AFIP_CREDS] Usando primer certificado disponible en bóveda (CUIT {cuit})")
                            return cuit, cert_pem, key_pem, 'boveda'
                        except Exception:
                            print(f"[AFIP_CREDS][WARN] No se pudo leer par cert/key para CUIT {cuit} en bóveda, probando siguiente...")
                            continue
        # 4) Entorno (solo si flag habilita y hay datos, y no está en modo estricto)
        if not STRICT_AFIP_CREDENTIALS and AFIP_ENABLE_ENV_CREDS and AFIP_CUIT and AFIP_CERT and AFIP_KEY:
            print(f"[AFIP_CREDS] Usando credenciales desde variables de entorno para CUIT {AFIP_CUIT}")
            return AFIP_CUIT, AFIP_CERT, AFIP_KEY, 'env'
        else:
            if AFIP_ENABLE_ENV_CREDS and not STRICT_AFIP_CREDENTIALS:
                print("[AFIP_CREDS][WARN] AFIP_ENABLE_ENV_CREDS=1 pero faltan AFIP_CUIT/AFIP_CERT/AFIP_KEY")
            elif AFIP_ENABLE_ENV_CREDS and STRICT_AFIP_CREDENTIALS:
                print("[AFIP_CREDS][STRICT] Modo estricto activo: no se usan credenciales del entorno")
    except Exception:
        # Cualquier fallo cae en 'none'
        print("[AFIP_CREDS][ERROR] Excepción inesperada resolviendo credenciales; devolviendo none")
        pass

    return None, None, None, 'none'

def _sanitize_pem(pem: str | None, kind: str) -> str | None:
    """Normaliza un bloque PEM.
    - Quita espacios a los extremos
    - Asegura \n como separador de línea
    - Elimina líneas vacías al inicio/fin
    - Reinyecta encabezado y footer si detecta que están en la primera/última línea
    - No intenta rewrap base64 (mantiene líneas internas originales para no invalidar)
    Retorna None si input es None.
    """
    if not pem:
        return pem
    pem_strip = pem.strip().replace('\r\n', '\n').replace('\r', '\n')
    lines = [l for l in pem_strip.split('\n') if l.strip()]
    if not lines:
        return None
    head_map = {
        'cert': '-----BEGIN CERTIFICATE-----',
        'key': '-----BEGIN PRIVATE KEY-----',
        'rsakey': '-----BEGIN RSA PRIVATE KEY-----',
        'ec': '-----BEGIN EC PRIVATE KEY-----'
    }
    tail_map = {
        'cert': '-----END CERTIFICATE-----',
        'key': '-----END PRIVATE KEY-----',
        'rsakey': '-----END RSA PRIVATE KEY-----',
        'ec': '-----END EC PRIVATE KEY-----'
    }
    # Detectar tipo real
    first = lines[0].strip()
    last = lines[-1].strip()
    # Si ya tienen encabezados correctos, sólo normalizamos
    if first.startswith('-----BEGIN') and last.startswith('-----END'):  # asumimos bien formado
        norm = '\n'.join(lines)
        if not norm.endswith('\n'):
            norm += '\n'
        return norm
    # Caso extraño: sin encabezados; intentamos envolver como certificado si parece base64
    # Heurística: todas las líneas solo base64 + '=' opcional
    import re
    b64_re = re.compile(r'^[A-Za-z0-9+/=]+$')
    if all(b64_re.match(l) for l in lines):
        header = head_map['cert'] if kind == 'cert' else head_map['key']
        footer = tail_map['cert'] if kind == 'cert' else tail_map['key']
        body = '\n'.join(lines)
        return f"{header}\n{body}\n{footer}\n"
    # Dejarlo como estaba (posible formato no estándar)
    norm = '\n'.join(lines)
    if not norm.endswith('\n'):
        norm += '\n'
    return norm

def _asegurar_pkcs8_y_validar(key_pem: str | None) -> str:
    """Valida la clave privada y asegura que esté en formato PKCS#8 sin passphrase."""
    if not key_pem:
        raise ValueError("Clave privada PEM vacía.")
    
    try:
        # Intentar cargar la clave (soporta PKCS#1, PKCS#8, EC, etc.)
        key = serialization.load_pem_private_key(
            key_pem.encode(),
            password=None,
            backend=default_backend()
        )
        
        # Re-exportar siempre como PKCS#8 (formato estándar esperado por el microservicio)
        # Esto soluciona problemas de claves PKCS#1 (-----BEGIN RSA PRIVATE KEY-----)
        # que a veces dan problemas en ciertos entornos o librerías.
        pkcs8_pem = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ).decode('utf-8')
        
        return pkcs8_pem
    except Exception as e:
        msg = str(e).lower()
        if "passphrase" in msg or "password" in msg:
            raise ValueError("La clave privada tiene contraseña (passphrase). El servicio requiere claves sin contraseña.")
        raise ValueError(f"Clave privada inválida o formato no soportado: {str(e)}")

def _fingerprint_material(material: str | None) -> str | None:
    import hashlib
    if not material:
        return None
    try:
        data = material.encode('utf-8', errors='ignore')
        return hashlib.sha1(data).hexdigest()  # fingerprint simple
    except Exception:
        return None

def preflight_afip_credentials(emisor_cuit: str | None = None) -> Dict[str, Any]:
    """Devuelve un dict con la selección de credenciales sin llamar al microservicio.
    Incluye fingerprints de cert/clave y fuente final.
    """
    cuit_res, cert_res, key_res, fuente = _resolve_afip_credentials(emisor_cuit)
    # Listar certificados en bóveda (si existe manager)
    disponibles = []
    try:
        if afip_tools_manager:
            disponibles = afip_tools_manager.listar_certificados_disponibles()
    except Exception:
        disponibles = []
    return {
        'solicitado': emisor_cuit,
        'resuelto_cuit': cuit_res,
        'fuente': fuente,
        'cert_fingerprint': _fingerprint_material(cert_res),
        'key_fingerprint': _fingerprint_material(key_res),
        'cert_len': len(cert_res) if cert_res else 0,
        'key_len': len(key_res) if key_res else 0,
        'AFIP_ENABLE_ENV_CREDS': AFIP_ENABLE_ENV_CREDS,
        'boveda_disponibles': disponibles,
    }

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


def _validar_y_procesar_tributos(
    tributos: list[Dict[str, Any]] | None,
    neto: float,
    iva: float,
) -> tuple[list[Dict[str, Any]], float]:
    """
    Valida y procesa el array de tributos.
    Retorna: (tributos_procesados, imp_trib_total)
    
    Validación:
    - Cada tributo debe tener: id (int), base_imponible (float >= 0), alicuota (float), importe (float)
    - Si id=99, descripcion es OBLIGATORIA
    - Valida que importe = base_imponible * alicuota / 100
    - Retorna la suma total de importes (imp_trib)
    """
    if not tributos:
        return [], 0.0
    
    tributos_procesados = []
    imp_trib_total = 0.0
    
    for i, tributo in enumerate(tributos):
        if not isinstance(tributo, dict):
            raise ValueError(f"Tributo {i} no es un diccionario válido")
        
        # Validar campos requeridos
        try:
            trib_id = int(tributo.get('id', 0))
            base_imponible = float(tributo.get('base_imponible', 0))
            alicuota = float(tributo.get('alicuota', 0))
            importe = float(tributo.get('importe', 0))
        except (ValueError, TypeError) as e:
            raise ValueError(f"Tributo {i}: campos numéricos inválidos - {e}")
        
        # Validación: base_imponible >= 0
        if base_imponible < 0:
            raise ValueError(f"Tributo {i}: base_imponible debe ser >= 0")
        
        # Si id=99 (Otros Tributos), descripcion es OBLIGATORIA
        if trib_id == 99:
            descripcion = tributo.get('descripcion', '').strip()
            if not descripcion:
                raise ValueError(f"Tributo {i}: description es OBLIGATORIA para id=99 (Otros Tributos)")
        
        # Validar que importe ≈ base_imponible * alicuota / 100
        # Error tolerable: 0.01
        importe_calculado = round(base_imponible * alicuota / 100, 2)
        diferencia = abs(importe - importe_calculado)
        if diferencia > 0.01:
            raise ValueError(
                f"Tributo {i}: importe ({importe}) no coincide con "
                f"base_imponible ({base_imponible}) * alicuota ({alicuota}) / 100 = {importe_calculado}. "
                f"Diferencia: {diferencia} (máximo tolerable: 0.01)"
            )
        
        # Usar el importe calculado para garantizar precisión
        importe_normalizado = importe_calculado
        tributo['importe'] = importe_normalizado
        tributos_procesados.append(tributo)
        imp_trib_total += importe_normalizado
    
    # Redondear total de tributos
    imp_trib_total = round(imp_trib_total, 2)
    return tributos_procesados, imp_trib_total


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
    tipo_forzado: int | None = None,
    conceptos: list[Dict[str, Any]] | None = None,
    punto_venta: int | None = None,
    tributos: list[Dict[str, Any]] | None = None,
    aplicar_desglose_77: bool = False,
) -> Dict[str, Any]:
    
    print(f"Iniciando proceso de facturación (emisor solicitado: {emisor_cuit}) | AFIP_ENABLE_ENV_CREDS={AFIP_ENABLE_ENV_CREDS}")

    # Resolver punto_venta si no se especificó y hay un CUIT emisor
    if punto_venta is None and emisor_cuit:
        try:
            from sqlmodel import select as _select
            from backend.database import SessionLocal as _SessionLocal
            from backend.modelos import ConfiguracionEmpresa
            
            # Limpiar CUIT
            clean_cuit = ''.join(filter(str.isdigit, str(emisor_cuit)))
            
            with _SessionLocal() as _db:
                cfg = _db.exec(_select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.cuit == clean_cuit)).first()
                if cfg and cfg.afip_punto_venta_predeterminado:
                    punto_venta = cfg.afip_punto_venta_predeterminado
                    print(f"[AFIP] Usando punto_venta {punto_venta} de DB para CUIT {clean_cuit}")
        except Exception as e:
            print(f"[AFIP] Advertencia: No se pudo resolver punto_venta desde DB: {e}")

        # 2. Si no estaba en DB, intentar leer desde el JSON de la Bóveda (afip_tools_manager)
        if punto_venta is None and afip_tools_manager:
            try:
                clean_cuit = ''.join(filter(str.isdigit, str(emisor_cuit)))
                cfg_boveda = afip_tools_manager.obtener_configuracion_emisor(clean_cuit)
                # El JSON puede tener 'punto_venta' como int o str
                if cfg_boveda and cfg_boveda.get('punto_venta'):
                    punto_venta = int(cfg_boveda['punto_venta'])
                    print(f"[AFIP] Usando punto_venta {punto_venta} de Bóveda JSON para CUIT {clean_cuit}")
            except Exception as e:
                print(f"[AFIP] Advertencia: No se pudo resolver punto_venta desde Bóveda JSON: {e}")

    # Fallback al global si sigue siendo None
    final_punto_venta = punto_venta if punto_venta is not None else AFIP_PUNTO_VENTA
    
    # Validar que tengamos un punto de venta
    if final_punto_venta is None:
         # Intento final: si es entero 0 o None, lanzar error o usar default 1?
         # Mejor lanzar error si no está configurado
         pass # Se validará más abajo o se enviará None (que fallará en AFIP)

    # Resolver credenciales dando preferencia al emisor solicitado (si se proporcionó)
    cuit_res, cert_res, key_res, fuente = _resolve_afip_credentials(emisor_cuit)

    print(f"Credenciales resueltas: cuit={cuit_res} (fuente={fuente}) | cert_fp={_fingerprint_material(cert_res)} key_fp={_fingerprint_material(key_res)}")

    if not (cuit_res and cert_res and key_res):
        raise ValueError("Faltan credenciales críticas de AFIP (CUIT, Certificado, o Clave Privada). Revise variables de entorno o bóveda.")

    # Sanear PEM antes de enviarlo (evita errores de longitud / CRLF)
    cert_res_sane = _sanitize_pem(cert_res, 'cert')
    # Clave privada: sanitizar y asegurar formato PKCS#8 compatible
    try:
        key_res_sane = _asegurar_pkcs8_y_validar(key_res)
    except ValueError as ve:
        raise RuntimeError(f"Error de credenciales (clave privada): {str(ve)}")

    # Validaciones previas de sanidad de credenciales
    if not cert_res_sane or "-----BEGIN CERTIFICATE-----" not in cert_res_sane:
        raise ValueError(f"El certificado para el CUIT {cuit_res} no parece ser un PEM válido.")
    if not key_res_sane or "-----BEGIN PRIVATE KEY-----" not in key_res_sane:
        raise ValueError(f"La clave privada para el CUIT {cuit_res} no parece ser un PEM PKCS#8 válido.")

    credenciales = {
        "cuit": cuit_res,
        "certificado": cert_res_sane,
        "clave_privada": key_res_sane
    }
        

    # Validar que la configuración contenga una cadena legible para el enum
    if not isinstance(AFIP_COND_EMISOR, str) or not AFIP_COND_EMISOR:
        raise ValueError("La condición de IVA del emisor no está configurada (AFIP_COND_EMISOR).")
    try:
        condicion_emisor = CondicionIVA[AFIP_COND_EMISOR]
    except (KeyError, AttributeError):
        raise ValueError(f"La condición de IVA del emisor '{AFIP_COND_EMISOR}' no es válida o no está soportada.")

    # --- Validación y normalización de documento receptor ---
    def _es_cuit_valido(c: str) -> bool:
        try:
            c = ''.join(ch for ch in c if ch.isdigit())
            if len(c) != 11:
                return False
            mult = [5,4,3,2,7,6,5,4,3,2]
            suma = sum(int(c[i]) * mult[i] for i in range(10))
            resto = 11 - (suma % 11)
            ver = 0 if resto == 11 else (9 if resto == 10 else resto)
            return ver == int(c[-1])
        except Exception:
            return False

    doc_input = (cliente_data.cuit_o_dni or '').strip()
    condicion_receptor = None
    documento = "0"
    tipo_documento_receptor = TipoDocumento.CONSUMIDOR_FINAL
    try:
        cond_receptor_str = (cliente_data.condicion_iva or '').upper().replace(' ', '_')
        condicion_receptor = CondicionIVA[cond_receptor_str]
    except Exception:
        raise ValueError(f"La condición de IVA del receptor '{cliente_data.condicion_iva}' no es válida o no está soportada.")

    if doc_input and doc_input != '0':
        # Determinar tipo doc tentativo
        if len(doc_input) == 11 and _es_cuit_valido(doc_input):
            documento = doc_input
            tipo_documento_receptor = TipoDocumento.CUIT
        elif len(doc_input) in (7,8) and doc_input.isdigit():
            # DNI típico (7 u 8 cifras)
            documento = doc_input
            tipo_documento_receptor = TipoDocumento.DNI
        else:
            # Documento no válido -> degradar a Consumidor Final sin doc
            documento = '0'
            tipo_documento_receptor = TipoDocumento.CONSUMIDOR_FINAL
            condicion_receptor = CondicionIVA.CONSUMIDOR_FINAL
            print(f"[FACTURA] Documento receptor '{doc_input}' inválido -> degradado a Consumidor Final (sin doc)")
    else:
        # Sin doc explícito -> Consumidor Final
        documento = '0'
        tipo_documento_receptor = TipoDocumento.CONSUMIDOR_FINAL
        condicion_receptor = CondicionIVA.CONSUMIDOR_FINAL

    # Regla solicitada: si se pide Factura A (1) pero receptor queda como Consumidor Final sin documento, error claro
    if tipo_forzado == 1 and (tipo_documento_receptor == TipoDocumento.CONSUMIDOR_FINAL or condicion_receptor != CondicionIVA.RESPONSABLE_INSCRIPTO):
        raise ValueError("No se puede emitir Factura A: receptor no es Responsable Inscripto con CUIT válido.")
        
    print(f"Emisor: {condicion_emisor.name}, Receptor: {condicion_receptor.name}, Total: {total}")

    logica_factura = determinar_datos_factura_segun_iva(
        condicion_emisor=condicion_emisor,
        condicion_receptor=condicion_receptor,
        total=total
    )
    # Validación / override de tipo comprobante si se solicitó tipo_forzado
    if tipo_forzado is not None:
        try:
            tipo_forzado_int = int(tipo_forzado)
        except Exception:
            raise ValueError(f"tipo_forzado inválido: {tipo_forzado}")
        # Reglas: 1 (A) y 6 (B) solo si emisor es RESPONSABLE_INSCRIPTO. 11 (C) permitido siempre, pero
        # en escenarios de emisor Responsable Inscripto + receptor Responsable Inscripto, A tiene sentido;
        # receptor no RI -> B. Permitimos override manual consciente.
        if tipo_forzado_int in (1, 6):
            if condicion_emisor != CondicionIVA.RESPONSABLE_INSCRIPTO:
                raise ValueError("No se puede forzar Factura A/B porque el emisor no es RESPONSABLE_INSCRIPTO")
            # Si se fuerza A pero receptor no RI -> degradar a B con aviso (salvo que ya se haya lanzado error arriba)
            if tipo_forzado_int == 1 and condicion_receptor != CondicionIVA.RESPONSABLE_INSCRIPTO:
                print("[FACTURA] Override solicitó A pero receptor no RI -> degradando a B (6)")
                tipo_forzado_int = 6
        elif tipo_forzado_int == 11:
            # Siempre aceptable (Monotributo / Exento / forzar C)
            pass
        else:
            raise ValueError("tipo_forzado debe ser uno de: 1 (A), 6 (B), 11 (C)")
        # Sobrescribir tipo_afip manteniendo cálculos de neto/iva previos (no recalculamos)
        logica_factura["tipo_afip"] = tipo_forzado_int
        print(f"Override manual: usando tipo_afip={tipo_forzado_int} en lugar de lógica automática")
    print(f"Lógica determinada (final): {logica_factura}")

    # ===== MANEJO DEL DESGLOSE ESPECIAL 77% =====
    # Si se habilita desglose 77%, el total proporcionado INCLUYE el impuesto interno (77%)
    # En ese caso, recalculamos neto e iva considerando solo el 23% restante
    if aplicar_desglose_77:
        # El total incluye: impuesto_77% + (neto + iva)
        # Donde (neto + iva) = total * 0.23
        impuesto_interno = round(total * 0.77, 2)  # El 77% (impuesto interno)
        monto_facturable = round(total - impuesto_interno, 2)  # El 23% restante (neto + iva)

        # Calcular neto e iva del monto facturable
        neto_ajustado = round(monto_facturable / (1 + TASA_IVA_21), 2)
        iva_ajustada = round(monto_facturable - neto_ajustado, 2)  # Restar para evitar redondeos acumulativos

        # Ajuste fino por redondeo: forzar total = neto + iva + imp_trib
        diferencia_total = round(total - (neto_ajustado + iva_ajustada + impuesto_interno), 2)
        if abs(diferencia_total) > 0:
            iva_ajustada = round(iva_ajustada + diferencia_total, 2)
        
        # Sobrescribir los valores calculados
        logica_factura["neto"] = neto_ajustado
        logica_factura["iva"] = iva_ajustada
        
        # Crear tributo automático para el impuesto interno
        if not tributos:
            tributos = []
        tributos.append({
            "id": 99,
            "descripcion": "Impuesto Interno",
            "base_imponible": total,  # Base es el total (más simple)
            "alicuota": 77.0,  # Alícuota es 77%
            "importe": impuesto_interno
        })
        
        print(f"[DESGLOSE 77%] Total: ${total} | Impuesto Interno 77%: ${impuesto_interno} | Neto+IVA: ${monto_facturable}")
        print(f"[DESGLOSE 77%] Neto: ${neto_ajustado} | IVA: ${iva_ajustada} | Tributo: ${impuesto_interno}")

    # ===== PROCESAMIENTO Y VALIDACIÓN DE TRIBUTOS =====
    tributos_procesados = []
    imp_trib = 0.0
    
    if tributos:
        try:
            tributos_procesados, imp_trib = _validar_y_procesar_tributos(
                tributos,
                logica_factura["neto"],
                logica_factura["iva"]
            )
            print(f"[TRIBUTOS] Procesados {len(tributos_procesados)} tributo(s). Suma total: ${imp_trib}")
        except ValueError as e:
            raise ValueError(f"Error en validación de tributos: {e}")
    
    # ===== VALIDACIÓN DEL TOTAL CON TRIBUTOS =====
    total_calculado = round(logica_factura["neto"] + logica_factura["iva"] + imp_trib, 2)
    diferencia_total = abs(total - total_calculado)
    # Error tolerable: 0.01 por tributo (si hay 0 tributos, tolerancia es 0.01)
    tolerancia_maxima = max(0.01, 0.01 * len(tributos_procesados)) if tributos_procesados else 0.01
    
    if diferencia_total > tolerancia_maxima:
        raise ValueError(
            f"Total proporcionado (${total}) no coincide con el cálculo ("
            f"neto: ${logica_factura['neto']} + iva: ${logica_factura['iva']} + tributos: ${imp_trib} = ${total_calculado}). "
            f"Diferencia: ${diferencia_total} (máximo tolerable: ${tolerancia_maxima})"
        )
    
    print(f"[VALIDACIÓN TOTAL] Total: ${total} coincide con cálculo: ${total_calculado} (diferencia: ${diferencia_total})")

    datos_factura = {
        "tipo_afip": logica_factura["tipo_afip"],
        "punto_venta": final_punto_venta,
        "tipo_documento": tipo_documento_receptor.value,
        "documento": documento,
        "total": total,
        "id_condicion_iva": condicion_receptor.value,
        "neto": logica_factura["neto"],
        "iva": logica_factura["iva"],
    }
    
    # Agregar tributos si existen
    if tributos_procesados:
        datos_factura["tributos"] = tributos_procesados
        datos_factura["imp_trib"] = imp_trib
        print(f"Agregando {len(tributos_procesados)} tributo(s) a la factura (total: ${imp_trib})")
    
    # Agregar conceptos si están disponibles
    if conceptos and isinstance(conceptos, list) and len(conceptos) > 0:
        datos_factura["conceptos"] = conceptos
        print(f"Agregando {len(conceptos)} conceptos a la factura")
    
    print(f"LAS CREDENCIALES QUE ESTOY ENVIANDO SON : {{'cuit': credenciales['cuit'], 'cert_len': len(credenciales['certificado']) if credenciales.get('certificado') else 0, 'key_len': len(credenciales['clave_privada']) if credenciales.get('clave_privada') else 0}}")
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

        # Asegurarnos está disponible y de tipo str para el analizador estático
        url = FACTURACION_API_URL
        if not url:
            raise RuntimeError("FACTURACION_API_URL no configurado.")
        response = requests.post(
            url,
            json=payload,
            timeout=20,
        )

        if response.status_code == 500:
            error_msg_detected = None
            try:
                error_body = response.json()
                if isinstance(error_body, dict) and "AttributeError" in str(error_body.get("message", "")) and "FECompUltimoAutorizado" in str(error_body.get("message", "")):
                    error_msg_detected = "Error crítico en el microservicio de facturación: El cliente AFIP no se inicializó correctamente (NoneType error). Verifique las credenciales enviadas."
            except Exception:
                pass
            
            if error_msg_detected:
                raise RuntimeError(error_msg_detected)

        response.raise_for_status()

        resultado_afip = response.json()
        if resultado_afip is None:
            raise RuntimeError("El microservicio de facturación devolvió una respuesta vacía (None).")
        
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
                                msgs.append(json.dumps(v, ensure_ascii=False, default=str))
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
                # Documento puede ser None; convertir defensivamente a 0 si falta
                "nro_doc_receptor": int(datos_factura.get("documento") or 0),
                "tipo_documento": datos_factura.get("tipo_documento"),
                "documento": datos_factura.get("documento"),
                "tipo_afip": datos_factura.get("tipo_afip"),
                "total": total,
                "neto": datos_factura.get("neto"),
                "iva": datos_factura.get("iva"),
                "id_condicion_iva": datos_factura.get("id_condicion_iva"),
                # NUEVO: Incluir tributos y flags para guardar/mostrar
                "tributos": tributos_procesados if tributos_procesados else [],
                "aplicar_desglose_77": aplicar_desglose_77
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
                    # Si body es dict y tiene 'message' o 'error', úsalo
                    if isinstance(body, dict):
                        body_text = body.get('message') or body.get('error') or body.get('errores')
                    if not body_text:
                        body_text = e.response.text
                except Exception:
                    body_text = e.response.text[:200]
        except Exception:
            pass

        safe_msg = f"Status: {status_code}. Body: {body_text}" if status_code else str(e)
        
        # Si detectamos el error de NoneType específicamente aquí también por si acaso
        if body_text and "FECompUltimoAutorizado" in str(body_text) and "NoneType" in str(body_text):
            raise RuntimeError(f"Error crítico en microservicio (Cliente AFIP no inicializado): {body_text}")
            
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