#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$REPO_DIR/deploy_$(date +%Y%m%d_%H%M%S).log"
APP_NAME="IMA-stack"

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

log "Reiniciando proceso PM2 $APP_NAME"
pm2 restart "$APP_NAME" --update-env | tee -a "$LOG_FILE"

log "Mostrando estado PM2"
pm2 status | tee -a "$LOG_FILE"

log "Logs recientes (20 líneas)"
pm2 logs "$APP_NAME" --lines 20 | tee -a "$LOG_FILE" || true

log "Finalizado OK"
