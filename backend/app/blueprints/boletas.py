from fastapi import APIRouter, Depends, HTTPException, Response, Request, Query
from datetime import datetime
from typing import Any, Dict, List, Optional, DefaultDict, Set
from pydantic import BaseModel
from backend.security import obtener_usuario_actual  # migrado desde sqlite_security
from backend.utils.mysql_handler import get_db_connection
from backend.utils.tablasHandler import TablasHandler
from thefuzz import fuzz  # type: ignore
import json
import html as _html
from backend.utils.billige_manage import process_invoice_batch_for_endpoint
import os
import logging
from io import BytesIO
from backend.utils import afip_tools_manager  # nuevo para debug credenciales
from backend.utils.receptor_fields import extraer_receptor_fields
from backend.utils.afipTools import _resolve_afip_credentials, preflight_afip_credentials  # type: ignore
from backend.utils.afipTools import generar_factura_para_venta, ReceptorData  # para test de contrato
from backend.modelos import ConfiguracionEmpresa, Empresa, Usuario
try:
    from weasyprint import HTML  # type: ignore
    from PIL import Image  # type: ignore
except Exception:
    HTML = None  # type: ignore
    Image = None  # type: ignore

import locale

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/boletas")


def _is_admin(user) -> bool:
    """Determina si el usuario tiene rol administrativo.

    Considera administrativos: Admin, Soporte.
    Evita dependencia de IDs (más flexible para futuras migraciones).
    """
    try:
        nombre_rol = getattr(getattr(user, 'rol', None), 'nombre', None)
        return bool(nombre_rol in ("Admin", "Soporte"))
    except Exception:
        return False

def _get_username(user) -> str:
    return (
        getattr(user, 'nombre_usuario', None)
        or getattr(user, 'username', None)
        or getattr(user, 'email', None)
        or ''
    )

def _get_handler_for_user(user) -> TablasHandler:
    """Obtiene el handler de boletas para la empresa del usuario."""
    from backend.database import get_db
    from sqlmodel import select
    
    try:
        db = next(get_db())
        # Obtener la configuración de la empresa del usuario
        configuracion = db.exec(
            select(ConfiguracionEmpresa).where(ConfiguracionEmpresa.id_empresa == user.id_empresa)
        ).first()
        
        # Extraer el ID del Google Sheet del enlace (si es un enlace completo)
        google_sheet_id = None
        if configuracion and configuracion.link_google_sheets:
            link = configuracion.link_google_sheets.strip()
            # Si es un enlace completo, extraer el ID
            if '/d/' in link and '/edit' in link:
                google_sheet_id = link.split('/d/')[1].split('/')[0]
            else:
                # Asumir que es directamente el ID
                google_sheet_id = link
        
        return TablasHandler(google_sheet_id=google_sheet_id)
    except Exception as e:
        print(f"Error obteniendo handler para usuario {user.nombre_usuario}: {e}")
        # Fallback al handler global
        return TablasHandler()

from backend.app.blueprints.sheets_boletas import _sync_sheets_to_db

@router.post("/sincronizar-sheets")
async def sincronizar_boletas_endpoint(usuario_actual = Depends(obtener_usuario_actual)):
    """
    Fuerza actualización síncrona DB <-> Sheets.
    Endpoint espejo de /sheets/sincronizar para evitar problemas de enrutamiento 404.
    """
    try:
        # Ejecutar sync en el hilo principal (bloqueante pero seguro)
        _sync_sheets_to_db()
        
        # Contar total para devolver feedback
        from backend.database import SessionLocal
        from backend.modelos import IngresoSheets
        db = SessionLocal()
        total = db.query(IngresoSheets).count()
        db.close()
        
        return {
            "success": True,
            "message": "Sincronización exitosa con Base de Datos (vía boletas)",
            "total_boletas": total,
            "timestamp": str(datetime.now())
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sincronizando: {str(e)}")

@router.get("")
async def obtener_boletas_tipo(request: Request, tipo: Optional[str] = None, skip: int = 0, limit: int = 20, ver_todas: bool = False, usuario_actual = Depends(obtener_usuario_actual)):
    """
    Endpoint universal para /boletas?tipo=... que redirige a la lógica correspondiente.
    """
    try:
        if tipo == "facturadas":
            # Usar la función existente para facturadas
            conn = None
            cursor = None
            try:
                # Obtener CUIT de la empresa del usuario
                from backend.database import SessionLocal
                from backend.modelos import Empresa
                
                db = SessionLocal()
                cuit_empresa = None
                try:
                    empresa = db.get(Empresa, usuario_actual.id_empresa)
                    if empresa:
                        cuit_empresa = empresa.cuit
                finally:
                    db.close()

                conn = get_db_connection()
                if not conn:
                    raise HTTPException(status_code=503, detail="No se pudo establecer conexión con la base de datos.")
                cursor = conn.cursor(dictionary=True)
                
                # Filtrar por CUIT de la empresa
                query = """
                    SELECT * 
                    FROM facturas_electronicas 
                    WHERE cuit_emisor = %s
                    ORDER BY id DESC 
                    LIMIT %s OFFSET %s
                """
                cursor.execute(query, (cuit_empresa, limit, skip))
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
            handler = _get_handler_for_user(usuario_actual)
            todas_las_boletas = handler.cargar_ingresos()
            # Filtrar por estado 'falta facturar' (tolerante a mayúsculas / espacios)
            boletas_filtradas = []
            for bo in todas_las_boletas:
                estado_fact = str(bo.get("facturacion", "")).strip().lower()
                if estado_fact == "falta facturar" or (
                    "falta" in estado_fact and "facturar" in estado_fact
                ):
                    boletas_filtradas.append(bo)

            def _fecha_key(b: Dict[str, Any]) -> int:
                try:
                    raw = str(b.get('Fecha') or b.get('fecha') or b.get('FECHA') or '')
                    base = raw.strip().split(' ')[0].split('T')[0]
                    if base and len(base) == 10 and base[4] == '-' and base[7] == '-':
                        from datetime import datetime as _dt
                        return int(_dt.strptime(base, '%Y-%m-%d').strftime('%Y%m%d'))
                    if base and len(base) == 10 and base[2] == '/' and base[5] == '/':
                        from datetime import datetime as _dt
                        return int(_dt.strptime(base, '%d/%m/%Y').strftime('%Y%m%d'))
                except Exception:
                    return 0
                return 0
            boletas_filtradas.sort(key=_fecha_key, reverse=True)

            if not _is_admin(usuario_actual) and not ver_todas:
                username = _get_username(usuario_actual)
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
    ver_todas: bool = False,
    usuario_actual = Depends(obtener_usuario_actual)
):
    """Devuelve boletas que faltan facturar. Si el usuario no es admin, se filtra
    por repartidor asociado al usuario (fuzzy match o comparación case-insensitive).
    """
    try:
        handler = _get_handler_for_user(usuario_actual)
        todas_las_boletas = handler.cargar_ingresos()
        boletas_filtradas = []
        for bo in todas_las_boletas:
            estado_fact = str(bo.get("facturacion", "")).strip().lower()
            if estado_fact == "falta facturar" or ("falta" in estado_fact and "facturar" in estado_fact):
                boletas_filtradas.append(bo)

        if not _is_admin(usuario_actual) and not ver_todas:
            username = _get_username(usuario_actual)
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

        return boletas_filtradas[skip : skip + limit]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar boletas no facturadas: {e}")


