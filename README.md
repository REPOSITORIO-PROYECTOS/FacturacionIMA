# FacturacionIMA 🧾

Sistema de Facturación Electrónica Multi-Empresa para Argentina

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14+-black.svg)](https://nextjs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-orange.svg)](https://www.mysql.com/)
[![AFIP](https://img.shields.io/badge/AFIP-WSFE-blue.svg)](https://www.afip.gob.ar/)

## 📋 Descripción

FacturacionIMA es un sistema completo de facturación electrónica diseñado para empresas argentinas que necesitan emitir comprobantes fiscales (A, B, C) de manera automática y segura. El sistema soporta múltiples empresas en una sola instancia, con aislamiento completo de datos y configuraciones específicas por empresa.

### ✨ Características Principales

- **🏢 Multi-Empresa**: Soporte completo para múltiples empresas con datos completamente aislados
- **📄 Facturación Electrónica**: Integración completa con AFIP (Administración Federal de Ingresos Públicos)
- **🧾 Comprobantes**: Emisión automática de Facturas A, B, C, Notas de Crédito y Débito
- **📊 Dashboard**: Panel de control intuitivo con métricas en tiempo real
- **👥 Gestión de Usuarios**: Sistema de roles y permisos por empresa
- **📱 Responsive**: Interfaz moderna y adaptativa
- **🔒 Seguridad**: Autenticación JWT, encriptación de datos sensibles
- **📈 Reportes**: Generación automática de reportes fiscales y de ventas
- **🔄 Sincronización**: Integración con Google Sheets para reportes

## 🏗️ Arquitectura

### Backend (Python/FastAPI)

- **Framework**: FastAPI con SQLAlchemy/SQLModel
- **Base de Datos**: MySQL con esquema multi-tenant
- **Autenticación**: JWT con roles y permisos
- **Integraciones**: AFIP WSFE, Google Sheets API
- **Documentación**: API automática con Swagger/OpenAPI

### Frontend (Next.js/React)

- **Framework**: Next.js 14 con App Router
- **UI**: Tailwind CSS con componentes modernos
- **Estado**: Context API para gestión de estado
- **Formularios**: Validación con React Hook Form

### Base de Datos

- **Motor**: MySQL 8.0+
- **Esquema**: Multi-tenant con `id_empresa` en todas las tablas
- **Migraciones**: Scripts automatizados para actualizaciones

## 🚀 Tecnologías Utilizadas

### Backend

- **Python 3.8+**
- **FastAPI** - Framework web moderno y rápido
- **SQLAlchemy/SQLModel** - ORM y modelado de datos
- **PyMySQL** - Conector MySQL
- **Werkzeug** - Utilidades de seguridad
- **python-jose** - JWT tokens
- **passlib** - Hashing de contraseñas

### Frontend

- **Next.js 14** - Framework React con SSR
- **React 18** - Biblioteca UI
- **TypeScript** - JavaScript tipado
- **Tailwind CSS** - Framework CSS utilitario
- **React Hook Form** - Gestión de formularios
- **Axios** - Cliente HTTP

### Infraestructura

- **MySQL 8.0+** - Base de datos principal
- **PM2** - Gestor de procesos para producción
- **Nginx** - Servidor web (opcional)
- **Docker** - Contenedorización (futuro)

## 📦 Instalación

### Prerrequisitos

- Python 3.8 o superior
- Node.js 18 o superior
- MySQL 8.0 o superior
- Git

### Configuración Inicial

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/REPOSITORIO-PROYECTOS/FacturacionIMA.git
   cd FacturacionIMA
   ```

2. **Configurar variables de entorno**

   ```bash
   cp .env.example .env
   # Editar .env con tus configuraciones
   ```

3. **Configurar credenciales de Google Sheets**

   - Colocar el JSON de la cuenta de servicio (por defecto `facturacion-493302-7c55eb5d5073.json`) en la carpeta `backend/`, o definir `GOOGLE_SERVICE_ACCOUNT_FILE` en `.env`
   - Asegurar permisos de edición en las hojas de cálculo

4. **Instalar dependencias del backend**

   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # En Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

5. **Instalar dependencias del frontend**

   ```bash
   cd ../frontend
   npm install
   ```

6. **Configurar base de datos**
   - Crear base de datos MySQL
   - Ejecutar scripts de migración si es necesario

## 🏃‍♂️ Uso

### Desarrollo Local

1. **Iniciar backend**

   ```bash
   cd backend
   source venv/bin/activate
   uvicorn main:app --reload --port 8008
   ```

2. **Iniciar frontend**

   ```bash
   cd frontend
   npm run dev
   ```

3. **Acceder**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8008
   - Documentación API: http://localhost:8008/docs

### Producción

```bash
# Usar PM2 para gestión de procesos
pm2 start ecosystem.split.config.js
pm2 status
```

#### Reverse proxy HTTPS (443)

La terminación TLS no se configura dentro de este repo; debe realizarse en el servidor web frontal (Nginx/Apache). Asegúrate de:

- `server_name facturador-ima.sistemataup.online;`
- `listen 443 ssl http2;` con `ssl_certificate` y `ssl_certificate_key` correctos
- Proxy hacia backend en `http://127.0.0.1:8008` y frontend en `http://127.0.0.1:3001`
- Encabezados estándar: `X-Forwarded-Proto https`, `X-Forwarded-For`, `Host`
- Política de referentes por defecto del navegador: `strict-origin-when-cross-origin`

Ejemplo mínimo de Nginx (orientativo):

```
server {
    listen 443 ssl http2;
    server_name facturador-ima.sistemataup.online;
    ssl_certificate /etc/letsencrypt/live/facturador-ima.sistemataup.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/facturador-ima.sistemataup.online/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:8008/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    location / {
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Confirma que el certificado y la cadena intermedia estén vigentes.

### Usuario Administrador

- **Usuario**: `Admin*******`
- **Contraseña**: `********`
- **Rol**: Administrador global (accede a todas las empresas)

## 🔧 Configuración Multi-Empresa

### Crear Nueva Empresa

1. Iniciar sesión como administrador
2. Ir a `/admin/empresas`
3. Crear nueva empresa con CUIT y datos fiscales
4. Configurar certificados AFIP
5. Crear usuarios para la empresa

### Aislamiento de Datos

Cada empresa tiene:

- ✅ Usuarios propios
- ✅ Configuración específica
- ✅ Certificados AFIP propios
- ✅ Datos de ventas/ventas aislados
- ✅ Reportes independientes

## 📚 API Documentation

La documentación completa de la API está disponible en `/docs` cuando el backend está ejecutándose.

### Endpoints Principales

- `POST /auth/token` - Autenticación
- `GET /admin/empresas` - Gestión de empresas (admin)
- `POST /facturador/facturar` - Emisión de comprobantes
- `POST /facturador/anular-afip/{factura_id}` - Anulación mediante Nota de Crédito en AFIP (microservicio)
- `GET /boletas` - Gestión de boletas
- `GET /healthz` - Health check

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama para feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

### Guías de Desarrollo

- Seguir PEP 8 para código Python
- Usar ESLint para JavaScript/TypeScript
- Mantener cobertura de tests > 80%
- Documentar nuevas funcionalidades

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Soporte

Para soporte técnico o consultas:

- 📧 Email: soporte@facturacionima.com
- 📱 WhatsApp: +54 9 11 1234-5678
- 🐛 Issues: [GitHub Issues](https://github.com/REPOSITORIO-PROYECTOS/FacturacionIMA/issues)

## 🙏 Agradecimientos

- AFIP por la documentación de Web Services
- Comunidad Open Source por las librerías utilizadas
- Equipo de desarrollo por el esfuerzo continuo

---

**FacturacionIMA** - Facturación electrónica simplificada para empresas argentinas 🇦🇷

## Despliegue / Producción

### (Removido) Stack unificado legacy

El modo unificado (archivo `ecosystem.config.js` + `start_all.sh`) fue deprecado y eliminado para evitar builds innecesarios. Usa exclusivamente la configuración separada (`ecosystem.split.config.js`). Si todavía tienes un proceso `IMA-stack` en PM2, elimínalo:

```bash
pm2 delete IMA-stack || true
```

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

Migrar desde el modo unificado (si aún existe en tu instancia):

```bash
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
- (Deprecado) El antiguo `auth.db` (SQLite) ya no se usa; si queda algún archivo puede eliminarse. Bases \*.db siguen ignoradas por higiene.

## Flujo recomendado de primeras pruebas

1. Copiar `.env.example` a `.env` y ajustar.
2. Colocar el JSON de service account en `backend/` (por defecto `facturacion-493302-7c55eb5d5073.json`) o configurar `GOOGLE_SERVICE_ACCOUNT_FILE` en `.env`.
3. Levantar backend: `pm2 restart IMA-backend` o `uvicorn backend.main:app --reload --port 8008`.
4. Verificar `curl http://localhost:8008/healthz`.
5. Levantar frontend y probar login + facturación + impresión.
