#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BASE_DIR"

echo "[BACKEND] Base: $BASE_DIR"

REQ_FILE="$BASE_DIR/backend/requirements.txt"
VENV_DIR="$BASE_DIR/backend/venv"
STAMP_FILE="$VENV_DIR/.requirements.hash"
echo "[BACKEND] Forzado: usando backend/venv únicamente"

python3 --version >/dev/null 2>&1 || { echo "[BACKEND] Python3 no está disponible"; exit 1; }

if [ ! -d "$VENV_DIR" ]; then
  echo "[BACKEND] Creando venv en $VENV_DIR"; python3 -m venv "$VENV_DIR"; "$VENV_DIR/bin/pip" install --upgrade pip;
fi

NEEDS_INSTALL=0
if [ ! -f "$STAMP_FILE" ]; then
  NEEDS_INSTALL=1
else
  CUR_HASH=$(sha256sum "$REQ_FILE" | awk '{print $1}')
  OLD_HASH=$(cat "$STAMP_FILE" || echo '')
  if [ "$CUR_HASH" != "$OLD_HASH" ]; then NEEDS_INSTALL=1; fi
fi

if [ "$NEEDS_INSTALL" -eq 1 ]; then
  echo "[BACKEND] Instalando dependencias (cambio detectado)";
  "$VENV_DIR/bin/pip" install --no-cache-dir -r "$REQ_FILE" || { echo "[BACKEND] Falló pip install"; exit 1; }
  sha256sum "$REQ_FILE" | awk '{print $1}' > "$STAMP_FILE"
else
  echo "[BACKEND] Dependencias sin cambios; omitiendo reinstall"
fi

export PYTHONPATH="$BASE_DIR"
export STRICT_AFIP_CREDENTIALS=0

HOST="${BACKEND_HOST:-127.0.0.1}"
PORT="${BACKEND_PORT:-8008}"

echo "[BACKEND] Iniciando uvicorn en $HOST:$PORT"
exec "$VENV_DIR/bin/python" -u -m uvicorn backend.main:app --host "$HOST" --port "$PORT"