@router.get("/obtener-facturadas", response_model=List[Dict[str, Any]])
def traer_boletas_facturadas_desde_db(
    skip: int = 0, 
    limit: int = 20,
    usuario_actual: Usuario = Depends(obtener_usuario_actual)
):

    conn = None
    cursor = None
    try:
        cuit_empresa = None
        from backend.database import SessionLocal
        with SessionLocal() as db_session:
            empresa = db_session.get(Empresa, usuario_actual.id_empresa)
            if empresa:
                cuit_empresa = empresa.cuit

        if not cuit_empresa:
            logger.warning(
                f"Usuario {usuario_actual.nombre_usuario} (Empresa {usuario_actual.id_empresa}) no tiene CUIT configurado."
            )
            return []

        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="No se pudo establecer conexión con la base de datos.")
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT * 
            FROM facturas_electronicas 
            WHERE cuit_emisor = %s
            ORDER BY id DESC 
            LIMIT %s OFFSET %s
        """

        cursor.execute(query, (cuit_empresa, limit, skip))
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
    usuario_actual = Depends(obtener_usuario_actual) 
):
    try:
        username = _get_username(usuario_actual)
        if _is_admin(usuario_actual):   # si es admin le mando todas
            try:
                handler = _get_handler_for_user(usuario_actual)
                todas_las_boletas = handler.cargar_ingresos()

                return todas_las_boletas[skip : skip + limit]

            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error inesperado al cargar todas las boletas: {e}")


        if not username:
            raise HTTPException(status_code=400, detail="No se pudo obtener el nombre de usuario.")

        handler = _get_handler_for_user(usuario_actual)
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
    usuario_actual = Depends(obtener_usuario_actual) 
):
    try:
        if _is_admin(usuario_actual):
            try:
                handler = _get_handler_for_user(usuario_actual)
                todas_las_boletas = handler.cargar_ingresos()
                return todas_las_boletas[skip : skip + limit]
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Ocurrió un error al cargar todas las boletas para el admin: {e}")

        razon_social_buscada = request_data.razon_social
        if not razon_social_buscada:
            raise HTTPException(status_code=400, detail="La razón social no puede estar vacía.")

        handler = _get_handler_for_user(usuario_actual)
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
    usuario_actual = Depends(obtener_usuario_actual) 
):
    try:
        if _is_admin(usuario_actual):
            try:
                handler = _get_handler_for_user(usuario_actual)
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

        handler = _get_handler_for_user(usuario_actual)
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
    usuario_actual = Depends(obtener_usuario_actual)
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
        # Aseguramos obtener el nombre de usuario sin asumir que es un dict
        username = _get_username(usuario_actual)
        handler = _get_handler_for_user(usuario_actual)
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
def debug_no_facturadas(usuario_actual = Depends(obtener_usuario_actual)):
    """Endpoint de diagnóstico: muestra conteos y ejemplos de estados de facturación.
    No dejar en producción permanente; usar para verificar por qué front no recibe datos.
    """
    try:
        handler = _get_handler_for_user(usuario_actual)
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
def resumen_no_facturadas(usuario_actual = Depends(obtener_usuario_actual)):
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
        handler = _get_handler_for_user(usuario_actual)
        todas = handler.cargar_ingresos()
        # Filtrar no facturadas
        no_fact = []
        for b in todas:
            estado_fact = str(b.get("facturacion", "")).strip().lower()
            if estado_fact == "falta facturar" or ("falta" in estado_fact and "facturar" in estado_fact):
                no_fact.append(b)

        es_admin = _is_admin(usuario_actual)
        username = _get_username(usuario_actual) if not es_admin else ""
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
    # Configurar locale para formato argentino (coma decimal, punto miles)
    try:
        locale.setlocale(locale.LC_NUMERIC, 'es_AR.UTF-8')
    except locale.Error:
        try:
            locale.setlocale(locale.LC_NUMERIC, 'es_AR')
        except locale.Error:
            # Fallback sin locale
            pass

    # Función para formatear números
    def format_number(value):
        if isinstance(value, (int, float)):
            # Formato argentino: punto miles, coma decimal
            s = "{:.2f}".format(value).replace('.', ',')
            if ',' in s:
                int_part, dec_part = s.split(',')
            else:
                int_part = s
                dec_part = '00'
            # Agregar puntos cada 3 dígitos en la parte entera
            rev = int_part[::-1]
            with_dots = '.'.join([rev[i:i+3] for i in range(0, len(rev), 3)])
            final_int = with_dots[::-1]
            return final_int + ',' + dec_part
        return str(value)

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

    # Emisor: primero boleta, luego env, luego intentar leer configuración de bóveda si tenemos CUIT.
    emisor_cuit = boleta.get('emisor_cuit') or boleta.get('CUIT') or os.environ.get('AFIP_CUIT') or os.environ.get('EMISOR_CUIT', '')
    emisor_razon = boleta.get('emisor_razon_social') or boleta.get('Emisor') or os.environ.get('EMISOR_RAZON_SOCIAL', '')
    emisor_domicilio = boleta.get('emisor_domicilio') or boleta.get('domicilio_emisor') or os.environ.get('EMISOR_DOMICILIO', '')
    emisor_iva = boleta.get('emisor_condicion_iva') or os.environ.get('EMISOR_CONDICION_IVA', os.environ.get('AFIP_COND_EMISOR', ''))
    try:
        # Si falta razón social o domicilio, intentar cargar config de emisor desde bóveda
        if (not emisor_razon or not emisor_domicilio) and emisor_cuit:
            from backend.utils import afip_tools_manager  # import local para no romper carga si falta
            cfg = afip_tools_manager.obtener_configuracion_emisor(str(emisor_cuit))
            if cfg and cfg.get('existe'):
                if not emisor_razon:
                    emisor_razon = cfg.get('razon_social') or cfg.get('nombre_fantasia') or emisor_razon
                if not emisor_domicilio:
                    emisor_domicilio = cfg.get('direccion') or emisor_domicilio
                # Punto de venta potencialmente útil si no viene en afip_result
                if afip_result and not afip_result.get('punto_venta') and cfg.get('punto_venta'):
                    afip_result['punto_venta'] = cfg.get('punto_venta')
    except Exception:
        pass

    # Comprobante: tipo y fechas (si vienen en otros campos, incluirlos)
    tipo_comprobante = (afip_result.get('tipo_comprobante') if afip_result else None) or boleta.get('tipo_comprobante') or boleta.get('Tipo') or boleta.get('tipo') or ''
    nro_comprobante = (afip_result.get('numero_comprobante') if afip_result else None) or nro
    punto_venta = (afip_result.get('punto_venta') if afip_result else None) or os.environ.get('AFIP_PUNTO_VENTA') or ''

    # Normalizar a int donde sea posible
    try:
        tipo_int = int(tipo_comprobante)
    except Exception:
        tipo_int = None
    try:
        nro_int = int(nro_comprobante)
    except Exception:
        nro_int = None
    try:
        pv_int = int(punto_venta)
    except Exception:
        pv_int = None

    tipo_labels = {1: 'Factura A', 6: 'Factura B', 11: 'Factura C'}
    tipo_label = tipo_labels.get(tipo_int, f"Comprobante {esc(tipo_comprobante)}") if tipo_int is not None else f"Comprobante {esc(tipo_comprobante)}"
    nro_fmt = f"{nro_int:08d}" if nro_int is not None else esc(nro_comprobante)
    pv_fmt = f"{pv_int:04d}" if pv_int is not None else esc(punto_venta)
    encabezado_linea2 = f"Pto Vta {pv_fmt} - Nº {nro_fmt}" if (pv_fmt and nro_fmt) else f"Nº {nro_fmt}" if nro_fmt else ''
    fecha_emision = fecha

    receptor_nombre, receptor_doc, receptor_iva = extraer_receptor_fields(boleta, afip_result)

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

    # Anotación de mismatch si existe
    mismatch_html = ''
    try:
        tipo_forzado_intentado = None
        tipo_mismatch = None
        tipo_final = None
        if afip_result:
            tipo_forzado_intentado = afip_result.get('tipo_forzado_intentado') or afip_result.get('tipo_forzado')
            tipo_mismatch = afip_result.get('tipo_mismatch')
            tipo_final = afip_result.get('tipo_comprobante') or afip_result.get('tipo_afip')
        # También intentar extraer desde raw_response persistido si viene en boleta DB
        if not tipo_forzado_intentado and isinstance(boleta.get('raw_response'), dict):
            tipo_forzado_intentado = boleta['raw_response'].get('tipo_forzado_intentado')
            if tipo_mismatch is None:
                tipo_mismatch = boleta['raw_response'].get('tipo_mismatch')
        label_map = {1:'A',6:'B',11:'C'}
        if tipo_forzado_intentado is not None and (tipo_mismatch or (tipo_final and int(tipo_forzado_intentado)!=int(tipo_final))):
            solicitado_lbl = label_map.get(int(tipo_forzado_intentado), str(tipo_forzado_intentado))
            emitido_lbl = label_map.get(int(tipo_final) if tipo_final is not None else -1, str(tipo_final))
            mismatch_html = f"<div style='margin-top:6px;color:#b00;font-size:10px'><strong>Advertencia:</strong> Se solicitó Tipo {solicitado_lbl} pero se emitió {emitido_lbl}. Verifique configuración del microservicio.</div>"
    except Exception:
        mismatch_html = ''

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
            <h3 style='margin:4px 0'>{tipo_label}</h3>
            <div class='small'>{encabezado_linea2}</div>
            <div class='small'>Fecha: {esc(fecha_emision)}</div>
        </div>

        <div class='meta'>
            { f"<div><strong>Cliente Final</strong></div>" if receptor_iva.upper() == 'CONSUMIDOR_FINAL' else f"<div><strong>Receptor:</strong> { _html.escape(str(receptor_nombre)) }</div>" }
            { f"<div class='small'>Doc: { _html.escape(str(receptor_doc)) } · Cond. IVA: { _html.escape(str(receptor_iva)) }</div>" if receptor_iva.upper() != 'CONSUMIDOR_FINAL' else '' }
        </div>

        {items_html}

        <div class='totals'>
            <div>Total: {format_number(total)}</div>
            <div class='small'>CAE: {esc(cae)} { ('(Vto: ' + _html.escape(str(cae_vto)) + ')') if cae_vto else '' }</div>
            <div class='small'>CUIT Emisor: {_html.escape(str(emisor_cuit))}</div>
        </div>

        <div class='qr'>
            {qr_html}
        </div>

    {mismatch_html}
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
    usuario_actual = Depends(obtener_usuario_actual)
):
    """Devuelve un HTML imprimible para la boleta identificada por `ingreso_id`.
    Busca en los ingresos cargados por `TablasHandler` y, si no lo encuentra, devuelve 404.
    """
    try:
        handler = _get_handler_for_user(usuario_actual)
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
    usuario_actual = Depends(obtener_usuario_actual)
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


# ===================== FUNCIONES PARA GENERAR IMAGEN (PNG / JPG) =====================

def _buscar_boleta_por_ingreso(ingreso_id: str, handler: TablasHandler) -> Optional[Dict[str, Any]]:
    try:
        todas = handler.cargar_ingresos()
    except Exception:
        return None
    for b in todas:
        for c in [b.get('ID Ingresos'), b.get('ingreso_id'), b.get('id'), b.get('ID')]:
            if c is None:
                continue
            try:
                if str(c) == str(ingreso_id):
                    return b
            except Exception:
                continue
    return None


def _buscar_factura_db(ingreso_id: str) -> Optional[Dict[str, Any]]:
    try:
        conn = get_db_connection()
        if not conn:
            return None
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM facturas_electronicas WHERE ingreso_id=%s ORDER BY id DESC LIMIT 1", (str(ingreso_id),))
        row = cur.fetchone()
        cur.close(); conn.close()
        if row and isinstance(row.get('raw_response'), str):
            try:
                row['raw_response'] = json.loads(row['raw_response'])
            except Exception:
                pass
        return row
    except Exception:
        return None


def _render_ticket_image(html: str, formato: str = 'jpg') -> bytes:
    if HTML is None:
        raise RuntimeError('WeasyPrint no disponible en el entorno')
    formato_l = formato.lower()
    if formato_l not in ('jpg', 'jpeg', 'png'):
        formato_l = 'jpg'
    png_buf = BytesIO()
    HTML(string=html, base_url=os.getcwd()).write_png(png_buf)
    png_buf.seek(0)
    if formato_l == 'png' or Image is None:
        return png_buf.getvalue()
    with Image.open(png_buf) as im:
        rgb = im.convert('RGB')
        out = BytesIO()
        rgb.save(out, format='JPEG', quality=90, optimize=True)
        return out.getvalue()


def imprimir_imagen_por_ingreso(ingreso_id: str, usuario_actual, formato: str = 'jpg'):
    handler = _get_handler_for_user(usuario_actual)
    boleta = _buscar_boleta_por_ingreso(ingreso_id, handler)
    if not boleta:
        raise HTTPException(status_code=404, detail='Boleta no encontrada')
    # Autorización si no es admin
    if not _is_admin(usuario_actual):
        usuario = _get_username(usuario_actual).lower().strip()
        repart = (boleta.get('Repartidor') or boleta.get('repartidor') or '').lower().strip()
        if repart:
            try:
                ratio = fuzz.token_set_ratio(usuario, repart)
            except Exception:
                ratio = 0
            if ratio <= 80 and repart != usuario:
                raise HTTPException(status_code=403, detail='No autorizado')
    afip_row = _buscar_factura_db(ingreso_id)
    html = build_imprimible_html(boleta, afip_row)
    try:
        img_bytes = _render_ticket_image(html, formato)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error generando imagen: {e}')
    ext = 'png' if formato.lower() == 'png' else 'jpg'
    media = 'image/png' if ext == 'png' else 'image/jpeg'
    return Response(content=img_bytes, media_type=media, headers={'Content-Disposition': f'attachment; filename="comprobante_{ingreso_id}.{ext}"'})


def facturar_e_imprimir_img(ingreso_id: str, usuario_actual, formato: str = 'jpg', tipo_forzado: int | None = None, punto_venta_override: int | None = None):
    handler = _get_handler_for_user(usuario_actual)
    boleta = _buscar_boleta_por_ingreso(ingreso_id, handler)
    if not boleta:
        raise HTTPException(status_code=404, detail='Boleta no encontrada')
    
    print(f"DEBUG: Boleta encontrada para {ingreso_id}: {boleta}")
    
    afip_row = _buscar_factura_db(ingreso_id)
    if not afip_row:
        # Intento mínimo de facturación: detectar total y documento en múltiples variantes
        # 1. Total: probar campos comunes y limpiar formato ($, separadores miles, coma decimal)
        total_raw = (
            boleta.get('importe_total')
            or boleta.get('total')
            or boleta.get('Total a Pagar')
            or boleta.get('total_a_pagar')
            or boleta.get('INGRESOS')
        )
        print(f"DEBUG: total_raw obtenido: {total_raw} (tipo: {type(total_raw)})")
        
        total_float = None
        if total_raw is not None:
            try:
                # Si ya es un número (float), usarlo directamente
                if isinstance(total_raw, (int, float)):
                    total_float = float(total_raw)
                    print(f"DEBUG: total ya normalizado: {total_float}")
                else:
                    # Si es string, parsear formato argentino
                    s = str(total_raw).strip()
                    print(f"DEBUG: total_raw recibido: '{total_raw}'")  # Debug log
                    # Remover símbolo moneda y espacios
                    s = s.replace('$', '').replace(' ', '')
                    print(f"DEBUG: después de limpiar: '{s}'")  # Debug log
                    # Formato argentino: quitar puntos (separadores miles) y cambiar coma por punto decimal
                    s = s.replace('.', '').replace(',', '.')
                    print(f"DEBUG: después de parsing: '{s}'")  # Debug log
                    total_float = float(s)
                    print(f"DEBUG: total_float: {total_float}")  # Debug log
            except Exception as e:
                print(f"DEBUG: Error procesando total: {total_raw} - {e}")
                total_float = None

        # 2. Documento receptor (CUIT / DNI) en múltiples alias
        receptor_doc = (
            boleta.get('cuit')
            or boleta.get('CUIT')
            or boleta.get('dni')
            or boleta.get('documento')
            or boleta.get('doc')
        )
        if receptor_doc is not None:
            receptor_doc = str(receptor_doc).strip()
            if receptor_doc == '' or receptor_doc.lower() in ('0', 'none', 'null'):  # limpiar valores vacíos
                receptor_doc = None

        receptor_nombre = (
            boleta.get('Razon Social')
            or boleta.get('razon_social')
            or boleta.get('Cliente')
            or boleta.get('cliente')
            or boleta.get('nombre')
            or 'Consumidor Final'
        )

        # 3. Condición IVA receptor (alias con guión u otras variantes)
        cond_iva = (
            boleta.get('condicion_iva')
            or boleta.get('condicion-iva')
            or boleta.get('iva_condicion')
            or 'CONSUMIDOR_FINAL'
        )
        if isinstance(cond_iva, str):
            cond_iva = cond_iva.strip().upper() or 'CONSUMIDOR_FINAL'

        if total_float is None or receptor_doc is None:
            missing = []
            if total_float is None:
                missing.append('total')
            if receptor_doc is None:
                missing.append('documento_receptor')
            raise HTTPException(status_code=422, detail={'error': 'Datos insuficientes para facturar', 'missing': missing, 'ingreso_id': ingreso_id})
        payload = [{
            'id': str(ingreso_id),
            'total': total_float,
            'cliente_data': {
                'cuit_o_dni': str(receptor_doc),
                'nombre_razon_social': receptor_nombre or 'Consumidor Final',
                'domicilio': boleta.get('domicilio') or boleta.get('domicilio_receptor') or 'S/D',
                'condicion_iva': cond_iva
            },
            'emisor_cuit': boleta.get('emisor_cuit') or os.environ.get('EMISOR_CUIT'),
            **({'tipo_forzado': int(tipo_forzado)} if tipo_forzado is not None else {})
        }]
        print(f"DEBUG: Payload a enviar: {payload}")
        
        # Si el front forza un punto de venta explícito (override diagnóstico)
        if punto_venta_override is not None:
            try:
                payload[0]['punto_venta'] = int(punto_venta_override)
            except Exception:
                pass
        try:
            batch_res = process_invoice_batch_for_endpoint(payload, max_workers=1)
            if batch_res and batch_res[0].get('status') == 'SUCCESS':
                afip_row = batch_res[0].get('result')
            else:
                raise HTTPException(status_code=500, detail='Error facturando boleta')
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Error facturando: {e}')
    html = build_imprimible_html(boleta, afip_row)
    try:
        img_bytes = _render_ticket_image(html, formato)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error generando imagen: {e}')
    ext = 'png' if formato.lower() == 'png' else 'jpg'
    media = 'image/png' if ext == 'png' else 'image/jpeg'
    # Añadir metadatos de factura en headers si existen
    headers = {
        'Content-Disposition': f'attachment; filename="comprobante_{ingreso_id}.{ext}"'
    }
    try:
        if afip_row:
            if isinstance(afip_row, dict):
                cae = afip_row.get('cae')
                pto = afip_row.get('punto_venta')
                tipo = afip_row.get('tipo_comprobante') or afip_row.get('tipo_afip')
                nro = afip_row.get('numero_comprobante')
                if cae: headers['X-Factura-CAE'] = str(cae)
                if pto: headers['X-Factura-PtoVta'] = str(pto)
                if tipo: headers['X-Factura-Tipo'] = str(tipo)
                if nro: headers['X-Factura-Nro'] = str(nro)
    except Exception:
        pass
    return Response(content=img_bytes, media_type=media, headers=headers)


@router.get('/preview/facturacion/{ingreso_id}')
def preview_facturacion(ingreso_id: str, tipo_forzado: int | None = None, punto_venta: int | None = None, usuario_actual = Depends(obtener_usuario_actual)):
    """Devuelve el payload que se intentaría facturar (sin llamar AFIP) para diagnóstico.
    Permite revisar: total, documento, condicion IVA, emisor_cuit, overrides.
    """
    handler = _get_handler_for_user(usuario_actual)
    boleta = _buscar_boleta_por_ingreso(ingreso_id, handler)
    if not boleta:
        raise HTTPException(status_code=404, detail='Boleta no encontrada')
    # Reutilizamos lógica de parsing (duplicada mínima para no ejecutar facturación)
    total_raw = (
        boleta.get('importe_total')
        or boleta.get('total')
        or boleta.get('Total a Pagar')
        or boleta.get('total_a_pagar')
        or boleta.get('INGRESOS')
    )
    total_float = None
    parse_log = {}
    if total_raw is not None:
        try:
            # Si ya es un número (float), usarlo directamente
            if isinstance(total_raw, (int, float)):
                total_float = float(total_raw)
                parse_log['total_parse'] = {'input': str(total_raw), 'normalized': str(total_raw), 'ok': True, 'tipo': 'ya_normalizado'}
            else:
                # Si es string, parsear formato argentino
                s = str(total_raw).strip()
                original = s
                s = s.replace('$', '').replace(' ', '')
                s = s.replace('.', '').replace(',', '.')
                total_float = float(s)
                parse_log['total_parse'] = {'input': original, 'normalized': s, 'ok': True}
        except Exception as e:
            parse_log['total_parse'] = {'input': str(total_raw), 'error': str(e), 'ok': False}
    receptor_doc = (
        boleta.get('cuit')
        or boleta.get('CUIT')
        or boleta.get('dni')
        or boleta.get('documento')
        or boleta.get('doc')
    )
    if receptor_doc is not None:
        receptor_doc = str(receptor_doc).strip()
        if receptor_doc == '' or receptor_doc.lower() in ('0', 'none', 'null'):
            receptor_doc = None
    receptor_nombre = (
        boleta.get('Razon Social')
        or boleta.get('razon_social')
        or boleta.get('Cliente')
        or boleta.get('cliente')
        or boleta.get('nombre')
        or 'Consumidor Final'
    )
    cond_iva = (
        boleta.get('condicion_iva')
        or boleta.get('condicion-iva')
        or boleta.get('iva_condicion')
        or 'CONSUMIDOR_FINAL'
    )
    if isinstance(cond_iva, str):
        cond_iva = cond_iva.strip().upper() or 'CONSUMIDOR_FINAL'
    emisor_cuit = (boleta.get('emisor_cuit') or os.environ.get('EMISOR_CUIT'))
    # Validar CUIT receptor (si se suministró) para diagnóstico
    def _cuit_valido(c: str) -> bool:
        try:
            num = ''.join(ch for ch in c if ch.isdigit())
            if len(num) != 11:
                return False
            mult = [5,4,3,2,7,6,5,4,3,2]
            s = sum(int(num[i])*mult[i] for i in range(10))
            resto = 11 - (s % 11)
            ver = 0 if resto == 11 else (9 if resto == 10 else resto)
            return ver == int(num[-1])
        except Exception:
            return False

    documento_clasificacion = 'SIN_DOC'
    cuit_valido = False
    if receptor_doc and receptor_doc != '0':
        if len(receptor_doc) == 11 and _cuit_valido(receptor_doc):
            documento_clasificacion = 'CUIT_VALIDO'
            cuit_valido = True
        elif receptor_doc.isdigit() and len(receptor_doc) in (7,8):
            documento_clasificacion = 'DNI'
        else:
            documento_clasificacion = 'INVALIDO'

    preview = {
        'ingreso_id': ingreso_id,
        'total_detectado': total_float,
        'total_raw': total_raw,
        'receptor_doc': receptor_doc,
        'receptor_nombre': receptor_nombre,
        'condicion_iva_receptor': cond_iva,
        'emisor_cuit_raw': emisor_cuit,
        'tipo_forzado': tipo_forzado,
        'punto_venta_override': punto_venta,
        'parse_log': parse_log,
        'facturable': (total_float is not None and (receptor_doc is not None or cond_iva == 'CONSUMIDOR_FINAL')),
        'diagnostico': {
            'cuit_valido': cuit_valido,
            'documento_clasificacion': documento_clasificacion,
            'degradacion_consumidor_final': (documento_clasificacion in ('INVALIDO','SIN_DOC') and cond_iva == 'CONSUMIDOR_FINAL')
        }
    }
    return preview


@router.get('/debug/afip-credenciales')
def debug_afip_credenciales(emisor_cuit: str | None = None, usuario_actual = Depends(obtener_usuario_actual)):
    """Endpoint de diagnóstico para ver qué credenciales AFIP se resolverían.
    Restringido a admin/soporte (rol_id=1) para evitar exposición excesiva.
    """
    if not _is_admin(usuario_actual):
        raise HTTPException(status_code=403, detail='Solo admin/soporte')
    try:
        cuit, cert, key, fuente = _resolve_afip_credentials(emisor_cuit)
        disponibles = []
        try:
            disponibles = afip_tools_manager.listar_certificados_disponibles()
        except Exception:
            disponibles = []
        return {
            'solicitado': emisor_cuit,
            'resuelto_cuit': cuit,
            'fuente': fuente,
            'cert_preview': (cert[:60] + '...') if cert else None,
            'key_presente': bool(key),
            'certificados_boveda': disponibles,
            'env_flag_AFIP_ENABLE_ENV_CREDS': os.getenv('AFIP_ENABLE_ENV_CREDS'),
            'env_AFIP_CUIT': os.getenv('AFIP_CUIT'),
            'nota': 'Si fuente=env y querías bóveda, desactiva AFIP_ENABLE_ENV_CREDS o añade certificado/key a boveda.'
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error debug credenciales: {e}')


@router.get('/debug/afip-preflight')
def debug_afip_preflight(emisor_cuit: str | None = None, usuario_actual = Depends(obtener_usuario_actual)):
    if not _is_admin(usuario_actual):
        raise HTTPException(status_code=403, detail='Solo admin/soporte')
    try:
        return preflight_afip_credentials(emisor_cuit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error preflight credenciales: {e}')

@router.post('/debug/afip-contract-test')
def afip_contract_test(emisor_cuit: str, tipo_forzado: int = 11, total: float = 100.0, documento: str = '20111111112', condicion_receptor: str = 'CONSUMIDOR_FINAL', usuario_actual = Depends(obtener_usuario_actual)):
    """Realiza una facturación mínima sintética para verificar que el microservicio
    respeta el CUIT y el tipo_forzado enviados.

    NOTA: No debe usarse en producción normal. Sólo diagnóstico. Requiere rol admin.
    """
    if not _is_admin(usuario_actual):
        raise HTTPException(status_code=403, detail='Solo admin/soporte')
    try:
        receptor = ReceptorData(cuit_o_dni=str(documento), condicion_iva=condicion_receptor, nombre_razon_social='TEST CONTRATO', domicilio='S/D')
        resultado = generar_factura_para_venta(total=total, cliente_data=receptor, emisor_cuit=emisor_cuit, tipo_forzado=tipo_forzado)
        
        if not isinstance(resultado, dict):
             raise ValueError(f"El servicio de facturación devolvió una respuesta inesperada: {type(resultado)}")

        esperado_tipo = tipo_forzado
        obtenido_tipo = resultado.get('tipo_comprobante') or resultado.get('tipo_afip')
        mismatch = (int(esperado_tipo) != int(obtenido_tipo)) if (esperado_tipo is not None and obtenido_tipo is not None) else None
        cuit_usado = resultado.get('cuit_emisor') or resultado.get('debug_cuit_usado')
        cuit_mismatch = (str(cuit_usado) != str(emisor_cuit)) if cuit_usado is not None else None
        return {
            'solicitud': {
                'emisor_cuit': emisor_cuit,
                'tipo_forzado': tipo_forzado,
                'total': total,
                'documento': documento,
                'condicion_receptor': condicion_receptor
            },
            'resultado': resultado,
            'diagnostico': {
                'tipo_obtenido': obtenido_tipo,
                'tipo_mismatch': mismatch,
                'cuit_usado': cuit_usado,
                'cuit_mismatch': cuit_mismatch
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error en contract test: {e}')


@router.post('/normalizar-datos')
def normalizar_datos_sheet(usuario_actual = Depends(obtener_usuario_actual)):
    """Endpoint para normalizar todos los datos de totales en la hoja INGRESOS.
    Parsea los valores de total usando formato argentino y actualiza la hoja.
    Solo para admin/soporte.
    """
    if not _is_admin(usuario_actual):
        raise HTTPException(status_code=403, detail='Solo admin/soporte puede normalizar datos')
    
    try:
        handler = _get_handler_for_user(usuario_actual)
        if not handler.client:
            raise HTTPException(status_code=503, detail='Cliente de Google Sheets no disponible')
        
        sheet = handler.client.open_by_key(handler.google_sheet_id)
        worksheet = sheet.worksheet("INGRESOS")
        
        # Obtener todos los valores
        all_values = worksheet.get_all_values()
        if not all_values:
            raise HTTPException(status_code=404, detail='No se encontraron datos en la hoja INGRESOS')
        
        headers = all_values[0]
        
        # Encontrar columna de totales (buscar múltiples variantes)
        total_col_index = None
        total_col_name = None
        for i, h in enumerate(headers):
            h_compact = h.lower().replace(' ', '').replace('_', '')
            if h_compact in ('ingresos', 'total', 'importe', 'importetotal', 'totalapagar', 'totalapagar'):
                total_col_index = i
                total_col_name = h
                break
        
        if total_col_index is None:
            raise HTTPException(status_code=404, detail=f'No se encontró columna de totales. Headers disponibles: {headers}')
        
        print(f"Encontrada columna '{total_col_name}' en índice {total_col_index}")
        
        # Procesar cada fila (empezando desde la fila 2, después del header)
        updates = []
        for row_idx, row in enumerate(all_values[1:], start=2):
            if total_col_index >= len(row):
                continue  # fila incompleta
            
            valor_original = row[total_col_index].strip() if row[total_col_index] else ''
            if not valor_original:
                continue  # vacío, saltar
            
            # Aplicar la misma lógica de parsing que en normalize_row
            try:
                s = valor_original.replace('$', '').replace(' ', '')
                s = s.replace('.', '').replace(',', '.')
                valor_normalizado = float(s)
                
                # Formatear de vuelta a string con formato argentino (coma decimal, punto miles)
                valor_formateado = f"{valor_normalizado:,.2f}".replace(',', 'temp').replace('.', ',').replace('temp', '.')
                
                if valor_original != valor_formateado:
                    updates.append({
                        'row': row_idx,
                        'col': total_col_index + 1,  # gspread usa 1-indexed
                        'original': valor_original,
                        'normalizado': valor_formateado
                    })
                    
            except (ValueError, TypeError) as e:
                print(f"Error parseando fila {row_idx}, columna {total_col_name}: '{valor_original}' - {e}")
                continue
        
        # Aplicar actualizaciones en batch si hay cambios
        if not updates:
            return {'mensaje': 'No se encontraron valores para normalizar', 'procesadas': len(all_values) - 1}
        
        # Actualizar la hoja
        for update in updates:
            try:
                worksheet.update_cell(update['row'], update['col'], update['normalizado'])
                print(f"Actualizada fila {update['row']}: '{update['original']}' -> '{update['normalizado']}'")
            except Exception as e:
                print(f"Error actualizando fila {update['row']}: {e}")
        
        return {
            'mensaje': f'Se normalizaron {len(updates)} valores de totales',
            'procesadas': len(all_values) - 1,
            'actualizaciones': updates[:10],  # mostrar primeras 10 como ejemplo
            'total_actualizaciones': len(updates)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error normalizando datos: {e}')
@router.get('/debug/sheet-origen')
def debug_sheet_origen(usuario_actual = Depends(obtener_usuario_actual)):
    """Devuelve el Google Sheet ID resuelto para el usuario actual y muestra una muestra
    de las últimas boletas (5) para validar origen y orden.
    """
    try:
        handler = _get_handler_for_user(usuario_actual)
        sheet_id = getattr(handler, 'google_sheet_id', None)
        todas = handler.cargar_ingresos()
        def _fecha_key(b: Dict[str, Any]) -> int:
            try:
                raw = str(b.get('Fecha') or b.get('fecha') or b.get('FECHA') or '')
                base = raw.strip().split(' ')[0].split('T')[0]
                if base and len(base) == 10 and base[4] == '-' and base[7] == '-':
                    from datetime import datetime as _dt
                    return int(_dt.strptime(base, '%Y-%m-%d').strftime('%Y%m%d'))
                if base and len(base) == 10 and base[2] == '/' and base[5] == '/':
                    from datetime import datetime as _dt
                    return int(_dt.strptime(base, '%d/%m/%Y').strftime('%Y%m%d'))
            except Exception:
                return 0
            return 0
        ordenadas = sorted(todas, key=_fecha_key, reverse=True)
        muestra = []
        for b in ordenadas[:5]:
            muestra.append({
                'ID Ingresos': b.get('ID Ingresos') or b.get('id_ingreso') or b.get('id'),
                'Fecha': b.get('Fecha') or b.get('fecha') or b.get('FECHA'),
                'Razon Social': b.get('Razon Social') or b.get('razon_social'),
                'Repartidor': b.get('Repartidor') or b.get('repartidor'),
                'Total': b.get('importe_total') or b.get('INGRESOS') or b.get('total'),
                'Estado': b.get('facturacion') or b.get('Facturacion')
            })
        fuente = 'empresa' if sheet_id else 'global'
        return {'google_sheet_id': sheet_id, 'fuente': fuente, 'total_leidas': len(todas), 'muestra_recientes': muestra}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Error debug sheet origen: {e}')
@router.get("/admin/hoy")
def listar_boletas_hoy(usuario_actual = Depends(obtener_usuario_actual)):
    """Devuelve todas las boletas del día actual (admin/soporte).
    Incluye facturadas (BD) y pendientes (Sheets), con campos normalizados.
    """
    if not _is_admin(usuario_actual):
        raise HTTPException(status_code=403, detail="Solo admin/soporte")
    hoy = datetime.now().date()
    resultados: List[Dict[str, Any]] = []
    # Facturadas (BD)
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="DB no disponible")
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT id, numero_comprobante, fecha_comprobante, importe_total, resultado_afip,
                   cuit_emisor, nro_doc_receptor, raw_response, qr_url_afip, punto_venta
            FROM facturas_electronicas
            WHERE fecha_comprobante = %s
            ORDER BY id DESC
            """,
            (hoy,)
        )
        rows = cur.fetchall() or []
        for r in rows:
            cliente_doc = r.get('nro_doc_receptor')
            estado = 'FACTURADA'
            resultados.append({
                'categoria': 'facturada',
                'numero_boleta': r.get('numero_comprobante'),
                'fecha_hora': str(r.get('fecha_comprobante')),
                'monto_total': r.get('importe_total'),
                'estado': estado,
                'cliente': cliente_doc,
            })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error BD: {e}")
    finally:
        try:
            if cur: cur.close()
            if conn: conn.close()
        except Exception:
            pass
    # Pendientes (Sheets)
    try:
        handler = _get_handler_for_user(usuario_actual)
        todas = handler.cargar_ingresos()
        for b in todas:
            fecha_raw = b.get('Fecha') or b.get('fecha') or b.get('FECHA')
            if not fecha_raw:
                continue
            try:
                fecha_sin_hora = str(fecha_raw).split(' ')[0]
                fecha_obj = None
                if '/' in fecha_sin_hora:
                    fecha_obj = datetime.strptime(fecha_sin_hora, '%d/%m/%Y').date()
                elif '-' in fecha_sin_hora:
                    fecha_obj = datetime.strptime(fecha_sin_hora, '%Y-%m-%d').date()
                else:
                    continue
                if fecha_obj != hoy:
                    continue
            except Exception:
                continue
            estado_fact = str(b.get('facturacion') or b.get('Facturacion') or '').strip().lower()
            if estado_fact == 'falta facturar' or ('falta' in estado_fact and 'facturar' in estado_fact):
                resultados.append({
                    'categoria': 'pendiente',
                    'numero_boleta': b.get('Nro Comprobante') or b.get('numero_comprobante') or None,
                    'fecha_hora': str(fecha_raw),
                    'monto_total': b.get('importe_total') or b.get('INGRESOS') or b.get('total'),
                    'estado': 'PENDIENTE',
                    'cliente': b.get('Razon Social') or b.get('razon_social') or b.get('Cliente') or b.get('cliente'),
                })
    except Exception:
        # no interrumpir por errores de Sheets
        pass
    # Ordenar por fecha descendente (cuando sea posible)
    def _k(x: Dict[str, Any]) -> int:
        s = str(x.get('fecha_hora') or '')
        base = s.split(' ')[0].split('T')[0]
        try:
            if len(base) == 10 and base[4] == '-' and base[7] == '-':
                return int(datetime.strptime(base, '%Y-%m-%d').strftime('%Y%m%d'))
            if len(base) == 10 and base[2] == '/' and base[5] == '/':
                return int(datetime.strptime(base, '%d/%m/%Y').strftime('%Y%m%d'))
        except Exception:
            return 0
        return 0
    resultados.sort(key=_k, reverse=True)
    return resultados
