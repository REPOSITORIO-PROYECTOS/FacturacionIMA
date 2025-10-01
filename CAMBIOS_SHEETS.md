# 🎯 CAMBIOS IMPLEMENTADOS - Google Sheets como Fuente Única

## 📋 Resumen
Se eliminó la dependencia de `gestion_ima_db` y ahora **TODO** se maneja desde Google Sheets + `facturacion_ima`.

---

## ✅ Backend

### 1. Nuevo Endpoint: `/sheets/boletas`
**Archivo:** `backend/app/blueprints/sheets_boletas.py`

```python
GET /sheets/boletas?tipo=no-facturadas&limit=300
```

**Funcionalidad:**
- Carga boletas directamente desde Google Sheets
- Filtra por tipo: `no-facturadas` | `facturadas` | `todas`
- Normaliza campos automáticamente
- NO depende de MySQL `gestion_ima_db`

### 2. Endpoints Deprecados
**Archivo:** `backend/app/blueprints/ventas_detalle.py`

- `/ventas/{venta_id}/conceptos` → Ahora retorna `[]` (deprecado)
- `/ventas/{venta_id}/marcar-facturada` → Ahora se marca automáticamente en Sheets

### 3. Proceso de Facturación
**Archivo:** `backend/utils/billige_manage.py`

✅ **YA IMPLEMENTADO** - El sistema automáticamente:
1. Guarda factura en `facturacion_ima` DB
2. Marca boleta en Google Sheets con `sheets_handler.marcar_boleta_facturada()`
3. Genera PDF del comprobante

---

## 🎨 Frontend

### 1. Nuevo Proxy para Sheets
**Archivo:** `frontend/src/app/api/sheets/boletas/route.ts`

```typescript
GET /api/sheets/boletas?tipo=no-facturadas
```

### 2. Indicadores Visuales de Loading

#### Estados Agregados:
```typescript
const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
const [isProcessing, setIsProcessing] = useState(false);
```

#### Botones con Spinner:
- ✅ Botón "Facturar" individual → Spinner animado
- ✅ Botón "Facturar seleccionadas" → Spinner animado
- ✅ Deshabilitado durante procesamiento

### 3. Confirmación Visual
```typescript
if (!confirm(`¿Facturar ${ids.length} boleta(s) seleccionada(s)?`)) return;
```

---

## 📊 Flujo Actualizado

```
┌─────────────────┐
│ Google Sheets   │ ← Fuente única de verdad
│  (INGRESOS)     │
└────────┬────────┘
         │
         ├── GET /sheets/boletas → Frontend
         │
         ├── POST /facturador/facturar-por-cantidad
         │   ├── Guarda en facturacion_ima
         │   ├── Marca en Sheets (automático)
         │   └── Genera PDF
         │
         └── Descarga automática del PDF
```

---

## 🗄️ Bases de Datos

### ❌ **gestion_ima_db** (DEPRECADA)
- Ya NO se usa
- Tabla `ventas` obsoleta
- Tabla `venta_detalle` obsoleta

### ✅ **facturacion_ima** (ACTIVA)
- Tabla `facturas_electronicas` → Guarda todas las facturas emitidas
- Tabla `usuarios` → Autenticación
- Tabla `roles` → Permisos

### ✅ **Google Sheets** (FUENTE DE VERDAD)
- Hoja "INGRESOS" → Todas las boletas
- Campo `facturacion` → Estado (`facturado` / vacío)
- Campo `ID Ingresos` → Identificador único

---

## 🚀 Próximos Pasos

### Opcional: Sync Automático
Puedes crear un cron job que sincronice desde Sheets periódicamente:

```bash
# Cada 5 minutos
*/5 * * * * curl -X POST http://localhost:8008/sheets/sincronizar \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 Logs para Debugging

### Backend:
```bash
pm2 logs IMA-backend | grep -E "(sheets|Sheets|INGRESOS)"
```

### Frontend (Consola del navegador):
```javascript
// Verás logs como:
📦 Respuesta completa de facturación: [...]
🔍 factura_id encontrado: 123
📄 Descargando comprobante #123...
✅ Comprobante descargado exitosamente
📝 Marcando boleta dasa3fs12 como facturada...
✅ Boleta marcada como facturada exitosamente
```

---

## 🎉 Resultado Final

✅ **Sistema unificado con Google Sheets**
✅ **Sin dependencia de gestion_ima_db**
✅ **Marcado automático en Sheets**
✅ **Loading visual durante facturación**
✅ **Confirmación antes de facturar múltiples**
✅ **Descarga automática de PDF**
✅ **Logs detallados para debugging**

