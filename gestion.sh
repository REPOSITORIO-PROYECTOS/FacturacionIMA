#!/bin/bash

# Script de Gestión Rápida para FacturacionIMA
# Autor: GitHub Copilot
# Propósito: Comandos rápidos para operaciones diarias del sistema

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

PROJECT_DIR="/home/sgi_user/proyectos/FacturacionIMA"

show_help() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║              FACTURACIONIMA - GESTIÓN RÁPIDA             ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Comandos disponibles:${NC}"
    echo ""
    echo -e "  ${YELLOW}./gestion.sh start${NC}     - Iniciar sistema completo"
    echo -e "  ${YELLOW}./gestion.sh stop${NC}      - Detener todos los servicios"
    echo -e "  ${YELLOW}./gestion.sh restart${NC}   - Reiniciar todos los servicios"
    echo -e "  ${YELLOW}./gestion.sh status${NC}    - Ver estado de servicios"
    echo -e "  ${YELLOW}./gestion.sh logs${NC}      - Ver logs en tiempo real"
    echo -e "  ${YELLOW}./gestion.sh monitor${NC}   - Monitor interactivo PM2"
    echo ""
    echo -e "  ${YELLOW}./gestion.sh backend${NC}   - Solo gestionar backend"
    echo -e "  ${YELLOW}./gestion.sh frontend${NC}  - Solo gestionar frontend"
    echo ""
    echo -e "  ${YELLOW}./gestion.sh clean${NC}     - Limpiar archivos temporales"
    echo -e "  ${YELLOW}./gestion.sh update${NC}    - Actualizar dependencias"
    echo -e "  ${YELLOW}./gestion.sh health${NC}    - Verificar salud del sistema"
    echo ""
    echo -e "  ${YELLOW}./gestion.sh help${NC}      - Mostrar esta ayuda"
    echo ""
    echo -e "${GREEN}URLs del sistema:${NC}"
    echo -e "  🌐 Frontend: ${BLUE}http://localhost:3001${NC}"
    echo -e "  🔧 Backend:  ${BLUE}http://localhost:8008${NC}"
    echo -e "  📚 API Docs: ${BLUE}http://localhost:8008/docs${NC}"
    echo ""
}

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        error "PM2 no está instalado. Ejecuta './autostart.sh' primero."
        exit 1
    fi
}

start_services() {
    log "🚀 Iniciando servicios..."
    check_pm2
    
    if [ -f "$PROJECT_DIR/ecosystem.autostart.config.js" ]; then
        cd "$PROJECT_DIR"
        pm2 start ecosystem.autostart.config.js
        log "✅ Servicios iniciados"
    else
        warn "Configuración de PM2 no encontrada. Ejecutando autostart completo..."
        ./autostart.sh
    fi
}

stop_services() {
    log "🛑 Deteniendo servicios..."
    check_pm2
    pm2 delete all 2>/dev/null || true
    log "✅ Servicios detenidos"
}

restart_services() {
    log "🔄 Reiniciando servicios..."
    check_pm2
    pm2 restart all
    log "✅ Servicios reiniciados"
}

show_status() {
    log "📊 Estado de servicios:"
    check_pm2
    pm2 status
    echo ""
    
    # Verificar conectividad
    if curl -s http://localhost:8008/saludo > /dev/null 2>&1; then
        info "✅ Backend: Conectado (puerto 8008)"
    else
        error "❌ Backend: No responde (puerto 8008)"
    fi
    
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        info "✅ Frontend: Conectado (puerto 3001)"
    else
        error "❌ Frontend: No responde (puerto 3001)"
    fi
}

show_logs() {
    log "📋 Mostrando logs en tiempo real..."
    check_pm2
    pm2 logs
}

show_monitor() {
    log "📈 Abriendo monitor interactivo..."
    check_pm2
    pm2 monit
}

manage_backend() {
    log "🐍 Gestionando solo backend..."
    check_pm2
    
    case "${2:-restart}" in
        start)
            pm2 start IMA-backend
            ;;
        stop)
            pm2 stop IMA-backend
            ;;
        restart)
            pm2 restart IMA-backend
            ;;
        logs)
            pm2 logs IMA-backend
            ;;
        *)
            pm2 restart IMA-backend
            ;;
    esac
}

