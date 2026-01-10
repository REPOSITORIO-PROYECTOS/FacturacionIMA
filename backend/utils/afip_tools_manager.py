import os
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from backend import config

# Directorio seguro para guardado temporal de claves
# Asegurar ruta absoluta para evitar diferencias de working directory en threads / procesos
_vault_env = os.getenv('AFIP_KEYS_PATH', './boveda_afip_temporal')
if not os.path.isabs(_vault_env):
    BOVEDA_TEMPORAL_PATH = os.path.abspath(_vault_env)
else:
    BOVEDA_TEMPORAL_PATH = _vault_env

def _normalize_cuit(cuit: str | None) -> str | None:
    if cuit is None:
        return None
    return cuit.strip()

def generar_csr_y_guardar_clave_temporal(cuit_empresa: str, razon_social: str) -> str:
    """
    Genera un par de claves. Guarda la clave privada en un archivo temporal
    seguro (.key) y devuelve el contenido del CSR para que el usuario lo descargue.
    """
    # 1. Asegurarse de que el directorio temporal exista
    os.makedirs(BOVEDA_TEMPORAL_PATH, exist_ok=True)
    
    # 2. Generar la Clave Privada
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('utf-8')

    # 3. Guardar la clave privada en un archivo nombrado con el CUIT
    clave_privada_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"{cuit_empresa}.key")
    with open(clave_privada_path, "w") as f:
        f.write(private_key_pem)

    # 4. Construir el CSR
    subject = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, u"AR"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, razon_social),
        x509.NameAttribute(NameOID.COMMON_NAME, cuit_empresa),
        x509.NameAttribute(NameOID.SERIAL_NUMBER, f"CUIT {cuit_empresa}")
    ])
    
    builder = x509.CertificateSigningRequestBuilder()
    csr = builder.subject_name(subject).sign(private_key, hashes.SHA256())
    
    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode('utf-8')
    
    print(f"Clave privada para {cuit_empresa} guardada temporalmente. CSR listo.")
    return csr_pem

def guardar_certificado_final(cuit: str, certificado_pem: str) -> dict:
    """
    Guarda el certificado final junto con la clave privada en el directorio configurado.
    """
    clave_privada_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"{cuit}.key")
    certificado_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"{cuit}.crt")

    # 1. Validar que la clave temporal exista
    if not os.path.exists(clave_privada_path):
        raise ValueError(f"No se encontró una clave privada temporal para el CUIT {cuit}. Genere el CSR primero.")

    # 2. Guardar el certificado
    with open(certificado_path, "w") as f:
        f.write(certificado_pem)

    print(f"Certificado para {cuit} guardado en {certificado_path}")
    
    return {
        "success": True,
        "message": f"Certificado guardado exitosamente para CUIT {cuit}",
        "paths": {
            "certificado": certificado_path,
            "clave_privada": clave_privada_path
        }
    }

def procesar_archivo_certificado_completo(cuit: str, archivo_contenido: str) -> dict:
    """
    Procesa un archivo completo descargado de AFIP que puede contener
    tanto el certificado como la clave privada, o solo el certificado.
    """
    try:
        # Intentar extraer certificado y clave del archivo
        certificado_pem = None
        clave_privada_pem = None
        
        # Buscar certificado
        if "-----BEGIN CERTIFICATE-----" in archivo_contenido:
            inicio_cert = archivo_contenido.find("-----BEGIN CERTIFICATE-----")
            fin_cert = archivo_contenido.find("-----END CERTIFICATE-----") + len("-----END CERTIFICATE-----")
            certificado_pem = archivo_contenido[inicio_cert:fin_cert]
        
        # Buscar clave privada (varios formatos posibles)
        clave_markers = [
            ("-----BEGIN PRIVATE KEY-----", "-----END PRIVATE KEY-----"),
            ("-----BEGIN RSA PRIVATE KEY-----", "-----END RSA PRIVATE KEY-----"),
            ("-----BEGIN EC PRIVATE KEY-----", "-----END EC PRIVATE KEY-----")
        ]
        
        for inicio_marker, fin_marker in clave_markers:
            if inicio_marker in archivo_contenido:
                inicio_clave = archivo_contenido.find(inicio_marker)
                fin_clave = archivo_contenido.find(fin_marker) + len(fin_marker)
                clave_privada_pem = archivo_contenido[inicio_clave:fin_clave]
                break
        
        if not certificado_pem:
            raise ValueError("No se encontró un certificado válido en el archivo")
        
        # Si encontramos ambos, guardar directamente
        if clave_privada_pem:
            # Guardar la clave privada
            os.makedirs(BOVEDA_TEMPORAL_PATH, exist_ok=True)
            clave_privada_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"{cuit}.key")
            with open(clave_privada_path, "w") as f:
                f.write(clave_privada_pem)
            
            # Guardar el certificado
            certificado_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"{cuit}.crt")
            with open(certificado_path, "w") as f:
                f.write(certificado_pem)
            
            return {
                "message": "Archivo procesado exitosamente. Certificado y clave privada guardados.",
                "tiene_certificado": True,
                "tiene_clave": True,
                "cuit": cuit
            }
        else:
            # Solo tenemos certificado, usar la función existente
            return guardar_certificado_final(cuit, certificado_pem)
            
    except Exception as e:
        raise ValueError(f"Error procesando archivo: {str(e)}")

