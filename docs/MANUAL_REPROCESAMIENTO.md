# Manual de Reprocesamiento de Facturas

Este documento describe cómo utilizar el script de recuperación y reprocesamiento de facturas (`backend/scripts/reprocess_batch.py`). Este script está diseñado para manejar situaciones donde un lote de facturas falla parcialmente o presenta inconsistencias (ej. aceptada por AFIP pero no guardada en base de datos).

## Ubicación del Script
`backend/scripts/reprocess_batch.py`

## Funcionalidades
1. **Identificación Automática:** Detecta facturas fallidas, exitosas y parcialmente exitosas.
2. **Reparación de Consistencia:** Si una factura tiene CAE (aceptada por AFIP) pero falló al guardarse en la Base de Datos o Google Sheets, el script intenta guardar los datos existentes **sin volver a facturar** (evita duplicados).
3. **Reintento Forzado:** Permite reintentar el procesamiento completo de facturas que fueron rechazadas previamente.

## Uso del Script

El script se ejecuta desde la línea de comandos (terminal).

### Comando Básico (Solo Reparación)
Este comando solo reparará facturas inconsistentes (aceptadas por AFIP pero no guardadas localmente). **No reintentará** las que fallaron totalmente.

```bash
/path/to/python backend/scripts/reprocess_batch.py testing/batch_results_YYYYMMDD_HHMMSS.json
```

### Comando con Reintento Forzado (Recomendado para fallos)
Si desea intentar facturar nuevamente las que dieron error (ej. "Transacción Activa" o errores de conexión), use la opción `--force`.

```bash
/path/to/python backend/scripts/reprocess_batch.py testing/batch_results_YYYYMMDD_HHMMSS.json --force
```

## Interpretación de Resultados

El script genera un log detallado en pantalla y en `reprocess.log`.

### Ejemplo de Salida
```text
=== Resumen de Operación ===
Total analizadas: 5
Correctas originales: 3      <-- No requirieron acción
Reparadas (DB/Sheets): 1     <-- Se recuperaron datos de AFIP y se guardaron en BD
Fallidas originales: 1       <-- Fallaron en la primera ejecución
Reintentadas: 1              <-- Se enviaron nuevamente a AFIP (con --force)
```

## Flujo de Trabajo Sugerido
1. Si un lote falla (parcial o totalmente), ubique el archivo de resultados en la carpeta `testing/`.
2. Ejecute el script con `--force`.
3. Verifique el resumen final.
4. Si algunas siguen fallando (ej. por datos inválidos de cliente), corrija los datos en el sistema y genere un nuevo lote manualmente para esas específicas.
