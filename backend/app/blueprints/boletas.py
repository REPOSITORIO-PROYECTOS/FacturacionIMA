from fastapi import APIRouter, Depends, HTTPException, Response, Request
from datetime import datetime
from typing import Any, Dict, List, Optional, DefaultDict, Set
from pydantic import BaseModel
from backend.sqlite_security import obtener_usuario_actual_sqlite
from backend.utils.mysql_handler import get_db_connection
from backend.utils.tablasHandler import TablasHandler
from thefuzz import fuzz  # type: ignore
import json
import html as _html
from backend.utils.billige_manage import process_invoice_batch_for_endpoint
import os

router = APIRouter(prefix="/boletas")


def _is_admin(usuario_actual: dict) -> bool:
    """Determina si el usuario es admin normalizando el rol_id (puede venir como int o str).
    Rol admin es id=1 en la tabla SQLite.
    """
    try:
        rid = usuario_actual.get("rol_id")
        if rid is None:
            return False
        # Normalizar a entero si es posible
        if isinstance(rid, str):
            rid = rid.strip()
            if rid.isdigit():
                rid_int = int(rid)
            else:
                return False
        else:
            rid_int = int(rid)
        return rid_int == 1
    except Exception:
        return False

# Endpoint universal para /boletas?tipo=...
@router.get("")
async def obtener_boletas_tipo(request: Request, tipo: Optional[str] = None, skip: int = 0, limit: int = 20, usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)):
    """
    Endpoint universal para /boletas?tipo=... que redirige a la lógica correspondiente.
    """
    try:
        if tipo == "facturadas":
            # Usar la función existente para facturadas
            conn = None
            cursor = None
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
                    if cursor is not None:
                        try:
                            cursor.close()
                        except Exception:
                            pass
                    conn.close()
        elif tipo == "no-facturadas":
            todas_las_boletas = handler.cargar_ingresos()
            # Filtrar por estado 'falta facturar' (tolerante a mayúsculas / espacios)
            boletas_filtradas = []
            for bo in todas_las_boletas:
                estado_fact = str(bo.get("facturacion", "")).strip().lower()
                if estado_fact == "falta facturar" or (
                    "falta" in estado_fact and "facturar" in estado_fact
                ):
                    boletas_filtradas.append(bo)

            if not _is_admin(usuario_actual):
                username = usuario_actual.get("nombre_usuario", "")
                if username:
                    username_l = username.lower()
                    resultado = []
                    for bo in boletas_filtradas:
                        repartidor = (bo.get('Repartidor') or bo.get('repartidor') or '')
                        if not repartidor:
                            continue
                        try:
                            ratio = 0
                            try:
                                ratio = fuzz.token_set_ratio(username, repartidor)
                            except Exception:
                                ratio = 0
                            if ratio > 80 or repartidor.strip().lower() == username_l:
                                resultado.append(bo)
                        except Exception:
                            continue
                    return resultado[skip: skip + limit]
            return boletas_filtradas[skip: skip + limit]
        else:
            # Si no se reconoce el tipo, devolver error
            raise HTTPException(status_code=400, detail="Parámetro 'tipo' inválido o no soportado.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al obtener boletas: {e}")

handler = TablasHandler() 

@router.get("/obtener-todas", response_model=List[Dict[str, Any]])
def traer_todas_las_boletas(skip: int = 0, limit: int = 20):

    try:
        todas_las_boletas = handler.cargar_ingresos()

        return todas_las_boletas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar todas las boletas: {e}")



