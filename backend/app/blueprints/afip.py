from fastapi import APIRouter, HTTPException, Response, Depends
from pydantic import BaseModel
from typing import Optional, List
from sqlmodel import Session, select
from backend.database import get_db
from backend.modelos import AfipCredencial, AfipEmisorEmpresa, Empresa
from backend.utils.afip_tools_manager import (
    generar_csr_y_guardar_clave_temporal,
    guardar_certificado_final,
    listar_certificados_disponibles,
    procesar_archivo_certificado_completo
)

router = APIRouter(prefix="/api/afip", tags=["AFIP"])

class GenerarCSRRequest(BaseModel):
    cuit_empresa: str
    razon_social: str

class SubirCertificadoRequest(BaseModel):
    cuit: str
    certificado_pem: str

class SubirArchivoCompletoRequest(BaseModel):
    cuit: str
    archivo_contenido: str
    nombre_archivo: str

class ConfiguracionEmisorRequest(BaseModel):
    cuit_empresa: str
    razon_social: str
    nombre_fantasia: Optional[str] = None
    condicion_iva: str  # RESPONSABLE_INSCRIPTO, MONOTRIBUTO, etc.
    punto_venta: int = 1
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None

@router.post("/generar-csr")
async def generar_csr_endpoint(request: GenerarCSRRequest):
    """
    Genera un CSR y guarda la clave privada temporalmente.
    Devuelve el CSR para descarga.
    """
    try:
        csr_content = generar_csr_y_guardar_clave_temporal(
            cuit_empresa=request.cuit_empresa,
            razon_social=request.razon_social
        )
        
        return Response(
            content=csr_content,
            media_type="application/x-pem-file",
            headers={
                "Content-Disposition": f"attachment; filename=csr_{request.cuit_empresa}.pem"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando CSR: {str(e)}")

@router.post("/subir-certificado")
async def subir_certificado_endpoint(request: SubirCertificadoRequest):
    """
    Recibe el certificado firmado por AFIP y lo guarda junto con la clave privada.
    """
    try:
        resultado = guardar_certificado_final(
            cuit=request.cuit,
            certificado_pem=request.certificado_pem
        )
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando certificado: {str(e)}")

@router.post("/procesar-archivo-completo")
async def procesar_archivo_completo_endpoint(request: SubirArchivoCompletoRequest):
    """
    Procesa un archivo completo que contiene tanto el certificado como la clave privada.
    Extrae automáticamente ambos componentes y los guarda por separado.
    """
    try:
        resultado = procesar_archivo_certificado_completo(
            cuit=request.cuit,
            archivo_contenido=request.archivo_contenido
        )
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando archivo completo: {str(e)}")

@router.get("/certificados")
async def listar_certificados_endpoint():
    """
    Lista todos los certificados disponibles.
    """
    try:
        certificados = listar_certificados_disponibles()
        return {"certificados": certificados}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listando certificados: {str(e)}")

@router.get("/estado/{cuit}")
async def verificar_estado_certificado(cuit: str):
    """
    Verifica el estado de certificado para un CUIT específico.
    """
    try:
        certificados = listar_certificados_disponibles()
        certificado = next((c for c in certificados if c["cuit"] == cuit), None)
        
        if not certificado:
            return {
                "cuit": cuit,
                "estado": "sin_generar",
                "mensaje": "No se ha generado CSR para este CUIT"
            }
        
        if certificado["tiene_clave"]:
            return {
                "cuit": cuit,
                "estado": "completo",
                "mensaje": "Certificado y clave privada disponibles"
            }
        else:
            return {
                "cuit": cuit,
                "estado": "pendiente",
                "mensaje": "CSR generado, falta subir certificado firmado"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verificando estado: {str(e)}")

@router.post("/configurar-emisor")
async def configurar_emisor_endpoint(request: ConfiguracionEmisorRequest, db: Session = Depends(get_db)):
    """
    Configura o actualiza los datos del emisor para facturación.
    """
    try:
        from backend.utils.afip_tools_manager import guardar_configuracion_emisor
        resultado = guardar_configuracion_emisor(
            cuit_empresa=request.cuit_empresa,
            razon_social=request.razon_social,
            nombre_fantasia=request.nombre_fantasia,
            condicion_iva=request.condicion_iva,
            punto_venta=request.punto_venta,
            direccion=request.direccion,
            telefono=request.telefono,
            email=request.email
        )
        # Persistir / actualizar AfipEmisorEmpresa si existe Empresa con ese CUIT
        try:
            empresa = db.exec(select(Empresa).where(Empresa.cuit == request.cuit_empresa)).first()
            if empresa:
                emisor = db.exec(select(AfipEmisorEmpresa).where(AfipEmisorEmpresa.cuit == request.cuit_empresa, AfipEmisorEmpresa.id_empresa == empresa.id)).first()
                if not emisor:
                    emisor = AfipEmisorEmpresa(
                        id_empresa=empresa.id,
                        cuit=request.cuit_empresa,
                        razon_social=request.razon_social,
                        nombre_fantasia=request.nombre_fantasia,
                        condicion_iva=request.condicion_iva,
                        punto_venta=request.punto_venta,
                        direccion=request.direccion,
                        telefono=request.telefono,
                        email=request.email,
                        habilitado=True
                    )
                    db.add(emisor)
                else:
                    emisor.razon_social = request.razon_social
                    emisor.nombre_fantasia = request.nombre_fantasia
                    emisor.condicion_iva = request.condicion_iva
                    emisor.punto_venta = request.punto_venta
                    emisor.direccion = request.direccion
                    emisor.telefono = request.telefono
                    emisor.email = request.email
                db.commit(); db.refresh(emisor)
                resultado['persistido_bd'] = True
                resultado['emisor_empresa_id'] = emisor.id
            else:
                resultado['persistido_bd'] = False
                resultado['motivo_no_bd'] = 'Empresa con ese CUIT no encontrada en tabla empresas'
        except Exception as _e:
            resultado['persistido_bd'] = False
            resultado['error_persistencia'] = str(_e)
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error configurando emisor: {str(e)}")

@router.get("/configuracion-emisor/{cuit}")
async def obtener_configuracion_emisor(cuit: str):
    """
    Obtiene la configuración actual del emisor.
    """
    try:
        from backend.utils.afip_tools_manager import obtener_configuracion_emisor
        configuracion = obtener_configuracion_emisor(cuit)
        return configuracion
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo configuración: {str(e)}")

@router.get("/condiciones-iva")
async def listar_condiciones_iva():
    """
    Lista las condiciones de IVA disponibles.
    """
    return {
        "condiciones": [
            {"id": 1, "nombre": "RESPONSABLE_INSCRIPTO", "descripcion": "Responsable Inscripto"},
            {"id": 4, "nombre": "EXENTO", "descripcion": "Exento"},
            {"id": 5, "nombre": "CONSUMIDOR_FINAL", "descripcion": "Consumidor Final"},
            {"id": 6, "nombre": "MONOTRIBUTO", "descripcion": "Monotributo"},
            {"id": 7, "nombre": "NO_CATEGORIZADO", "descripcion": "No Categorizado"}
        ]
    }

@router.get("")
async def afip_root(action: Optional[str] = None):
    """
    Endpoint raíz de AFIP. Devuelve ayuda básica.

    Parámetros opcionales:
      action=condiciones-iva  -> devuelve mismas condiciones que /api/afip/condiciones-iva
    """
    if action == 'condiciones-iva':
        return await listar_condiciones_iva()
    return {
        "mensaje": "Root AFIP OK",
        "uso": {
            "condiciones_iva": "/api/afip/condiciones-iva",
            "credenciales": ["GET /api/afip/credenciales", "GET /api/afip/credenciales/{cuit}"],
            "prueba_factura": "/api/afip/prueba-factura-1peso",
            "diagnostico_credencial": "/api/afip/diagnostico-credencial/{cuit}",
        },
        "tip": "Llama a /api/afip/condiciones-iva para listado de condiciones o agrega ?action=condiciones-iva",
        "ok": True
    }
@router.get("/")
async def afip_root_slash(action: Optional[str] = None):
    # Delegar al mismo handler para soportar trailing slash
    return await afip_root(action=action)


# ================== NUEVO: CRUD SIMPLE PARA CREDENCIALES EN BD ==================

class AfipCredencialCreate(BaseModel):
    cuit: str
    certificado_pem: Optional[str] = None
    clave_privada_pem: Optional[str] = None
    notas: Optional[str] = None

class AfipCredencialUpdate(BaseModel):
    certificado_pem: Optional[str] = None
    clave_privada_pem: Optional[str] = None
    activo: Optional[bool] = None
    notas: Optional[str] = None

@router.post("/credenciales", summary="Crear registro de credenciales en BD")
async def crear_credencial(data: AfipCredencialCreate, db: Session = Depends(get_db)):
    # Normalizar CUIT
    cuit = data.cuit.strip()
    # Evitar duplicados
    existente = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == cuit)).first()
    if existente:
        raise HTTPException(status_code=400, detail="Ya existe credencial para ese CUIT")
    # Fingerprints simples (opcional)
    import hashlib
    def fp(txt: Optional[str]):
        if not txt:
            return None
        return hashlib.sha1(txt.encode('utf-8', errors='ignore')).hexdigest()
    cred = AfipCredencial(
        cuit=cuit,
        certificado_pem=data.certificado_pem,
        clave_privada_pem=data.clave_privada_pem,
        fingerprint_cert=fp(data.certificado_pem),
        fingerprint_key=fp(data.clave_privada_pem),
        notas=data.notas
    )
    db.add(cred); db.commit(); db.refresh(cred)
    return cred

@router.get("/credenciales", response_model=List[dict], summary="Listar credenciales registradas")
async def listar_credenciales(db: Session = Depends(get_db)):
    rows = db.exec(select(AfipCredencial)).all()
    return [ {
        'id': r.id,
        'cuit': r.cuit,
        'activo': r.activo,
        'fingerprint_cert': r.fingerprint_cert,
        'fingerprint_key': r.fingerprint_key,
        'notas': r.notas,
        'created_at': r.created_at,
        'updated_at': r.updated_at
    } for r in rows ]

@router.get("/credenciales/{cuit}")
async def obtener_credencial(cuit: str, db: Session = Depends(get_db), revelar_material: bool = False):
    """Obtiene una credencial. Por defecto oculta el material criptográfico.

    Parametros:
      revelar_material: si es True devuelve certificado_pem y clave_privada_pem (restringir con auth futura).
    """
    row = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == cuit.strip())).first()
    if not row:
        raise HTTPException(status_code=404, detail="No encontrada")
    base = {
        'id': row.id,
        'cuit': row.cuit,
        'activo': row.activo,
        'fingerprint_cert': row.fingerprint_cert,
        'fingerprint_key': row.fingerprint_key,
        'notas': row.notas,
        'created_at': row.created_at,
        'updated_at': row.updated_at
    }
    if revelar_material:
        base['certificado_pem'] = row.certificado_pem
        base['clave_privada_pem'] = row.clave_privada_pem
    return base

