import os
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from backend import config

# Directorio seguro para guardado temporal de claves
BOVEDA_TEMPORAL_PATH = os.getenv('AFIP_KEYS_PATH', './boveda_afip_temporal')

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