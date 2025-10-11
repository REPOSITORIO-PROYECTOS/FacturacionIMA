# Plan de Migración a Multi-Tenant para FacturacionIMA

## Objetivo

Adaptar la aplicación existente (que ya tiene soporte multi-empresa en modelos) para funcionar correctamente con múltiples empresas, asegurando que no se pierdan datos actuales y que el usuario admin global tenga acceso completo.

## Estado Actual

✅ **Modelos ya preparados**: La base de datos ya tiene las tablas `empresas`, `configuracion_empresa` y todas las entidades principales tienen `id_empresa`.
✅ **Backend parcialmente listo**: Los modelos están correctos, falta asegurar filtros por empresa en todas las consultas.
✅ **Frontend básico**: Páginas de administración creadas, necesitan ajustes para usar modelos reales.

---

## Fases Actualizadas

### 1. Preparación y Limpieza de Datos

- Ejecutar script `asegurar_admin.py` para crear usuario admin global: **AdminFacturacion** (contraseña: **Soporte123**)
- Asignar empresa por defecto a todos los registros existentes sin `id_empresa`
- Verificar integridad de datos con `test_multiempresa.py`

### 2. Adaptación del Backend

- Asegurar que todas las consultas en blueprints incluyan filtro `WHERE id_empresa = ?` basado en usuario logueado
- Implementar middleware o dependencias para inyectar automáticamente el filtro de empresa
- Actualizar endpoints de administración para usar modelos existentes

### 3. Adaptación del Frontend

- Ajustar páginas de administración para consumir endpoints correctos
- Implementar navegación basada en permisos (admin global vs admin de empresa)

### 4. Pruebas y Validación

- Probar creación/edición de empresas
- Verificar aislamiento de datos entre empresas
- Probar acceso de usuario admin global

---

## Usuario Admin Global

- **Nombre de usuario**: AdminFacturacion
- **Contraseña**: Soporte123
- **Permisos**: Acceso completo a todas las empresas y configuraciones

---

## Scripts Disponibles

1. `asegurar_admin.py`: Crea/asegura usuario admin global
2. `test_multiempresa.py`: Verifica estado de multi-empresa
3. `admin_empresa.py`: Blueprint para administración (ya registrado)

---

> **Nota**: No se requiere migración de base de datos ya que los modelos ya soportan multi-empresa. Solo limpieza y aseguramiento de datos.
