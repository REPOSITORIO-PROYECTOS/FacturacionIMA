## Migración a una Nueva Base de Datos MySQL

Este proyecto originalmente reutiliza tablas de un sistema existente. Si deseas separar tu propia base y migrar los datos, sigue estos pasos.

### 1. Preparar variables de entorno
Agrega al `.env` (o exporta) las variables para origen (legacy) y destino (nuevo):

```
# Origen (legacy)
LEGACY_DB_HOST=localhost
LEGACY_DB_USER=legacy_user
LEGACY_DB_PASSWORD=legacy_pass
LEGACY_DB_NAME=legacy_db

# Destino (nuevo)
NEW_DB_HOST=localhost
NEW_DB_USER=nuevo_user
NEW_DB_PASSWORD=nuevo_pass
NEW_DB_NAME=facturacion_ima
```

Crear la nueva base vacía si no existe:

```
CREATE DATABASE facturacion_ima CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Ejecutar script de migración
Activa el entorno virtual y corre:

```
source .venv/bin/activate
python backend/scripts/migrate_to_new_database.py
```

El script:
- Crea las tablas definidas en los modelos SQLModel en la nueva BD.
- Copia filas de cada tabla que exista en legacy (INSERT IGNORE).
- Genera un resumen final por tabla.

### 3. Revisar resultado
Al final verás algo como:
```
==== RESUMEN MIGRACIÓN ====
ventas: {"status": "COPIED", "rows": 1234, "columns": 10}
facturas_electronicas: {"status": "COPIED", "rows": 250, "columns": 18}
...etc
```

### 4. Cambiar la app para usar la nueva BD
En el `.env` agrega:
```
USE_NEW_DB=1
NEW_DB_HOST=localhost
NEW_DB_USER=nuevo_user
NEW_DB_PASSWORD=nuevo_pass
NEW_DB_NAME=facturacion_ima
```

Al reiniciar el backend verás en logs:
```
DEBUG_CFG: Redirigiendo conexión principal a NUEVA BD (USE_NEW_DB=1)
```

Si falta alguna variable NEW_DB_* mostrará una advertencia y seguirá usando la original.

### 5. Verificación rápida
Con el backend levantado:
```
source .venv/bin/activate
python - <<'PY'
from backend import config
print('Conectando a:', config.DB_HOST, config.DB_NAME)
import mysql.connector
cn = mysql.connector.connect(host=config.DB_HOST,user=config.DB_USER,password=config.DB_PASSWORD,database=config.DB_NAME)
cur = cn.cursor(); cur.execute('SHOW TABLES'); print('Tablas:', [r[0] for r in cur.fetchall()][:12]); cn.close()
PY
```

### 6. Campos nuevos / migraciones incrementales
Si más adelante agregas columnas nuevas (por ejemplo diagnósticos de facturas) y la legacy no las tenía, quedarán NULL tras el copiado inicial. Puedes:
- Aceptar los NULL para históricos.
- O rellenar con scripts de backfill específicos.

### 7. Rollback rápido
Si algo falla, simplemente quita `USE_NEW_DB=1` del `.env` y reinicia el backend para volver a la base anterior.

### 8. Recomendaciones
- Haz un dump antes de migrar:
```
mysqldump -h localhost -u legacy_user -p legacy_db > backup_legacy.sql
```
- Usa cuentas de solo lectura en legacy para minimizar riesgos.
- Programa la migración en ventana de baja actividad si el volumen de datos es grande.

---
Listo. La estructura ya soporta un corte limpio hacia una BD propia sin tocar el código de lógica. 