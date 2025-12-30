# Cambios Realizados en el Sistema de Facturación IMA

Se han realizado las siguientes correcciones y mejoras para abordar los problemas reportados.

## 1. Problema con la Boleta/Factura
### Descarga Automática
- **Refactorización de Descarga**: Se creó una función modular `downloadInvoicePDF` en el frontend para centralizar la lógica de descarga.
- **Eliminación de Retrasos**: Se eliminó un `setTimeout` innecesario de 100ms que causaba inconsistencias en la descarga.
- **Seguridad y Compatibilidad**: Se eliminó el uso de `window.open` como fallback, el cual era frecuentemente bloqueado por los navegadores como un popup no deseado. En su lugar, se optimizó el uso de enlaces temporales (`<a>`) con el atributo `download`.
- **Validación de PDF**: Se añadió una verificación del tipo MIME del blob recibido para asegurar que sea un PDF válido antes de intentar la descarga.
- **Implementación**: La descarga ahora se dispara inmediatamente después de que el backend confirma la generación exitosa del CAE.

## 2. Problema con las Fechas
### Filtrado y UI
- **Consistencia de Formato**: Se unificó el formato de visualización a `DD/MM/YYYY` (es-AR) en toda la aplicación.
- **Selección Local**: Se corrigió el uso de `toISOString()` para las fechas "Hoy" y "Ayer", reemplazándolo por una función `getLocalDateStr` que respeta la zona horaria local del navegador.
- **Nuevas Funcionalidades**:
    - Se añadió un botón para filtrar por los **"Últimos 7 días"**.
    - Se optimizaron los botones "Hoy" y "Ayer" para que establezcan el rango de un solo día, permitiendo el filtrado por día específico solicitado.
- **Robustez en el Backend**: Se mejoró la función `_parse_fecha_key` en `sheets_boletas.py` para manejar múltiples formatos de entrada (ISO, barras, guiones) y se corrigió un bug en la detección de objetos `datetime`.

## 3. Integridad de Datos y Pruebas
- **Verificación de DB**: Se realizaron chequeos de integridad en la tabla `ingresos_sheets`, confirmando la ausencia de duplicados en `id_ingreso` y campos vacíos críticos.
- **Pruebas Unitarias**: Se actualizó y validó el archivo `backend/tests/test_dates.py` para asegurar que el parsing de fechas sea correcto y no sufra regresiones.
- **Compatibilidad**: Se eliminaron logs excesivos y se optimizó la limpieza de `ObjectURLs` para prevenir fugas de memoria en el navegador.

## 4. Archivos Modificados
- `frontend/src/app/boletas/no-facturadas/page.tsx`: Lógica de facturación, descarga y UI de fechas.
- `frontend/src/app/boletas/facturadas/page.tsx`: UI de fechas y formateo consistente.
- `backend/app/blueprints/sheets_boletas.py`: Lógica de parsing de fechas y filtrado en DB.
- `backend/tests/test_dates.py`: Pruebas de regresión para fechas.
