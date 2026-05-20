#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONT_DIR="$BASE_DIR/frontend"
cd "$FRONT_DIR"

echo "[FRONTEND] Directorio: $FRONT_DIR"

PKG_HASH_FILE=".package.json.hash"
CUR_HASH=$(sha256sum package.json | awk '{print $1}')
OLD_HASH=$(cat "$PKG_HASH_FILE" 2>/dev/null || echo '')

if [ "$CUR_HASH" != "$OLD_HASH" ]; then
  echo "[FRONTEND] Cambios en package.json detectados -> npm install"
  npm install --no-audit --no-fund
  echo "$CUR_HASH" > "$PKG_HASH_FILE"
else
  echo "[FRONTEND] package.json sin cambios; omitiendo npm install"
fi

PORT="${FRONTEND_PORT:-3001}"

# Verificar integridad de build de producción.
NEEDS_BUILD=0

# 1. Forzar rebuild si variable de entorno lo pide
if [ "${FORCE_REBUILD_FRONTEND:-0}" = "1" ]; then
  echo "[FRONTEND] FORCE_REBUILD_FRONTEND=1 -> se forzará reconstrucción"
  NEEDS_BUILD=1
fi

# 2. Faltante de BUILD_ID
if [ ! -f .next/BUILD_ID ]; then
  echo "[FRONTEND] Falta .next/BUILD_ID -> build requerido"
  NEEDS_BUILD=1
fi

# 3. Artefactos críticos
if [ ! -f .next/required-server-files.json ]; then
  echo "[FRONTEND] Falta .next/required-server-files.json -> build incompleto, se regenerará"
  NEEDS_BUILD=1
fi

# 4. Manifest de middleware (si falta, forza rebuild para evitar MODULE_NOT_FOUND)
if [ -d .next ] && [ ! -f .next/server/middleware-manifest.json ]; then
  echo "[FRONTEND] Falta .next/server/middleware-manifest.json -> se forzará rebuild"
  NEEDS_BUILD=1
fi

# 5. routes-manifest.json: dataRoutes debe ser array (evita TypeError en runtime)
if [ -f .next/routes-manifest.json ]; then
  if ! node -e "
    const fs = require('fs');
    const p = '.next/routes-manifest.json';
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(m.dataRoutes)) process.exit(1);
  " 2>/dev/null; then
    echo "[FRONTEND] routes-manifest.json inválido (dataRoutes no es array) -> rebuild"
    NEEDS_BUILD=1
  fi
elif [ -d .next ]; then
  echo "[FRONTEND] Falta .next/routes-manifest.json -> rebuild"
  NEEDS_BUILD=1
fi

if [ "$NEEDS_BUILD" -eq 1 ]; then
  echo "[FRONTEND] Ejecutando build limpio"
  rm -rf .next
  npm run build || { echo "[FRONTEND] ERROR: fallo el build"; exit 1; }
else
  echo "[FRONTEND] Build existente válido. (Usa FORCE_REBUILD_FRONTEND=1 para forzar)"
fi

echo "[FRONTEND] Iniciando Next en puerto $PORT (Localhost)"
exec npm run start -- -p "$PORT" -H 127.0.0.1