manage_frontend() {
    log "📦 Gestionando solo frontend..."
    check_pm2
    
    case "${2:-restart}" in
        start)
            pm2 start IMA-frontend
            ;;
        stop)
            pm2 stop IMA-frontend
            ;;
        restart)
            pm2 restart IMA-frontend
            ;;
        logs)
            pm2 logs IMA-frontend
            ;;
        *)
            pm2 restart IMA-frontend
            ;;
    esac
}

clean_system() {
    log "🧹 Limpiando archivos temporales..."
    
    cd "$PROJECT_DIR"
    
    # Limpiar logs antiguos
    if [ -d "logs" ]; then
        find logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
        log "🗑️ Logs antiguos eliminados"
    fi
    
    # Limpiar cache de Next.js
    if [ -d "frontend/.next" ]; then
        rm -rf frontend/.next
        log "🗑️ Cache de Next.js eliminado"
    fi
    
    # Limpiar __pycache__
    find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
    log "🗑️ Cache de Python eliminado"
    
    # Limpiar node_modules si es necesario (solo en caso de problemas)
    # rm -rf frontend/node_modules
    
    log "✅ Limpieza completada"
}

update_system() {
    log "🔄 Actualizando dependencias..."
    
    cd "$PROJECT_DIR"
    
    # Actualizar backend
    log "🐍 Actualizando backend..."
    cd backend
    source venv/bin/activate
    pip install --upgrade pip > /dev/null 2>&1
    pip install -r requirements.txt --upgrade > /dev/null 2>&1
    cd ..
    
    # Actualizar frontend
    log "📦 Actualizando frontend..."
    cd frontend
    npm update > /dev/null 2>&1
    cd ..
    
    log "✅ Dependencias actualizadas"
    warn "⚠️ Recomendación: Reinicia los servicios con './gestion.sh restart'"
}

health_check() {
    log "🏥 Verificando salud del sistema..."
    
    echo ""
    info "📊 VERIFICACIÓN DE SERVICIOS:"
    
    # PM2 Status
    if command -v pm2 &> /dev/null; then
        pm2 status | grep -E "(IMA-backend|IMA-frontend)" || warn "PM2: Servicios no encontrados"
    else
        error "PM2: No instalado"
    fi
    
    echo ""
    info "🌐 VERIFICACIÓN DE CONECTIVIDAD:"
    
    # Backend Health
    if curl -s http://localhost:8008/saludo > /dev/null 2>&1; then
        info "✅ Backend: OK (puerto 8008)"
    else
        error "❌ Backend: No responde"
    fi
    
    # Frontend Health
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        info "✅ Frontend: OK (puerto 3001)"
    else
        error "❌ Frontend: No responde"
    fi
    
    echo ""
    info "💾 VERIFICACIÓN DE ARCHIVOS:"
    
    # Verificar archivos críticos
    files_to_check=(
        "backend/main.py"
        "frontend/package.json"
        "ecosystem.autostart.config.js"
        "auth.db"
    )
    
    for file in "${files_to_check[@]}"; do
        if [ -f "$PROJECT_DIR/$file" ]; then
            info "✅ $file: Existe"
        else
            error "❌ $file: No encontrado"
        fi
    done
    
    echo ""
    info "📊 USO DE RECURSOS:"
    
    # Memoria y CPU
    if command -v free &> /dev/null; then
        echo "💾 Memoria:"
        free -h | grep -E "(Mem|Swap)"
    fi
    
    if command -v top &> /dev/null; then
        echo "🖥️ CPU (top 3 procesos):"
        top -bn1 | grep -E "(node|python|uvicorn)" | head -3
    fi
    
    echo ""
    log "✅ Verificación de salud completada"
}

# Función principal
main() {
    cd "$PROJECT_DIR" 2>/dev/null || {
        error "No se puede acceder al directorio del proyecto: $PROJECT_DIR"
        exit 1
    }
    
    case "${1:-help}" in
        start)
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            restart_services
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        monitor)
            show_monitor
            ;;
        backend)
            manage_backend "$@"
            ;;
        frontend)
            manage_frontend "$@"
            ;;
        clean)
            clean_system
            ;;
        update)
            update_system
            ;;
        health)
            health_check
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "Comando no reconocido: $1"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Ejecutar función principal con todos los argumentos
main "$@"