@router.patch("/credenciales/{cuit}")
async def actualizar_credencial(cuit: str, data: AfipCredencialUpdate, db: Session = Depends(get_db)):
    row = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == cuit.strip())).first()
    if not row:
        raise HTTPException(status_code=404, detail="No encontrada")
    changed = False
    import hashlib
    def fp(txt: Optional[str]):
        if not txt:
            return None
        return hashlib.sha1(txt.encode('utf-8', errors='ignore')).hexdigest()
    if data.certificado_pem is not None:
        row.certificado_pem = data.certificado_pem; row.fingerprint_cert = fp(data.certificado_pem); changed = True
    if data.clave_privada_pem is not None:
        row.clave_privada_pem = data.clave_privada_pem; row.fingerprint_key = fp(data.clave_privada_pem); changed = True
    if data.activo is not None:
        row.activo = data.activo; changed = True
    if data.notas is not None:
        row.notas = data.notas; changed = True
    if changed:
        db.add(row); db.commit(); db.refresh(row)
    return row

@router.delete("/credenciales/{cuit}")
async def borrar_credencial(cuit: str, db: Session = Depends(get_db)):
    row = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == cuit.strip())).first()
    if not row:
        raise HTTPException(status_code=404, detail="No encontrada")
    db.delete(row); db.commit()
    return {"detail": "eliminada"}


