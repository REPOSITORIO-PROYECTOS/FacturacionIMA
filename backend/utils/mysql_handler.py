import mysql.connector
from mysql.connector import Error
from backend import config  # ¡Importa el módulo entero!


def get_db_connection():
    """Crea y devuelve una conexión a la base de datos usando la configuración central."""
    try:
        # Ahora los datos de conexión se leen desde config.py
        conn = mysql.connector.connect(
            host=config.DB_HOST,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            database=config.DB_NAME
        )
        if conn.is_connected():
            return conn
    except Error as e:
        print(f"Error CRÍTICO al conectar a MySQL: {e}")
        # En una aplicación real, aquí podrías registrar el error en un log.
        return None