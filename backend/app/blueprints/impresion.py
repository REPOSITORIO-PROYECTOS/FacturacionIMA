from fastapi import APIRouter, Depends, HTTPException, Response, Query
from pydantic import BaseModel
from backend.security import obtener_usuario_actual
from backend.app.blueprints import boletas
from typing import List
from io import BytesIO
import zipfile

router = APIRouter(prefix="/impresion")


@router.get("/{ingreso_id}/html")
def imprimir_html(ingreso_id: str, usuario_actual = Depends(obtener_usuario_actual)):
    try:
        return boletas.imprimir_html_por_ingreso(ingreso_id, usuario_actual)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{ingreso_id}/imagen")
def imprimir_imagen(ingreso_id: str, formato: str = Query('jpg', pattern='^(jpg|jpeg|png)$'), usuario_actual = Depends(obtener_usuario_actual)):
    try:
        return boletas.imprimir_imagen_por_ingreso(ingreso_id, usuario_actual, formato=formato)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{ingreso_id}/facturar-imagen")
def facturar_e_imprimir_img(ingreso_id: str, formato: str = Query('jpg', pattern='^(jpg|jpeg|png)$'), tipo_forzado: int | None = Query(None, description='Override tipo comprobante: 1=A,6=B,11=C'), punto_venta: int | None = Query(None, description='Override punto de venta'), usuario_actual = Depends(obtener_usuario_actual)):
    try:
        return boletas.facturar_e_imprimir_img(ingreso_id, usuario_actual, formato=formato, tipo_forzado=tipo_forzado, punto_venta_override=punto_venta)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PackRequest(BaseModel):
    pass


@router.post("/pack-imagenes")
def generar_pack_imagenes(ingreso_ids: List[str], usuario_actual = Depends(obtener_usuario_actual)):
    """Genera un ZIP con las imágenes JPEG (58mm) para una lista de ingreso_ids.
    Sólo incluirá boletas a las que el usuario tenga acceso (si no es admin, sólo su repartidor).
    """
    try:
        # Validación simple de la lista
        if not isinstance(ingreso_ids, list) or len(ingreso_ids) == 0:
            raise HTTPException(status_code=400, detail='Se requiere una lista de ingreso_ids')

        zip_io = BytesIO()
        with zipfile.ZipFile(zip_io, mode='w', compression=zipfile.ZIP_DEFLATED) as zf:
            for ingreso in ingreso_ids:
                try:
                    # Llamar a la función que devuelve la imagen JPEG
                    resp = boletas.imprimir_imagen_por_ingreso(ingreso, usuario_actual)
                    if not isinstance(resp, Response):
                        continue
                    content = resp.body if hasattr(resp, 'body') else resp.content
                    # Nombre de archivo dentro del zip
                    filename = f"comprobante_{ingreso}.jpg"
                    zf.writestr(filename, content)
                except HTTPException:
                    # Saltar boletas no encontradas o no autorizadas
                    continue
                except Exception:
                    continue

        zip_io.seek(0)
        return Response(content=zip_io.read(), media_type='application/zip', headers={
            'Content-Disposition': 'attachment; filename="boletas_imagenes.zip"'
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-imagenes")
def test_generar_imagenes(ingreso_ids: List[str], usuario_actual = Depends(obtener_usuario_actual)):
    """Endpoint de diagnóstico: intenta generar la imagen JPEG para cada ingreso_id y devuelve un resumen por ID.
    Útil para comprobar autorización, generación y que el backend entrega correctamente al frontend.
    """
    try:
        if not isinstance(ingreso_ids, list) or len(ingreso_ids) == 0:
            raise HTTPException(status_code=400, detail='Se requiere una lista de ingreso_ids')

        results = []
        for ingreso in ingreso_ids:
            try:
                resp = boletas.imprimir_imagen_por_ingreso(ingreso, usuario_actual)
                if not isinstance(resp, Response):
                    # La función no devolvió un Response válido
                    results.append({"id": ingreso, "ok": False, "error": "No se recibió Response de imagen"})
                    continue
                # Obtener contenido desde la Response
                content = getattr(resp, 'body', None) or getattr(resp, 'content', None)
                size = len(content) if content else 0
                # Intentar obtener el media type
                media_type = getattr(resp, 'media_type', None) or resp.headers.get('content-type') if hasattr(resp, 'headers') else None
                results.append({"id": ingreso, "ok": True, "size": size, "media_type": media_type})
            except HTTPException as he:
                results.append({"id": ingreso, "ok": False, "status_code": he.status_code, "detail": str(he.detail)})
            except Exception as e:
                results.append({"id": ingreso, "ok": False, "error": str(e)})

        return {"results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
