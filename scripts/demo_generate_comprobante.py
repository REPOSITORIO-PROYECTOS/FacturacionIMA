#!/usr/bin/env python3
"""Demo autónomo: genera la URL del QR para un comprobante simulado.

No depende del paquete `backend` para evitar problemas de importación
en entornos con dependencias faltantes. Si tienes instalado `qrcode`,
el script también guardará un PNG en `scripts/qr_demo.png`.
"""
import json
import base64
from datetime import datetime, timedelta
import os
from decimal import Decimal


def default_json(o):
    try:
        from datetime import date, datetime
        import base64
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, Decimal):
            try:
                return float(o)
            except Exception:
                return str(o)
        if isinstance(o, (bytes, bytearray)):
            return base64.b64encode(bytes(o)).decode('utf-8')
        return str(o)
    except Exception:
        return str(o)

try:
    import qrcode
except Exception:
    qrcode = None


def build_qr_url_from_afip_data(afip_data: dict) -> tuple[str, str | None]:
    # Reproducir la lógica mínima para construir el payload y la URL
    fecha_val = afip_data.get("fecha_comprobante")
    if isinstance(fecha_val, str):
        try:
            fecha_str = fecha_val.split("T")[0]
        except Exception:
            fecha_str = fecha_val
    elif isinstance(fecha_val, (datetime, )):
        fecha_str = fecha_val.strftime("%Y-%m-%d")
    else:
        fecha_str = datetime.now().strftime("%Y-%m-%d")

    datos_para_qr = {
        "ver": 1,
        "fecha": fecha_str,
        "cuit": int(afip_data.get("cuit_emisor") or 0),
        "ptoVta": int(afip_data.get("punto_venta") or 0),
        "tipoCmp": int(afip_data.get("tipo_comprobante") or 0),
        "nroCmp": int(afip_data.get("numero_comprobante") or 0),
        "importe": float(afip_data.get("importe_total") or 0.0),
        "moneda": "PES",
        "ctz": 1,
        "tipoDocRec": int(afip_data.get("tipo_doc_receptor") or 0),
        "nroDocRec": int(afip_data.get("nro_doc_receptor") or 0),
        "tipoCodAut": "E",
        "codAut": int(afip_data.get("cae") or 0)
    }

    json_string = json.dumps(datos_para_qr, ensure_ascii=False)
    datos_base64 = base64.b64encode(json_string.encode('utf-8')).decode('utf-8')
    url_para_qr = f"https://www.afip.gob.ar/fe/qr/?p={datos_base64}"

    # Si `qrcode` está instalado, generar data URL
    if qrcode is not None:
        img = qrcode.make(url_para_qr)
        from io import BytesIO
        buf = BytesIO()
        img.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        qr_data_url = f"data:image/png;base64,{img_b64}"
        return url_para_qr, qr_data_url
    else:
        return url_para_qr, None


def main():
    now = datetime.now()
    afip_data = {
        "resultado": "A",
        "cae": "12345678901234",
        "vencimiento_cae": (now + timedelta(days=10)).isoformat(),
        "numero_comprobante": 12345,
        "punto_venta": 1,
        "tipo_comprobante": 1,
        "fecha_comprobante": now,
        "importe_total": 1234.56,
        "neto": 1020.29,
        "iva": 214.27,
        "cuit_emisor": "30718331680",
        "tipo_doc_receptor": 80,
        "nro_doc_receptor": "20123456789",
    }

    qr_url, qr_data_url = build_qr_url_from_afip_data(afip_data)

    comprobante = {
        "ingreso_id": "demo_0001",
        "cae": afip_data["cae"],
        "numero_comprobante": afip_data["numero_comprobante"],
        "punto_venta": afip_data["punto_venta"],
        "tipo_comprobante": afip_data["tipo_comprobante"],
        "fecha_comprobante": afip_data["fecha_comprobante"],
        "vencimiento_cae": afip_data["vencimiento_cae"],
        "importe_total": afip_data["importe_total"],
        "cuit_emisor": afip_data["cuit_emisor"],
        "tipo_doc_receptor": afip_data["tipo_doc_receptor"],
        "nro_doc_receptor": afip_data["nro_doc_receptor"],
        "qr_url_afip": qr_url,
        "qr_data_url_present": bool(qr_data_url),
    }

    print("Comprobante de demostración (JSON):")
    print(json.dumps(comprobante, ensure_ascii=False, indent=2, default=default_json))

    if qr_data_url:
        if qrcode is not None:
            out_path = os.path.join(os.path.dirname(__file__), "qr_demo.png")
            b64 = qr_data_url.split(",", 1)[1]
            with open(out_path, "wb") as f:
                f.write(base64.b64decode(b64))
            print(f"QR guardado en: {out_path}")
        else:
            print("QR disponible como data URL (instala 'qrcode' para guardar PNG localmente)")
    else:
        print("QR no disponible (solo se generó la URL)")


if __name__ == '__main__':
    main()
