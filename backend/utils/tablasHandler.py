import os

from requests import Session
import gspread
from google.oauth2.service_account import Credentials
from typing import List, Dict, Any, Optional, Tuple
import uuid
from datetime import datetime
from backend.config import GOOGLE_SHEET_ID,GOOGLE_SERVICE_ACCOUNT_FILE

SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file']
gspread_client: Optional[gspread.Client] = None

datos_clientes: List[Dict] = []


class TablasHandler:
    def __init__(self):
        self.google_sheet_id = GOOGLE_SHEET_ID
        self.client = self._init_client()

    def _init_client(self) -> Optional[gspread.Client]:
        global gspread_client
        if gspread_client is None:
            try:
                back_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                credential_path = os.path.join(back_dir, GOOGLE_SERVICE_ACCOUNT_FILE)
                gspread_client = gspread.service_account(filename=credential_path, scopes=SCOPES)
            except Exception as e:
                print(f"Error al inicializar gspread: {e}")
                gspread_client = None
        return gspread_client


    def cargar_ingresos(self):
        print("Intentando cargar/recargar datos de INGRESOS...")
        if self.client:
            try:
                sheet = self.client.open_by_key(self.google_sheet_id)
                worksheet = sheet.worksheet("INGRESOS") 
                datos_clientes = worksheet.get_all_records()
                # Normalizar claves comunes para evitar ambigüedades entre variantes
                def normalize_row(row: dict) -> dict:
                    new = dict(row)  # copiar valores originales
                    # construir mapa de keys compactas para detección
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

                    return new

                normalized = [normalize_row(r) for r in datos_clientes]
                return normalized
            except gspread.exceptions.WorksheetNotFound:
                print("❌ ERROR: La hoja de cálculo no tiene una pestaña llamada 'INGRESOS'.")
            except Exception as e:
                print(f"❌ Error detallado al cargar datos de INGRESOS: {type(e).__name__} - {e}")
        else:
            print("Cliente de Google Sheets no disponible.")
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
            id_col_index = headers.index("ID Ingresos")
            fact_col_index = headers.index("facturacion")

            # Buscar la fila por ID
            for row_idx, row in enumerate(all_values[1:], start=2):  # start=2 porque empieza después del header
                if row[id_col_index] == id_ingreso:
                    # Actualizar celda de facturación
                    worksheet.update_cell(row_idx, fact_col_index + 1, "facturado")
                    print(f"✅ Boleta {id_ingreso} marcada como facturada")
                    return True

            print(f"⚠️ No se encontró boleta con ID {id_ingreso}")
            return False

        except Exception as e:
            print(f"❌ Error al actualizar boleta: {type(e).__name__} - {e}")
            return False