@router.get("/prueba-factura-1peso")
async def prueba_factura_un_peso(emisor_cuit: str | None = None, tipo_forzado: int | None = None, mock: bool = False):
    """Emite (o simula) un comprobante de prueba por 1.00.

    Parámetros:
      emisor_cuit: CUIT a usar (opcional)
      tipo_forzado: 1=A,6=B,11=C (opcional)
      mock: si true, no llama al microservicio y devuelve factura simulada.
    """
    from backend.utils.afipTools import generar_factura_para_venta, preflight_afip_credentials, ReceptorData
    pre = preflight_afip_credentials(emisor_cuit)
    receptor = ReceptorData(cuit_o_dni='0', condicion_iva='CONSUMIDOR_FINAL', nombre_razon_social='TEST CONSUMIDOR FINAL', domicilio='S/D')
    simulated = False
    if mock:
        # Simulación local sin microservicio
        simulated = True
        import datetime, base64, json
        qr_payload = {
            'ver': 1,
            'fecha': datetime.date.today().isoformat(),
            'cuit': pre.get('resuelto_cuit') or emisor_cuit or '00000000000',
            'ptoVta': 1,
            'tipoCmp': tipo_forzado or 11,
            'nroCmp': 1234,
            'importe': 1.00,
            'moneda': 'PES',
            'ctz': 1,
            'tipoDocRec': 99,
            'nroDocRec': 0,
            'tipoCodAut': 'E',
            'codAut': 'SIMULADO123456'
        }
        qr_json = json.dumps(qr_payload, separators=(',',':'), ensure_ascii=False)
        qr_code = 'data:application/json;base64,' + base64.b64encode(qr_json.encode()).decode()
        res = {
            'cuit_emisor': qr_payload['cuit'],
            'tipo_comprobante': qr_payload['tipoCmp'],
            'numero_comprobante': qr_payload['nroCmp'],
            'punto_venta': qr_payload['ptoVta'],
            'cae': '00000000000000',
            'vencimiento_cae': datetime.date.today().isoformat(),
            'importe_neto': 1.00,
            'importe_iva': 0.0,
            'importe_total': 1.00,
            'qr_code': qr_code,
        }
    else:
        try:
            res = generar_factura_para_venta(total=1.0, cliente_data=receptor, emisor_cuit=emisor_cuit, tipo_forzado=tipo_forzado)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error emitiendo comprobante de prueba: {e}")
    mismatch = None
    if tipo_forzado is not None:
        obtenido_tipo = res.get('tipo_comprobante') or res.get('tipo_afip')
        try:
            mismatch = int(obtenido_tipo) != int(tipo_forzado)
        except Exception:
            mismatch = True
    qr = res.get('qr_code') or res.get('qr_url_afip')
    cae = res.get('cae') or res.get('CAE')
    return {
        'simulado': simulated,
        'preflight': pre,
        'resultado_afip': {
            'cuit_emisor': res.get('cuit_emisor') or pre.get('resuelto_cuit'),
            'tipo_comprobante': res.get('tipo_comprobante') or res.get('tipo_afip'),
            'numero_comprobante': res.get('numero_comprobante'),
            'punto_venta': res.get('punto_venta'),
            'cae': cae,
            'vencimiento_cae': res.get('vencimiento_cae'),
            'importe_neto': res.get('importe_neto'),
            'importe_iva': res.get('importe_iva'),
            'importe_total': res.get('importe_total') or 1.0,
            'qr_present': bool(qr),
            'qr_code': qr,
        },
        'tipo_forzado_intentado': tipo_forzado,
        'tipo_mismatch': mismatch,
        'fuente_credenciales': pre.get('fuente'),
        'fingerprint_cert': pre.get('cert_fingerprint'),
        'fingerprint_key': pre.get('key_fingerprint')
    }


