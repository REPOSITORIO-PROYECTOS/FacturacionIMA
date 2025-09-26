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

# Verificar si existe build de producción (.next/BUILD_ID). Si no, ejecutar build.
if [ ! -f .next/BUILD_ID ]; then
  echo "[FRONTEND] No existe build de producción (.next/BUILD_ID). Ejecutando 'npm run build'..."
  npm run build
else
  echo "[FRONTEND] Build existente detectado (.next/BUILD_ID)."
fi

echo "[FRONTEND] Iniciando Next en puerto $PORT"
exec npm run start -- -p "$PORT"
