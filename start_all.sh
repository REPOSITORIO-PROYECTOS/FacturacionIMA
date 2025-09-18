#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[STACK] Directorio base: $BASE_DIR"

if command -v git >/dev/null 2>&1 && [ -d "$BASE_DIR/.git" ]; then
  GIT_HASH=$(git -C "$BASE_DIR" rev-parse --short HEAD 2>/dev/null || echo "no-git")
  echo "[STACK] Commit actual: $GIT_HASH"
fi

echo "[STACK] Preparando backend (venv)"
if [ ! -d "$BASE_DIR/backend/venv" ]; then
  python3 -m venv "$BASE_DIR/backend/venv"
  "$BASE_DIR/backend/venv/bin/pip" install --upgrade pip
fi

echo "[STACK] Reinstalando dependencias backend (forzado para asegurar versiones)"
"$BASE_DIR/backend/venv/bin/pip" install --no-cache-dir -r "$BASE_DIR/backend/requirements.txt"

echo "[STACK] Instalando dependencias frontend"
cd "$BASE_DIR/frontend"
npm install --no-audit --no-fund

echo "[STACK] Construyendo frontend (next build)"
npm run build

echo "[STACK] Iniciando backend (uvicorn)"
"$BASE_DIR/backend/venv/bin/python3" -m uvicorn backend.main:app --host 0.0.0.0 --port 8008 &
BACK_PID=$!
echo "[STACK] Backend PID: $BACK_PID"

echo "[STACK] Iniciando frontend (next start)"
npm run start -- -p 3001 &
FRONT_PID=$!
echo "[STACK] Frontend PID: $FRONT_PID"

trap 'echo "[STACK] Terminando procesos"; kill $BACK_PID $FRONT_PID 2>/dev/null || true' INT TERM EXIT

echo "[STACK] Esperando que uno de los procesos termine..."
wait -n || true
echo "[STACK] Un proceso finalizó, cerrando stack";
kill $BACK_PID $FRONT_PID 2>/dev/null || true
wait 2>/dev/null || true
echo "[STACK] Stack detenido"