@router.get("/diagnostico-credencial/{cuit}")
async def diagnostico_credencial(cuit: str, update_db: bool = False, fix_escape: bool = False, db: Session = Depends(get_db)):
    """Diagnóstico profundo de una credencial AFIP almacenada.

    - Valida parseo de certificado y clave privada
    - Compara que la clave privada corresponda al certificado (módulo / public numbers)
    - Devuelve fingerprints, sujeto, emisor, fechas de validez y tipo de clave
    - Opción update_db: reescribe versión saneada (usa rutina interna) y recalcula fingerprints
    """
    from sqlmodel import select
    from backend.utils.afipTools import _sanitize_pem  # type: ignore
    import hashlib
    try:
        row = db.exec(select(AfipCredencial).where(AfipCredencial.cuit == cuit.strip())).first()
        if not row:
            raise HTTPException(status_code=404, detail="Credencial no encontrada")
        cert_pem_orig = row.certificado_pem or ''
        key_pem_orig = row.clave_privada_pem or ''
        sane_cert = _sanitize_pem(cert_pem_orig, 'cert') if cert_pem_orig else None
        sane_key = _sanitize_pem(key_pem_orig, 'key') if key_pem_orig else None
        applied_fix = False
        fix_success = False
        # Intento de reparación si se solicita y el certificado contiene secuencias escapadas \n
        if fix_escape and cert_pem_orig and ('\\n' in cert_pem_orig or 'InvalidByte' in cert_pem_orig):
            import re
            candidate = cert_pem_orig
            # Reemplazar secuencias \n por saltos reales
            candidate = candidate.replace('\\r', '\n').replace('\\n', '\n')
            # Eliminar posibles dobles backslash al inicio de líneas
            candidate = re.sub(r'\n\\(?=[A-Za-z0-9+/])', '\n', candidate)
            # Eliminar comillas envolventes accidentales
            candidate = candidate.strip().strip('"').strip("'")
            candidate = _sanitize_pem(candidate, 'cert')
            try:
                from cryptography import x509 as _x509_test
                _x509_test.load_pem_x509_certificate(candidate.encode())
                sane_cert = candidate
                applied_fix = True
                fix_success = True
            except Exception:
                applied_fix = True
                fix_success = False
        # Cargar usando cryptography
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa, ec
        cert_info = {}
        key_info = {}
        match = None
        parse_errors = []
        try:
            cert_obj = x509.load_pem_x509_certificate(sane_cert.encode()) if sane_cert else None
            if cert_obj:
                pub = cert_obj.public_key()
                issuer = cert_obj.issuer.rfc4514_string()
                subject = cert_obj.subject.rfc4514_string()
                not_before = cert_obj.not_valid_before.isoformat()
                not_after = cert_obj.not_valid_after.isoformat()
                pub_type = pub.__class__.__name__
                modulus_fp = None
                if isinstance(pub, rsa.RSAPublicKey):
                    numbers = pub.public_numbers()
                    modulus_fp = hashlib.sha256(numbers.n.to_bytes((numbers.n.bit_length()+7)//8, 'big')).hexdigest()
                cert_info = {
                    'issuer': issuer,
                    'subject': subject,
                    'not_before': not_before,
                    'not_after': not_after,
                    'public_key_type': pub_type,
                    'modulus_fingerprint_sha256': modulus_fp,
                }
        except Exception as e:
            parse_errors.append(f'cert: {e}')
            cert_obj = None  # type: ignore
        try:
            key_obj = serialization.load_pem_private_key(sane_key.encode(), password=None) if sane_key else None
            if key_obj:
                pub = key_obj.public_key()
                key_type = pub.__class__.__name__
                modulus_fp = None
                if isinstance(pub, rsa.RSAPublicKey):
                    numbers = pub.public_numbers()
                    modulus_fp = hashlib.sha256(numbers.n.to_bytes((numbers.n.bit_length()+7)//8, 'big')).hexdigest()
                key_info = {
                    'public_key_type': key_type,
                    'modulus_fingerprint_sha256': modulus_fp,
                }
        except Exception as e:
            parse_errors.append(f'key: {e}')
            key_obj = None  # type: ignore
        # Comparar modulo si ambos RSA
        if cert_info.get('modulus_fingerprint_sha256') and key_info.get('modulus_fingerprint_sha256'):
            match = cert_info['modulus_fingerprint_sha256'] == key_info['modulus_fingerprint_sha256']
        # Si se pidió actualizar y no hay errores graves
        updated = False
        if update_db and sane_cert and sane_key and not parse_errors:
            row.certificado_pem = sane_cert
            row.clave_privada_pem = sane_key
            row.fingerprint_cert = hashlib.sha1(sane_cert.encode()).hexdigest()
            row.fingerprint_key = hashlib.sha1(sane_key.encode()).hexdigest()
            db.add(row); db.commit(); db.refresh(row)
            updated = True
        return {
            'cuit': cuit,
            'activo': row.activo,
            'lengths': {
                'cert_original': len(cert_pem_orig),
                'key_original': len(key_pem_orig),
                'cert_sane': len(sane_cert) if sane_cert else 0,
                'key_sane': len(sane_key) if sane_key else 0,
            },
            'fingerprints': {
                'db_cert': row.fingerprint_cert,
                'db_key': row.fingerprint_key,
            },
            'parsed': {
                'cert': cert_info,
                'key': key_info,
                'match_modulus': match,
            },
            'parse_errors': parse_errors or None,
            'updated_db': updated,
            'can_update': bool(sane_cert and sane_key and not parse_errors),
            'applied_fix_escape': applied_fix,
            'fix_escape_success': fix_success,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error diagnóstico: {e}')
