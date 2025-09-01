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
                return datos_clientes
            except gspread.exceptions.WorksheetNotFound:
                print("❌ ERROR: La hoja de cálculo no tiene una pestaña llamada 'INGRESOS'.")
            except Exception as e:
                # ¡IMPRIME EL ERROR REAL!
                print(f"❌ Error detallado al cargar datos de INGRESOS: {type(e).__name__} - {e}")
        else:
            print("Cliente de Google Sheets no disponible.")
        return [] # Devuelve lista vacía en caso de cualquier error
