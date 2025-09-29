# FacturacionIMA
DEsarrollo chico modulacion

## Despliegue / Producción

### Opción 1: Stack unificado (legacy)
Se usaba `ecosystem.config.js` con el script `start_all.sh` que:
1. Reinstala dependencias backend siempre.
2. Ejecuta `npm install` y `next build` en el frontend cada reinicio.
3. Inicia backend (uvicorn) y frontend (next start) en un mismo proceso supervisado.

Desventaja: si sólo cambias código del backend igualmente recompila todo el frontend, haciendo los reinicios más lentos.

### Opción 2: Procesos separados (recomendada)
Se añadieron scripts y un ecosystem separado para dividir backend y frontend:

Archivos nuevos:
- `scripts/backend_start.sh`: arranca únicamente el backend. Hace `pip install` sólo si cambió `requirements.txt` (usa hash).
- `scripts/frontend_start.sh`: arranca únicamente el frontend. Hace `npm install` sólo si cambió `package.json` (usa hash).
- `ecosystem.split.config.js`: define dos apps de PM2: `IMA-backend` y `IMA-frontend`.

Iniciar:
```bash
pm2 start ecosystem.split.config.js
pm2 status
```

Reiniciar sólo una parte:
```bash
pm2 restart IMA-backend
pm2 restart IMA-frontend
```

Detener (migrando desde la versión unificada):
```bash
pm2 stop IMA-stack || true
pm2 delete IMA-stack || true
pm2 start ecosystem.split.config.js
```

Variables de entorno útiles:
- BACKEND_PORT (default 8008)
- FRONTEND_PORT (default 3001)
- BACKEND_URL (usada por el frontend para hablar con el backend; default http://127.0.0.1:8008)

Beneficios del modo separado:
- Reinicios más rápidos cuando sólo cambia backend.
- Menos CPU y tiempo en builds innecesarios.
- Identificación clara de procesos (facilita monitoreo y logs).

### Desarrollo local rápido
Puedes seguir usando `npm run dev` en `frontend` y ejecutar `uvicorn` en el backend manualmente, o levantar ambos con el modo separado vía PM2. El stack unificado sólo conviene para “bootstrap” inicial o entornos muy simples.

### Próximos pasos sugeridos
- Añadir logs estructurados (JSON) a backend para monitoreo.
- Integrar healthchecks (ej: `/healthz`) y configurar restart conditions en PM2. (YA agregado endpoint `/healthz`).
- Automatizar despliegue CI/CD: build frontend una vez, servirlo con un servidor estático (nginx) y dejar FastAPI independiente.

## Healthcheck
El backend expone ahora `GET /healthz` devolviendo JSON:
```
{
	"status": "ok",
	"version": "1.0.0",
	"database": true/false,
	"google_sheets": true/false
}
```
Úsalo en PM2, load balancers o monitoreo externo.

## Preparación para GitHub (higiene de repositorio)
- Se añadió `.env.example` con las variables mínimas: copia a `.env` y ajusta valores reales.
- Asegurado `.gitignore` para no filtrar: claves AFIP, credenciales, DB locales, logs, bóvedas temporales.
- Verifica antes de subir: `git ls-files | grep -E '\\.(key|crt|pem|p12|pfx)$'` debería estar vacío.
- No subir `auth.db` ni otros `*.db` (ya ignorados).

## Flujo recomendado de primeras pruebas
1. Copiar `.env.example` a `.env` y ajustar.
2. Colocar `credencial_IA.json` (service account) en `backend/` (o apuntar variable a su ruta).
3. Levantar backend: `pm2 restart IMA-backend` o `uvicorn backend.main:app --reload --port 8008`.
4. Verificar `curl http://localhost:8008/healthz`.
5. Levantar frontend y probar login + facturación + impresión.


