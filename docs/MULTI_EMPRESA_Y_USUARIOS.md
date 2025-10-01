# Multi-Empresa y Migración de Usuarios

Este documento describe cómo activar el modo multi-empresa, migrar usuarios desde SQLite y preparar el entorno para nuevas compañías que usen el servicio.

## 1. Concepto
Cada `Usuario` apunta a una `Empresa` (campo `id_empresa`). Las facturas, ventas y demás entidades se asocian indirectamente vía usuario o directamente si el modelo incluye `id_empresa`.

## 2. Crear la nueva base dedicada
Si quieres NO tocar la base original legacy:
1. Crea un nuevo schema MySQL:
   ```
   CREATE DATABASE facturacion_ima CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```
2. Ajusta `.env`:
   ```
   NEW_DB_HOST=localhost
   NEW_DB_USER=mi_user
   NEW_DB_PASSWORD=MiClaveSegura
   NEW_DB_NAME=facturacion_ima
   USE_NEW_DB=1
   ```
3. Reinicia el backend. Verás en logs: `Redirigiendo conexión principal a NUEVA BD`.

## 3. Crear tablas en la nueva base
Al iniciar la app con `USE_NEW_DB=1` se usarán los scripts normales (o puedes lanzar un script de creación). Si necesitas forzar creación:
```
python - <<'PY'
from backend.database import create_db_and_tables
create_db_and_tables()
PY
```

## 4. (Deprecado) Migrar usuarios desde SQLite (auth.db)
La migración desde `auth.db` ya no es necesaria; el backend sólo usa MySQL para usuarios y roles. Si conservas `auth.db`, elimínalo.

## 5. Crear nuevas empresas adicionales
Para otra empresa (ej. "OTRA EMPRESA SRL"):
```
python - <<'PY'
from sqlmodel import Session, select
from backend.database import SessionLocal
from backend.modelos import Empresa

with SessionLocal() as s:
    nueva = Empresa(nombre_legal='OTRA EMPRESA SRL', cuit='30123456789', activa=True)
    s.add(nueva)
    s.commit(); s.refresh(nueva)
    print('Creada empresa ID', nueva.id)
PY
```

## 6. Crear usuarios para la nueva empresa
Asignando rol existente (ej. 'Cajero'):
```
python - <<'PY'
from sqlmodel import Session, select
from backend.database import SessionLocal
from backend.modelos import Usuario, Rol
from backend.security import get_password_hash

EMPRESA_ID = 2  # Ajustar
with SessionLocal() as s:
    rol = s.exec(select(Rol).where(Rol.nombre=='Cajero')).first()
    u = Usuario(nombre_usuario='cajero_otro', password_hash=get_password_hash('Clave123'), activo=True, id_rol=rol.id, id_empresa=EMPRESA_ID)
    s.add(u); s.commit(); s.refresh(u)
    print('Usuario creado ID', u.id)
PY
```

## 7. Estrategia de autenticación unificada
Autenticación centralizada 100% en MySQL (tablas `usuarios`, `roles`). SQLite eliminado.

## 8. Separación de datos por empresa
Puntos a reforzar si varias empresas comparten el mismo backend:
- Filtros obligatorios por `id_empresa` en cada query de lectura/escritura sensible.
- Añadir en JWT el `id_empresa` del usuario y usarlo como filtro automático (middleware o dependencia).
- Asegurar que no existan endpoints que devuelven datos globales sin filtrar.

## 9. Próximos pasos recomendados
- Implementar dependencia `obtener_usuario_actual` que cargue también empresa para cada petición.
- Agregar un middleware que, si el usuario está autenticado, añade `X-Empresa-ID` a logs.
- Crear endpoint `/empresas/{id}/usuarios` restringido a roles de administración de esa empresa.

## 10. Rollback
Si algo sale mal, quitar `USE_NEW_DB=1` en `.env` y reiniciar el backend; sigue apuntando a la base legacy.

---
Esto deja listo el terreno para operar multi-empresa sin tocar la base original y con usuarios centralizados en MySQL.
