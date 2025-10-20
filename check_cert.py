from cryptography import x509
from cryptography.hazmat.primitives import serialization
import hashlib

# Load cert
with open('/home/sgi_user/proyectos/FacturacionIMA/boveda_afip_temporal/30718331680.crt', 'r') as f:
    cert_pem = f.read()

# Load key
with open('/home/sgi_user/proyectos/FacturacionIMA/boveda_afip_temporal/30718331680.key', 'r') as f:
    key_pem = f.read()

cert = x509.load_pem_x509_certificate(cert_pem.encode())
key = serialization.load_pem_private_key(key_pem.encode(), password=None)

pub_cert = cert.public_key()
pub_key = key.public_key()

print("Cert public key type:", type(pub_cert))
print("Key public key type:", type(pub_key))

if hasattr(pub_cert, 'public_numbers') and hasattr(pub_key, 'public_numbers'):
    cert_n = pub_cert.public_numbers().n
    key_n = pub_key.public_numbers().n
    match = cert_n == key_n
    print("Modulus match:", match)
else:
    print("Cannot compare modulus")

# Fingerprints
cert_fp = hashlib.sha1(cert_pem.encode()).hexdigest()
key_fp = hashlib.sha1(key_pem.encode()).hexdigest()
print("Cert fingerprint:", cert_fp)
print("Key fingerprint:", key_fp)