@router.get("/obtener-no-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_no_facturadas(
    skip: int = 0,
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)
):
    """Devuelve boletas que faltan facturar. Si el usuario no es admin, se filtra
    por repartidor asociado al usuario (fuzzy match o comparación case-insensitive).
    """
    try:
        todas_las_boletas = handler.cargar_ingresos()
        boletas_filtradas = []
        for bo in todas_las_boletas:
            estado_fact = str(bo.get("facturacion", "")).strip().lower()
            if estado_fact == "falta facturar" or ("falta" in estado_fact and "facturar" in estado_fact):
                boletas_filtradas.append(bo)

        if not _is_admin(usuario_actual):
            username = usuario_actual.get("nombre_usuario", "")
            if username:
                username_l = username.lower()
                resultado = []
                for bo in boletas_filtradas:
                    repartidor = (bo.get('Repartidor') or bo.get('repartidor') or '')
                    if not repartidor:
                        continue
                    try:
                        ratio = 0
                        try:
                            ratio = fuzz.token_set_ratio(username, repartidor)
                        except Exception:
                            ratio = 0
                        if ratio > 80 or repartidor.strip().lower() == username_l:
                            resultado.append(bo)
                    except Exception:
                        continue
                return resultado[skip: skip + limit]

        return boletas_filtradas[skip: skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar boletas no facturadas: {e}")


@router.get("/obtener-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_facturadas_desde_db(skip: int = 0, limit: int = 20):

    conn = None
    cursor = None
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
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
            conn.close()


@router.get("/obtener-por-repartidor", response_model=List[Dict[str, Any]])
def traer_todas_por_repartidor(
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite) 
):
    try:

        username = usuario_actual.get("nombre_usuario", "")
        if _is_admin(usuario_actual):   # si es admin le mando todas
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
        if _is_admin(usuario_actual):
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
        if _is_admin(usuario_actual):
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

        if _is_admin(usuario_actual):
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


@router.get("/debug/no-facturadas")
def debug_no_facturadas(usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)):
    """Endpoint de diagnóstico: muestra conteos y ejemplos de estados de facturación.
    No dejar en producción permanente; usar para verificar por qué front no recibe datos.
    """
    try:
        todas = handler.cargar_ingresos()
        estados = []
        no_fact = []
        for b in todas:
            estado_fact = str(b.get("facturacion", "")).strip().lower()
            if estado_fact:
                estados.append(estado_fact)
            if estado_fact == "falta facturar" or ("falta" in estado_fact and "facturar" in estado_fact):
                no_fact.append(b)
        # Contar ocurrencias de cada estado
        from collections import Counter
        top_estados = Counter(estados).most_common(20)
        return {
            "total_boletas": len(todas),
            "total_no_facturadas_detectadas": len(no_fact),
            "primeros_estados": top_estados,
            "muestra_no_facturadas": no_fact[:5],
            "es_admin": _is_admin(usuario_actual)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error debug no-facturadas: {e}")


@router.get("/resumen-no-facturadas")
def resumen_no_facturadas(usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)):
    """Devuelve un resumen agrupado de boletas 'falta facturar'.
    Estructura:
    {
      total_boletas: int,
      total_repartidores: int,
      repartidores: [ { repartidor, cantidad, ids, razones_sociales } ]
    }
    - Admin ve todo.
    - No admin: sólo su repartidor (fuzzy) como en la lógica previa.
    """
    try:
        todas = handler.cargar_ingresos()
        # Filtrar no facturadas
        no_fact = []
        for b in todas:
            estado_fact = str(b.get("facturacion", "")).strip().lower()
            if estado_fact == "falta facturar" or ("falta" in estado_fact and "facturar" in estado_fact):
                no_fact.append(b)

        es_admin = _is_admin(usuario_actual)
        username = usuario_actual.get("nombre_usuario", "") if not es_admin else ""
        username_l = username.lower()

        from collections import defaultdict
        ids_map: Dict[str, List[str]] = defaultdict(list)
        razones_map: Dict[str, Set[str]] = defaultdict(set)

        for b in no_fact:
            repart = b.get('Repartidor') or b.get('repartidor') or ''
            if not repart:
                continue
            # Filtrar para no admin
            if not es_admin:
                try:
                    ratio = 0
                    try:
                        ratio = fuzz.token_set_ratio(username, repart)
                    except Exception:
                        ratio = 0
                    if ratio <= 80 and repart.strip().lower() != username_l:
                        continue
                except Exception:
                    continue
            rid = str(b.get('ID Ingresos') or b.get('ingreso_id') or b.get('id') or '')
            if rid:
                ids_map[repart].append(rid)
            razon = b.get('Razon Social') or b.get('razon_social') or b.get('Cliente') or b.get('cliente') or ''
            if razon:
                razones_map[repart].add(str(razon))

        respuesta = []
        all_reparts = set(list(ids_map.keys()) + list(razones_map.keys()))
        for repart in all_reparts:
            ids = ids_map.get(repart, [])
            razones = list(razones_map.get(repart, []))
            respuesta.append({
                "repartidor": repart,
                "cantidad": len(ids),
                "ids": ids,
                "razones_sociales": razones
            })
        respuesta.sort(key=lambda x: x["repartidor"].lower())
        return {
            "total_boletas": len(no_fact) if es_admin else sum(r["cantidad"] for r in respuesta),
            "total_repartidores": len(respuesta),
            "repartidores": respuesta,
            "es_admin": es_admin
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en resumen no-facturadas: {e}")


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

    # qr_html: si existe el contenido de QR lo representamos; sino queda vacío
    qr_html = ''
    if qr_data_url:
        if str(qr_data_url).startswith('data:'):
            qr_html = f"<div style='margin-top:12px'><img src='{_html.escape(str(qr_data_url))}' alt='QR' style='max-width:220px'/></div>"
        else:
            qr_html = f"<div style='margin-top:12px'><a href='{_html.escape(str(qr_data_url))}' target='_blank' rel='noopener noreferrer'>Ver QR</a></div>"

    # Emisor: intentar leer del diccionario o caer en variables de entorno
    emisor_cuit = boleta.get('emisor_cuit') or boleta.get('CUIT') or os.environ.get('EMISOR_CUIT', '')
    emisor_razon = boleta.get('emisor_razon_social') or boleta.get('Emisor') or os.environ.get('EMISOR_RAZON_SOCIAL', '')
    emisor_domicilio = boleta.get('emisor_domicilio') or boleta.get('domicilio_emisor') or os.environ.get('EMISOR_DOMICILIO', '')
    emisor_iva = boleta.get('emisor_condicion_iva') or os.environ.get('EMISOR_CONDICION_IVA', '')

    # Comprobante: tipo y fechas (si vienen en otros campos, incluirlos)
    tipo_comprobante = boleta.get('tipo_comprobante') or boleta.get('Tipo') or boleta.get('tipo') or ''
    nro_comprobante = nro
    fecha_emision = fecha

    # Receptor / cliente
    receptor_nombre = boleta.get('cliente') or boleta.get('nombre') or boleta.get('razon_social') or ''
    receptor_doc = boleta.get('cuit') or boleta.get('nro_doc_receptor') or boleta.get('documento') or ''
    receptor_iva = boleta.get('condicion_iva') or ''

    # Items: buscar una lista en boleta['items'] o boleta['detalle'] (si existe)
    items = boleta.get('items') or boleta.get('detalle') or []

    # Leyendas obligatorias
    leyendas = []
    leyendas.append('Comprobante autorizado por AFIP')
    # Añadir información del régimen si se tiene
    regimen = boleta.get('regimen_emision') or boleta.get('regimen') or 'Factura Electrónica'
    leyendas.append(regimen)

    # Preparar tabla de items (si hay list)
    items_html = ''
    if isinstance(items, list) and len(items) > 0:
        rows = []
        for it in items:
            desc = _html.escape(str(it.get('descripcion') or it.get('descripcion_producto') or it.get('detalle') or ''))
            qty = _html.escape(str(it.get('cantidad') or it.get('qty') or ''))
            price = _html.escape(str(it.get('precio_unitario') or it.get('precio') or it.get('unit_price') or ''))
            subtotal = _html.escape(str(it.get('subtotal') or it.get('importe') or ''))
            rows.append(f"<tr><td>{desc}</td><td style='text-align:right'>{qty}</td><td style='text-align:right'>{price}</td><td style='text-align:right'>{subtotal}</td></tr>")
        items_html = f"<table style='width:100%; border-collapse:collapse; margin-top:8px'><thead><tr><th style='text-align:left'>Descripción</th><th style='text-align:right'>Cant.</th><th style='text-align:right'>P.Unit</th><th style='text-align:right'>Subtotal</th></tr></thead><tbody>{''.join(rows)}</tbody></table>"
    else:
        detalle_text = _html.escape(str(boleta.get('descripcion') or boleta.get('detalle_text') or boleta.get('detalle') or ''))
        if detalle_text:
            items_html = f"<div style='margin-top:8px'>{detalle_text}</div>"

    cae_vto = ''
    if afip_result:
        try:
            cae_vto = afip_result.get('cae_vto') or afip_result.get('cae_vencimiento') or ''
        except Exception:
            cae_vto = ''

    # Construir HTML con layout más cercano a un ticket
    html = f"""<!doctype html>
<html>
<head>
    <meta charset='utf-8'/>
    <title>Comprobante {esc(nro_comprobante)}</title>
    <style>
        body {{ font-family: Arial, Helvetica, sans-serif; padding:8px; color:#111; font-size:12px }}
        .card {{ border:0; padding:0; max-width:320px; margin:0 auto }}
        .header {{ text-align:center }}
        .small {{ color:#666; font-size:0.9em }}
        .meta {{ margin-top:8px; font-size:11px }}
        .totals {{ margin-top:10px; font-weight:bold }}
        table.items td, table.items th {{ border-bottom:1px solid #eee; padding:4px 0 }}
        .qr {{ margin-top:10px; text-align:center }}
        .leyendas {{ margin-top:8px; font-size:10px; color:#333 }}
        pre {{ white-space:pre-wrap; background:#f8f8f8; padding:8px; border-radius:6px; font-size:10px }}
    </style>
</head>
<body>
    <div class='card'>
        <div class='header'>
            <div style='font-weight:bold'>{_html.escape(str(emisor_razon))}</div>
            <div class='small'>CUIT: {_html.escape(str(emisor_cuit))} · { _html.escape(str(emisor_iva)) }</div>
            <div class='small'>{_html.escape(str(emisor_domicilio))}</div>
            <hr/>
            <h3>Comprobante {esc(tipo_comprobante)} {esc(nro_comprobante)}</h3>
            <div class='small'>Fecha: {esc(fecha_emision)}</div>
        </div>

        <div class='meta'>
            <div><strong>Receptor:</strong> { _html.escape(str(receptor_nombre)) }</div>
            <div class='small'>Doc: { _html.escape(str(receptor_doc)) } · Cond. IVA: { _html.escape(str(receptor_iva)) }</div>
        </div>

        {items_html}

        <div class='totals'>
            <div>Total: {esc(total)}</div>
            <div class='small'>CAE: {esc(cae)} { ('(Vto: ' + _html.escape(str(cae_vto)) + ')') if cae_vto else '' }</div>
        </div>

        <div class='qr'>
            {qr_html}
        </div>

        <div class='leyendas'>
            { '<br/>'.join(_html.escape(l) for l in leyendas) }
        </div>

        <hr/>
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
        # Normalizar función para comparaciones tolerantes
        def norm(x: object) -> str:
            try:
                s = str(x or '')
            except Exception:
                s = ''
            return ''.join(ch.lower() for ch in s if ch.isalnum())

        nid = norm(ingreso_id)

        # 1) Intento estricto por igualdad de string
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

        # 2) Si no encontrado, intentar matching tolerante normalizado
        if not target:
            for b in todas:
                candidates = [b.get('ID Ingresos'), b.get('ingreso_id'), b.get('id'), b.get('ID')]
                for c in candidates:
                    if c is None:
                        continue
                    try:
                        if norm(c) == nid:
                            target = b
                            break
                        # Substring match (si cliente usó solo parte del id)
                        if nid and norm(c).endswith(nid):
                            target = b
                            break
                    except Exception:
                        continue
                if target:
                    break

        if not target:
            # For debugging, incluir los primeros IDs disponibles para comparar con lo que solicitó el cliente
            sample = []
            try:
                for b in todas[:10]:
                    vals = [b.get('ID Ingresos'), b.get('ingreso_id'), b.get('id'), b.get('ID')]
                    sample.append([v for v in vals if v is not None])
            except Exception:
                sample = []
            raise HTTPException(status_code=404, detail={'msg': 'No se encontró la boleta con ese ingreso_id', 'requested': ingreso_id, 'candidates_sample': sample})

        # Este endpoint deja la generación de HTML básica; la conversión a imagen
        # y la facturación+impresión quedan centralizadas en el blueprint 'impresion'.
        # Para compatibilidad, devolvemos un HTML mínimo con los datos principales.
        simple_html = f"<html><body><h1>Comprobante {_html.escape(str(target.get('Nro Comprobante') or ''))}</h1><div>Fecha: {_html.escape(str(target.get('Fecha') or target.get('fecha') or ''))}</div></body></html>"
        return Response(content=simple_html, media_type='text/html')

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar el HTML imprimible: {e}")


@router.post('/imprimir/{ingreso_id}')
def imprimir_html_por_ingreso_post(
    ingreso_id: str,
    usuario_actual: dict = Depends(obtener_usuario_actual_sqlite)
):
    """Compatibilidad con frontend: POST /api/boletas/imprimir/{ingreso_id}
    Devuelve el mismo HTML imprimible que el endpoint GET /{ingreso_id}/imprimir-html.
    """
    try:
        return imprimir_html_por_ingreso(ingreso_id, usuario_actual)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