def guardar_configuracion_emisor(cuit_empresa: str, razon_social: str = None, nombre_fantasia: str = None, 
                                condicion_iva: str = None, punto_venta: int = None,
                                direccion: str = None, telefono: str = None, email: str = None, google_sheet_id: str = None,
                                ingresos_brutos: str = None, fecha_inicio_actividades: str = None) -> dict:
    """
    Guarda o actualiza la configuración del emisor en un archivo JSON.
    Si el archivo ya existe, actualiza los campos provistos y mantiene los existentes.
    """
    try:
        # Validar condición IVA si se provee
        if condicion_iva:
            condiciones_validas = ["RESPONSABLE_INSCRIPTO", "EXENTO", "CONSUMIDOR_FINAL", "MONOTRIBUTO", "NO_CATEGORIZADO"]
            if condicion_iva not in condiciones_validas:
                raise ValueError(f"Condición IVA '{condicion_iva}' no es válida. Debe ser una de: {', '.join(condiciones_validas)}")
        
        # Crear directorio si no existe
        os.makedirs(BOVEDA_TEMPORAL_PATH, exist_ok=True)
        
        # Ruta del archivo de configuración
        config_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"emisor_{cuit_empresa}.json")
        
        # Cargar configuración existente si existe
        configuracion = {}
        if os.path.exists(config_path):
            try:
                import json
                with open(config_path, "r", encoding="utf-8") as f:
                    configuracion = json.load(f)
            except Exception:
                configuracion = {}

        # Actualizar campos
        configuracion["cuit_empresa"] = cuit_empresa
        if razon_social is not None: configuracion["razon_social"] = razon_social
        if nombre_fantasia is not None: configuracion["nombre_fantasia"] = nombre_fantasia
        if condicion_iva is not None: configuracion["condicion_iva"] = condicion_iva
        if punto_venta is not None: configuracion["punto_venta"] = punto_venta
        if direccion is not None: configuracion["direccion"] = direccion
        if telefono is not None: configuracion["telefono"] = telefono
        if email is not None: configuracion["email"] = email
        if google_sheet_id is not None: configuracion["google_sheet_id"] = google_sheet_id
        
        # Asegurar que existan los campos nuevos
        if "Nro Ingresos Brutos" not in configuracion: configuracion["Nro Ingresos Brutos"] = ""
        if "Fecha Inicio" not in configuracion: configuracion["Fecha Inicio"] = ""

        if ingresos_brutos is not None: configuracion["Nro Ingresos Brutos"] = ingresos_brutos
        if fecha_inicio_actividades is not None: configuracion["Fecha Inicio"] = fecha_inicio_actividades
        
        configuracion["fecha_actualizacion"] = os.path.getctime(config_path) if os.path.exists(config_path) else None
        
        # Guardar en archivo JSON
        import json
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(configuracion, f, indent=2, ensure_ascii=False)
        
        # Normalizar claves para el retorno
        if "Nro Ingresos Brutos" in configuracion:
            configuracion["ingresos_brutos"] = configuracion["Nro Ingresos Brutos"]
        if "Fecha Inicio" in configuracion:
            configuracion["fecha_inicio_actividades"] = configuracion["Fecha Inicio"]

        return {
            "message": "Configuración del emisor guardada exitosamente",
            "cuit": cuit_empresa,
            "configuracion": configuracion
        }
        
    except Exception as e:
        raise ValueError(f"Error guardando configuración del emisor: {str(e)}")

def obtener_configuracion_emisor(cuit: str) -> dict:
    """
    Obtiene la configuración del emisor desde el archivo JSON.
    """
    try:
        original_cuit = cuit
        cuit = _normalize_cuit(cuit) or cuit
        # Si existe un archivo con espacio final, renombrarlo
        legacy_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"emisor_{original_cuit}.json")
        config_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"emisor_{cuit}.json")
        try:
            if legacy_path != config_path and os.path.exists(legacy_path) and not os.path.exists(config_path):
                os.rename(legacy_path, config_path)
        except Exception:
            pass
        
        if not os.path.exists(config_path):
            return {
                "cuit_empresa": cuit,
                "razon_social": "",
                "nombre_fantasia": "",
                "condicion_iva": "RESPONSABLE_INSCRIPTO",
                "punto_venta": 1,
                "direccion": "",
                "telefono": "",
                "email": "",
                "google_sheet_id": "",
                "existe": False
            }
        
        # Leer configuración existente
        import json
        with open(config_path, "r", encoding="utf-8") as f:
            configuracion = json.load(f)

        configuracion["existe"] = True
        # Normalizar CUIT dentro del contenido
        configuracion["cuit_empresa"] = _normalize_cuit(configuracion.get("cuit_empresa")) or configuracion.get("cuit_empresa")
        
        # Normalizar campos extras para la API
        if "Nro Ingresos Brutos" in configuracion:
            configuracion["ingresos_brutos"] = configuracion["Nro Ingresos Brutos"]
        if "Fecha Inicio" in configuracion:
            configuracion["fecha_inicio_actividades"] = configuracion["Fecha Inicio"]
            
        return configuracion
        
    except Exception as e:
        raise ValueError(f"Error obteniendo configuración del emisor: {str(e)}")

def listar_certificados_disponibles() -> list:
    """
    Lista todos los certificados disponibles en el directorio.
    """
    if not os.path.exists(BOVEDA_TEMPORAL_PATH):
        return []
    
    certificados = []
    for archivo in os.listdir(BOVEDA_TEMPORAL_PATH):
        if archivo.endswith('.crt'):
            cuit = archivo.replace('.crt', '')
            clave_path = os.path.join(BOVEDA_TEMPORAL_PATH, f"{cuit}.key")
            certificados.append({
                "cuit": cuit,
                "tiene_clave": os.path.exists(clave_path),
                "certificado_path": os.path.join(BOVEDA_TEMPORAL_PATH, archivo)
            })
    
    return certificados