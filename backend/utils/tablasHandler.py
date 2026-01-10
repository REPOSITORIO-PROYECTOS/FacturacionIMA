import os

from requests import Session
try:
    import gspread
    from google.oauth2.service_account import Credentials
except Exception:
    class _Missing:
        def __getattr__(self, name):
            raise RuntimeError("gspread no está disponible en el entorno")
    gspread = _Missing()
    Credentials = _Missing()
from typing import List, Dict, Any, Optional, Tuple
import uuid
from datetime import datetime
from backend.config import GOOGLE_SHEET_ID,GOOGLE_SERVICE_ACCOUNT_FILE
import csv
import io

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive']
gspread_client: Optional[object] = None

datos_clientes: List[Dict] = []


class TablasHandler:
    def __init__(self, google_sheet_id=None):
        self.google_sheet_id = google_sheet_id or GOOGLE_SHEET_ID
        self.client = self._init_client()

    def _init_client(self) -> Optional[object]:
        global gspread_client
        if gspread_client is None:
            try:
                try:
                    _ = gspread  # acceso para detectar disponibilidad
                except Exception as e:
                    raise RuntimeError("gspread no está disponible en el entorno")
                back_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                credential_path = os.path.join(back_dir, GOOGLE_SERVICE_ACCOUNT_FILE)
                gspread_client = gspread.service_account(filename=credential_path, scopes=SCOPES)
            except Exception as e:
                print(f"Error al inicializar gspread: {e}")
                gspread_client = None
        return gspread_client

    def check_connection(self) -> Tuple[bool, str]:
        """Verifica si se puede acceder al Sheet y a la pestaña INGRESOS."""
        if not self.client:
             return False, "Cliente GSpread no inicializado."
        try:
            sheet = self.client.open_by_key(self.google_sheet_id)
            # Intentar acceder a INGRESOS para confirmar estructura básica
            worksheet = sheet.worksheet("INGRESOS")
            return True, f"Conectado a '{sheet.title}' > INGRESOS"
        except Exception as e:
            return False, f"Fallo conexión: {e}"

    def cargar_ingresos(self):
        print("Intentando cargar/recargar datos de INGRESOS...")
        if not self.google_sheet_id:
            print("Falta GOOGLE_SHEET_ID; no es posible cargar INGRESOS.")
            return []
        if self.client:
            try:
                sheet = self.client.open_by_key(self.google_sheet_id)
                worksheet = sheet.worksheet("INGRESOS")
                all_values = worksheet.get_all_values()
                headers = all_values[0] if all_values else []
                rows = all_values[1:] if len(all_values) > 1 else []
                def normalize_row(row: dict) -> dict:
                    new = dict(row)
                    for k, v in list(row.items()):
                        key_compact = k.lower().replace(' ', '').replace('_', '')

                        # Repartidor (emisor/operador que llevó la boleta)
                        if key_compact in ('repartidor', 'repartidornombre', 'nombredelempleado'):
                            # preferir no sobreescribir si ya existe una clave canónica
                            if not new.get('repartidor'):
                                new['repartidor'] = v
                                # also provide capitalized variant for older code that expects 'Repartidor'
                                if not new.get('Repartidor'):
                                    new['Repartidor'] = v

                        # Razón social / nombre del receptor (cliente)
                        if key_compact in ('razonsocial', 'razonsocialreceptor', 'razonsocialcliente', 'nombre', 'nombrecliente', 'nombre_razonsocial'):
                            if not new.get('razon_social'):
                                new['razon_social'] = v
                                if not new.get('Razon Social'):
                                    new['Razon Social'] = v

                        # Fecha en formatos variados
                        if key_compact in ('fecha', 'fechadeingreso', 'date'):
                            if not new.get('fecha'):
                                new['fecha'] = v
                                if not new.get('Fecha'):
                                    new['Fecha'] = v

                        # ID Ingresos
                        if key_compact in ('idingresos', 'id', 'id_ingreso'):
                            if not new.get('id_ingreso'):
                                new['id_ingreso'] = v
                                if not new.get('ID Ingresos'):
                                    new['ID Ingresos'] = v

                        # Estado de facturación: consolidar en 'facturacion'
                        if key_compact in ('facturacion', 'estadofacturacion', 'estado'):
                            # Preferir mantener valor original pero en minúsculas para facilitar comparación
                            try:
                                val = str(v).strip()
                            except Exception:
                                val = str(v) if v is not None else ''
                            if val and not new.get('facturacion'):
                                new['facturacion'] = val
                                # Mantener también la forma original si existía otra capitalización
                                if 'Facturacion' not in new:
                                    new['Facturacion'] = val

                        # Total / importe
                        if key_compact in ('ingresos', 'total', 'importe', 'importetotal', 'totalapagar'):
                            if not new.get('importe_total'):
                                # Intentar parsear como número flotante
                                try:
                                    if isinstance(v, str):
                                        s = v.strip().replace('$', '').replace(' ', '')
                                        s = s.replace('.', '').replace(',', '.')
                                        new['importe_total'] = float(s)
                                    else:
                                        new['importe_total'] = float(v)
                                except (ValueError, TypeError) as e:
                                    new['importe_total'] = v  # mantener original si falla

                    return new

                records: List[Dict[str, Any]] = []
                for r in rows:
                    if not any(str(c or '').strip() for c in r):
                        continue
                    d: Dict[str, Any] = {}
                    for i, h in enumerate(headers):
                        if i < len(r):
                            d[h] = r[i]
                    records.append(normalize_row(d))
                return records
            except gspread.exceptions.WorksheetNotFound:
                print("❌ ERROR: La hoja de cálculo no tiene una pestaña llamada 'INGRESOS'.")
            except Exception as e:
                print(f"❌ Error detallado al cargar datos de INGRESOS: {type(e).__name__} - {e}")
        else:
            print("Cliente de Google Sheets no disponible. Intentando fallback CSV público...")
            try:
                import requests
                url = f"https://docs.google.com/spreadsheets/d/{self.google_sheet_id}/gviz/tq?tqx=out:csv&sheet=INGRESOS"
                resp = requests.get(url, timeout=10)
                if resp.status_code != 200:
                    print(f"Fallback CSV HTTP status: {resp.status_code}")
                    return []
                content = resp.content.decode('utf-8', errors='replace')
                reader = csv.reader(io.StringIO(content))
                rows = list(reader)
                if not rows:
                    return []
                headers = rows[0]
                def normalize_row(row: dict) -> dict:
                    new = dict(row)
                    for k, v in list(row.items()):
                        key_compact = k.lower().replace(' ', '').replace('_', '')
                        if key_compact in ('repartidor', 'repartidornombre', 'nombredelempleado'):
                            if not new.get('repartidor'):
                                new['repartidor'] = v
                            if not new.get('Repartidor'):
                                new['Repartidor'] = v
                        if key_compact in ('razonsocial', 'razonsocialreceptor', 'razonsocialcliente', 'nombre', 'nombrecliente', 'nombre_razonsocial'):
                            if not new.get('razon_social'):
                                new['razon_social'] = v
                            if not new.get('Razon Social'):
                                new['Razon Social'] = v
                        if key_compact in ('fecha', 'fechadeingreso', 'date'):
                            if not new.get('fecha'):
                                new['fecha'] = v
                            if not new.get('Fecha'):
                                new['Fecha'] = v
                        if key_compact in ('idingresos', 'id', 'id_ingreso'):
                            if not new.get('id_ingreso'):
                                new['id_ingreso'] = v
                            if not new.get('ID Ingresos'):
                                new['ID Ingresos'] = v
                        if key_compact in ('facturacion', 'estadofacturacion', 'estado'):
                            try:
                                val = str(v).strip()
                            except Exception:
                                val = str(v) if v is not None else ''
                            if val and not new.get('facturacion'):
                                new['facturacion'] = val
                            if 'Facturacion' not in new:
                                new['Facturacion'] = val
                        if key_compact in ('ingresos', 'total', 'importe', 'importetotal', 'totalapagar'):
                            if not new.get('importe_total'):
                                try:
                                    if isinstance(v, str):
                                        s = v.strip().replace('$', '').replace(' ', '')
                                        s = s.replace('.', '').replace(',', '.')
                                        parsed_value = float(s)
                                        new['importe_total'] = parsed_value
                                    else:
                                        new['importe_total'] = float(v)
                                except (ValueError, TypeError):
                                    new['importe_total'] = v
                    return new
                records: List[Dict[str, Any]] = []
                for r in rows[1:]:
                    if not any(str(c or '').strip() for c in r):
                        continue
                    d: Dict[str, Any] = {}
                    for i, h in enumerate(headers):
                        if i < len(r):
                            d[h] = r[i]
                    records.append(normalize_row(d))
                return records
            except Exception as e:
                print(f"Fallback CSV error: {e}")
                return []



    def marcar_boleta_facturada(self, id_ingreso: str): 
        if not self.client:
            print("Cliente de Google Sheets no disponible.")
            return None

        try:
            sheet = self.client.open_by_key(self.google_sheet_id)
            worksheet = sheet.worksheet("INGRESOS")

            # Traer todas las filas como listas (incluye encabezados)
            all_values = worksheet.get_all_values()
            headers = all_values[0]

            # Buscar índices de columnas relevantes
            id_col_index = None
            fact_col_index = None
            total_col_index = None
            
            print(f"DEBUG Headers: {headers}")

            for i, h in enumerate(headers):
                h_lower = h.lower().replace(' ', '').replace('_', '')
                
                # Usar FIRST MATCH para evitar solapamientos si hay columnas repetidas
                if h_lower == "idingresos" and id_col_index is None:
                    id_col_index = i
                    print(f"DEBUG: ID Column found at {i} ({h})")
                
                if h_lower == "facturacion" and fact_col_index is None:
                    fact_col_index = i
                    print(f"DEBUG: Facturacion Column found at {i} ({h})")
                
                if h_lower in ('ingresos', 'total', 'importe', 'importetotal', 'totalapagar') and total_col_index is None:
                    total_col_index = i
            
            if id_col_index is None or fact_col_index is None:
                print(f"❌ Columnas 'ID Ingresos' o 'facturacion' no encontradas. Headers: {headers}")
                return False

            # Buscar la fila por ID
            for row_idx, row in enumerate(all_values[1:], start=2):  # start=2 porque empieza después del header
                if str(row[id_col_index]).strip() == str(id_ingreso).strip():
                    print(f"Found row {row_idx} for ID {id_ingreso}, current fact value: '{row[fact_col_index]}', updating to 'Facturado'")
                    
                    # Marcar como facturada
                    result = worksheet.update_cell(row_idx, fact_col_index + 1, "Facturado")
                    print(f"Update result: {result}, ✅ Boleta {id_ingreso} marcada como facturada en fila {row_idx}")
                    
                    # Normalizar el total si se encontró la columna
                    if total_col_index is not None and total_col_index < len(row):
                        valor_original = row[total_col_index].strip() if row[total_col_index] else ''
                        if valor_original:
                            try:
                                # Aplicar la misma lógica de parsing que en normalize_row
                                s = valor_original.replace('$', '').replace(' ', '')
                                s = s.replace('.', '').replace(',', '.')
                                valor_normalizado = float(s)
                                
                                # Formatear de vuelta a string con formato argentino (coma decimal, punto miles)
                                valor_formateado = f"{valor_normalizado:,.2f}".replace(',', 'temp').replace('.', ',').replace('temp', '.')
                                
                                if valor_original != valor_formateado:
                                    worksheet.update_cell(row_idx, total_col_index + 1, valor_formateado)
                                    print(f"✅ Total normalizado en fila {row_idx}: '{valor_original}' -> '{valor_formateado}'")
                            
                            except (ValueError, TypeError) as e:
                                print(f"⚠️ Error normalizando total en fila {row_idx}: '{valor_original}' - {e}")
                    
                    return True

            print(f"⚠️ No se encontró boleta con ID {id_ingreso} en las filas. Headers: {headers[:5]}... IDs sample: {[r[id_col_index] for r in all_values[1:][:5]]}")
            return False

        except Exception as e:
            print(f"❌ Error al actualizar boleta: {type(e).__name__} - {e}")
            return False

    def marcar_boleta_anulada(self, id_ingreso: str):
        if not self.client:
            print("Cliente de Google Sheets no disponible.")
            return None
        try:
            sheet = self.client.open_by_key(self.google_sheet_id)
            worksheet = sheet.worksheet("INGRESOS")
            all_values = worksheet.get_all_values()
            headers = all_values[0]
            id_col_index = None
            fact_col_index = None
            for i, h in enumerate(headers):
                h_lower = h.lower().replace(' ', '').replace('_', '')
                if h_lower == "idingresos":
                    id_col_index = i
                if h_lower == "facturacion":
                    fact_col_index = i
            if id_col_index is None or fact_col_index is None:
                return False
            for row_idx, row in enumerate(all_values[1:], start=2):
                if str(row[id_col_index]).strip() == str(id_ingreso).strip():
                    worksheet.update_cell(row_idx, fact_col_index + 1, "Anulada")
                    return True
            return False
        except Exception as e:
            print(f"❌ Error al actualizar boleta: {type(e).__name__} - {e}")
            return False

    def verificar_estado_boleta(self, id_ingreso: str) -> Optional[str]:
        if not self.client:
            return None
        try:
            sheet = self.client.open_by_key(self.google_sheet_id)
            worksheet = sheet.worksheet("INGRESOS")
            all_values = worksheet.get_all_values()
            headers = all_values[0] if all_values else []
            id_col_index = None
            fact_col_index = None
            for i, h in enumerate(headers):
                hl = h.lower().replace(' ', '').replace('_', '')
                if hl == 'idingresos':
                    id_col_index = i
                if hl == 'facturacion':
                    fact_col_index = i
            if id_col_index is None or fact_col_index is None:
                return None
            for row in all_values[1:]:
                if str(row[id_col_index]).strip() == str(id_ingreso).strip():
                    return str(row[fact_col_index]).strip()
            return None
        except Exception:
            return None

    def refrescar_drive(self):
        global gspread_client
        gspread_client = None
        self.client = self._init_client()
