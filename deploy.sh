#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$REPO_DIR/deploy_$(date +%Y%m%d_%H%M%S).log"
APP_NAME="IMA-backend"

log(){ echo "[DEPLOY] $*" | tee -a "$LOG_FILE" ; }

log "Directorio del repo: $REPO_DIR"
cd "$REPO_DIR"

if [ -n "${VIRTUAL_ENV:-}" ]; then
  log "Desactivando virtualenv actual (para evitar contaminar)."
  deactivate || true
fi

log "Guardando cambios locales no commit?"
if [ -n "$(git status --porcelain)" ]; then
  log "ATENCIÓN: Hay cambios locales sin commit. Se intentará stash."
  git stash push -u -m "pre-deploy-$(date +%s)" | tee -a "$LOG_FILE" || true
else
  log "Sin cambios locales sueltos."
fi

log "Obteniendo último estado remoto"
git fetch --all --prune | tee -a "$LOG_FILE"

log "Rebase con origin/main"
git checkout main | tee -a "$LOG_FILE"
git pull --rebase origin main | tee -a "$LOG_FILE"

CURRENT_HASH=$(git rev-parse --short HEAD)
log "Commit desplegado: $CURRENT_HASH"

log "Asegurando ecosistema dividido (backend + frontend)"
if pm2 describe IMA-backend >/dev/null 2>&1; then
  log "Reiniciando backend (IMA-backend)"
  pm2 restart IMA-backend --update-env | tee -a "$LOG_FILE"
else
  log "Backend no encontrado, iniciando ecosistema split"
  pm2 start ecosystem.split.config.js --only IMA-backend | tee -a "$LOG_FILE"
fi

if pm2 describe IMA-frontend >/dev/null 2>&1; then
  log "(Opcional) Reinicia frontend manualmente si hubo cambios en frontend/"
else
  log "Frontend no cargado, puedes iniciarlo con: pm2 start ecosystem.split.config.js --only IMA-frontend"
fi

log "Mostrando estado PM2"
pm2 status | tee -a "$LOG_FILE"

log "Logs recientes (20 líneas)"
pm2 logs IMA-backend --lines 20 | tee -a "$LOG_FILE" || true

log "Finalizado OK"
