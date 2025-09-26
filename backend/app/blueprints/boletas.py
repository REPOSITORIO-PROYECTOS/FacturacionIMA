from fastapi import APIRouter, Depends, HTTPException, Response
from datetime import datetime
from typing import Any, Dict, List
from pydantic import BaseModel
from backend.sqlite_security import obtener_usuario_actual_sqlite
from backend.utils.mysql_handler import get_db_connection
from backend.utils.tablasHandler import TablasHandler
from thefuzz import fuzz 
import json
import html as _html
from typing import Optional
from backend.utils.billige_manage import process_invoice_batch_for_endpoint

router = APIRouter(
    prefix="/boletas"
)

handler = TablasHandler() 

@router.get("/obtener-todas", response_model=List[Dict[str, Any]])
def traer_todas_las_boletas(skip: int = 0, limit: int = 20):

    try:
        todas_las_boletas = handler.cargar_ingresos()

        return todas_las_boletas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar todas las boletas: {e}")



@router.get("/obtener-no-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_no_facturadas(skip: int = 0, limit: int = 20):

    try:

        todas_las_boletas = handler.cargar_ingresos()

        boletas_filtradas = [
            boleta for boleta in todas_las_boletas 
            if boleta.get("facturacion") == "falta facturar"
        ]

        return boletas_filtradas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar boletas no facturadas: {e}")


@router.get("/obtener-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_facturadas_desde_db(skip: int = 0, limit: int = 20):

    conn = None
    try:
 
        conn = get_db_connection()
        if not conn:

            raise HTTPException(status_code=503, detail="No se pudo establecer conexión con la base de datos.")
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT * 
            FROM facturas_electronicas 
            ORDER BY id DESC 
            LIMIT %s OFFSET %s
        """

        cursor.execute(query, (limit, skip))
        facturas_guardadas = cursor.fetchall()
        return facturas_guardadas

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al consultar la base de datos: {e}")

    finally:
        if conn and conn.is_connected():
            cursor.close()
            conn.close()


@router.get("/obtener-por-repartidor", response_model=List[Dict[str, Any]])
def traer_todas_por_repartidor(
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite) 
):
    try:

        username = usuario_actual.get("nombre_usuario", "")
        rol = usuario_actual.get("rol_id", "")

        if ( rol == "1"):   #si es admin le mando todas
            try:
                todas_las_boletas = handler.cargar_ingresos()

                return todas_las_boletas[skip : skip + limit]

            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar todas las boletas: {e}")


        if not username:
            raise HTTPException(status_code=400, detail="No se pudo obtener el nombre de usuario.")

        todas_las_boletas = handler.cargar_ingresos()
        boletas_del_repartidor = []

        for boleta in todas_las_boletas:
            nombre_repartidor_excel = boleta.get("Repartidor", "")
            
            if nombre_repartidor_excel:
                ratio = fuzz.token_set_ratio(username, nombre_repartidor_excel)

                if ratio > 80:
                    boletas_del_repartidor.append(boleta)

        return boletas_del_repartidor[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar las boletas: {e}")



class RazonSocialRequest(BaseModel):
    razon_social: str


@router.post("/obtener-por-razon-social", response_model=List[Dict[str, Any]])
def traer_todas_por_razon_social(
    request_data: RazonSocialRequest,
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite) 
):
    try:
        rol = usuario_actual.get("rol_id", "")

        if (rol == "1"):
            try:
                todas_las_boletas = handler.cargar_ingresos()
                return todas_las_boletas[skip : skip + limit]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error al cargar todas las boletas para el admin: {e}")

        razon_social_buscada = request_data.razon_social
        if not razon_social_buscada:
            raise HTTPException(status_code=400, detail="La razón social no puede estar vacía.")

        todas_las_boletas = handler.cargar_ingresos()
        boletas_encontradas = []

        for boleta in todas_las_boletas:
            razon_social_excel = boleta.get("Razon Social", "")
            
            if razon_social_excel:
                ratio = fuzz.token_set_ratio(razon_social_buscada, razon_social_excel)

                if ratio > 80:
                    boletas_encontradas.append(boleta)

        return boletas_encontradas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al buscar boletas por razón social: {e}")




class FechaRequest(BaseModel):
    fecha: str

@router.post("/obtener-por-dia", response_model=List[Dict[str, Any]])
def traer_todas_por_dia(
    request_data: FechaRequest,
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite) 
):
    try:
        rol = usuario_actual.get("rol_id", "")

        if (rol == "1"):
            try:
                todas_las_boletas = handler.cargar_ingresos()
                return todas_las_boletas[skip : skip + limit]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error al cargar todas las boletas para el admin: {e}")

        fecha_buscada_str = request_data.fecha
        if not fecha_buscada_str:
            raise HTTPException(status_code=400, detail="La fecha no puede estar vacía.")


        try:
            fecha_buscada_obj = datetime.strptime(fecha_buscada_str, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="El formato de fecha es inválido. Por favor, usa AAAA-MM-DD.")

        todas_las_boletas = handler.cargar_ingresos()
        boletas_del_dia = []

        for boleta in todas_las_boletas:

            fecha_excel_raw = boleta.get("Fecha", "")
            
            if not fecha_excel_raw:
                continue 

            try:
                fecha_excel_obj = None
                if isinstance(fecha_excel_raw, datetime):
                    fecha_excel_obj = fecha_excel_raw.date()
                elif isinstance(fecha_excel_raw, str):
                    fecha_sin_hora = fecha_excel_raw.split(" ")[0]
                    fecha_excel_obj = datetime.strptime(fecha_sin_hora, "%d/%m/%Y").date()

                if fecha_excel_obj and fecha_excel_obj == fecha_buscada_obj:
                    boletas_del_dia.append(boleta)

            except (ValueError, TypeError):
                continue

        return boletas_del_dia[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al buscar boletas por día: {e}")



@router.get("/repartidores", response_model=List[Dict[str, Any]])
def listar_repartidores(
    skip: int = 0,
    limit: int = 1000,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)
):
    """
    Devuelve una lista de repartidores y las razones sociales asociadas.
    - Si el usuario es admin (rol_id == "1"), devuelve todos los repartidores encontrados.
    - Si no es admin, intenta devolver únicamente el repartidor asociado al usuario
      (se usa fuzzy matching sobre el campo 'Repartidor').
    Esto permite obtener desde el frontend el nombre de repartidor "seguro" según
    el usuario autenticado y las razones sociales relacionadas a sus boletas.
    """
    try:
        rol = usuario_actual.get("rol_id", "")
        username = usuario_actual.get("nombre_usuario", "")

        todas_las_boletas = handler.cargar_ingresos()

        # Construir mapping repartidor -> set(razon social)
        mapping: Dict[str, set] = {}
        for boleta in todas_las_boletas:
            repartidor = boleta.get("Repartidor") or boleta.get("repartidor") or ""
            razon = (
                boleta.get("Razon Social")
                or boleta.get("razon_social")
                or boleta.get("Razon social")
                or ""
            )
            if not repartidor:
                continue
            if repartidor not in mapping:
                mapping[repartidor] = set()
            if razon:
                mapping[repartidor].add(razon)

        results: List[Dict[str, Any]] = []

        if rol == "1":
            # Admin: devolver todos
            for r, razones in mapping.items():
                results.append({"repartidor": r, "razones_sociales": list(razones)})
            return results[skip: skip + limit]

        # No admin: intentar filtrar por el usuario autenticado
        if not username:
            raise HTTPException(status_code=400, detail="No se pudo obtener el nombre de usuario.")

        for r, razones in mapping.items():
            try:
                ratio = fuzz.token_set_ratio(username, r)
            except Exception:
                ratio = 0
            if ratio > 80:
                results.append({"repartidor": r, "razones_sociales": list(razones)})

        return results[skip: skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al listar repartidores: {e}")


def build_imprimible_html(boleta: Dict[str, Any], afip_result: Optional[Dict[str, Any]] = None) -> str:
    """Construye un HTML imprimible a partir de una boleta (dict).
    Escapa campos y parsea raw_response si está presente para obtener CAE u otros datos.
    """
    # Extraer campos con múltiples aliases
    fecha = boleta.get('fecha_comprobante') or boleta.get('created_at') or boleta.get('Fecha') or boleta.get('fecha') or ''
    nro = boleta.get('Nro Comprobante') or boleta.get('numero_comprobante') or boleta.get('numero') or ''
    razon = boleta.get('Razon Social') or boleta.get('razon_social') or boleta.get('Cliente') or boleta.get('cliente') or ''
    total = boleta.get('importe_total') or boleta.get('total') or boleta.get('INGRESOS') or ''
    ingreso = boleta.get('ingreso_id') or boleta.get('ID Ingresos') or boleta.get('id') or ''

    # intentar obtener CAE y QR desde afip_result o raw_response
    cae = ''
    qr_data_url = None
    if afip_result:
        try:
            caer = afip_result.get('cae') or afip_result.get('CAE') or ''
            cae = caer
        except Exception:
            cae = ''
        # qr puede estar en 'qr_code' o 'qr_url_afip'
        qr_data_url = afip_result.get('qr_code') or afip_result.get('qr_url_afip')
    else:
        raw = boleta.get('raw_response') or boleta.get('raw') or ''
        if raw:
            try:
                if isinstance(raw, (str, bytes)):
                    parsed = json.loads(raw)
                elif isinstance(raw, dict):
                    parsed = raw
                else:
                    parsed = {}
                cae = parsed.get('cae') or parsed.get('CAE') or ''
            except Exception:
                cae = ''

    # Escapar valores para incluir en HTML
    def esc(v: Any) -> str:
        return _html.escape(str(v)) if v is not None else ''

    qr_html = ''
    if qr_data_url:
        # si qr_data_url es una URL normal (no data:), mostrar link tambien
        if str(qr_data_url).startswith('data:'):
            qr_html = f"<div style='margin-top:12px'><img src='{_html.escape(str(qr_data_url))}' alt='QR' style='max-width:220px'/></div>"
        else:
            qr_html = f"<div style='margin-top:12px'><a href='{_html.escape(str(qr_data_url))}' target='_blank' rel='noopener noreferrer'>Ver QR</a></div>"

    html = f"""<!doctype html>
<html>
<head>
  <meta charset='utf-8'/>
  <title>Comprobante {esc(nro)}</title>
  <style>
    body {{ font-family: Arial, Helvetica, sans-serif; padding:20px; color:#111 }}
    .card {{ border:1px solid #ddd; padding:18px; max-width:720px; margin:0 auto }}
    .header {{ display:flex; justify-content:space-between; align-items:center }}
    .lines {{ margin-top:12px }}
    .lines div {{ margin-bottom:8px }}
    .small {{ color:#666; font-size:0.9em }}
    pre {{ white-space:pre-wrap; background:#f8f8f8; padding:8px; border-radius:6px }}
  </style>
</head>
<body>
  <div class='card'>
    <div class='header'>
      <div>
        <h2>Comprobante {esc(nro)}</h2>
        <div class='small'>Fecha: {esc(fecha)}</div>
      </div>
    </div>
        <div class='lines'>
      <div><strong>Razón social:</strong> {esc(razon)}</div>
      <div><strong>Importe:</strong> {esc(total)}</div>
            <div><strong>CAE:</strong> {esc(cae)}</div>
      <div><strong>Ingreso ID:</strong> {esc(ingreso)}</div>
    </div>
        {qr_html}
        <hr />
        <pre>{_html.escape(json.dumps(boleta.get('raw_response') or {}, indent=2, ensure_ascii=False))}</pre>
  </div>
</body>
</html>
"""
    return html


@router.get("/{ingreso_id}/imprimir-html")
def imprimir_html_por_ingreso(
    ingreso_id: str,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)
):
    """Devuelve un HTML imprimible para la boleta identificada por `ingreso_id`.
    Busca en los ingresos cargados por `TablasHandler` y, si no lo encuentra, devuelve 404.
    """
    try:
        todas = handler.cargar_ingresos()
        target = None
        for b in todas:
            # comparar varias claves posibles
            candidates = [b.get('ID Ingresos'), b.get('ingreso_id'), b.get('id'), b.get('ID')]
            for c in candidates:
                if c is None:
                    continue
                try:
                    if str(c) == str(ingreso_id):
                        target = b
                        break
                except Exception:
                    continue
            if target:
                break

        if not target:
            raise HTTPException(status_code=404, detail='No se encontró la boleta con ese ingreso_id')

        html = build_imprimible_html(target)
        return Response(content=html, media_type='text/html')

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar el HTML imprimible: {e}")


@router.post("/{ingreso_id}/facturar-e-imprimir")
def facturar_e_imprimir(
    ingreso_id: str,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)
):
    """Intentar facturar la boleta identificada por ingreso_id y devolver el HTML imprimible con QR si se generó.
    Este endpoint orquesta la facturación (invocando `process_invoice_batch_for_endpoint`) y luego devuelve el HTML.
    """
    try:
        todas = handler.cargar_ingresos()
        target = None
        for b in todas:
            candidates = [b.get('ID Ingresos'), b.get('ingreso_id'), b.get('id'), b.get('ID')]
            for c in candidates:
                if c is None:
                    continue
                try:
                    if str(c) == str(ingreso_id):
                        target = b
                        break
                except Exception:
                    continue
            if target:
                break

        if not target:
            raise HTTPException(status_code=404, detail='No se encontró la boleta con ese ingreso_id')

        # Armar payload mínimo para facturar
        try:
            total_raw = target.get('importe_total') or target.get('total') or target.get('INGRESOS')
            if total_raw is None:
                raise HTTPException(status_code=400, detail='No se encontró el total para facturar en la boleta')
            total = float(total_raw)
        except ValueError:
            raise HTTPException(status_code=400, detail='El campo total no es numérico')

        cliente_data = {
            'cuit_o_dni': str(target.get('nro_doc_receptor') or target.get('nro_doc') or target.get('documento') or '0'),
            'nombre_razon_social': str(target.get('Razon Social') or target.get('razon_social') or target.get('cliente') or target.get('nombre') or ''),
            'domicilio': target.get('domicilio') or None,
            'condicion_iva': target.get('condicion_iva') or 'CONSUMIDOR_FINAL'
        }

        payload = [{
            'id': str(ingreso_id),
            'total': total,
            'cliente_data': cliente_data
        }]

        # Ejecutar facturación (lote de 1)
        results = process_invoice_batch_for_endpoint(invoices_payload=payload, max_workers=1)
        if not results or not isinstance(results, list):
            raise HTTPException(status_code=500, detail='La facturación no devolvió resultados válidos')

        res0 = results[0]
        status = res0.get('status')
        afip_result = res0.get('result') if status == 'SUCCESS' else None

        # Construir HTML incluyendo la info de afip_result (si existe)
        html = build_imprimible_html(target, afip_result=afip_result)
        return Response(content=html, media_type='text/html')

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al facturar e imprimir: {e}")
