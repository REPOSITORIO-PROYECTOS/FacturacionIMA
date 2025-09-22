#!/bin/bash

# Script de AutoStart para FacturacionIMA
# Autor: GitHub Copilot
# Fecha: 19 de Septiembre 2025
# Propósito: Activar y relanzar automáticamente todos los servicios del sistema

set -e  # Salir en caso de error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función de logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Directorio base del proyecto
PROJECT_DIR="/home/sgi_user/proyectos/FacturacionIMA"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

# Verificar que estemos en el directorio correcto
if [ ! -d "$PROJECT_DIR" ]; then
    error "Directorio del proyecto no encontrado: $PROJECT_DIR"
fi

cd "$PROJECT_DIR"

log "🚀 Iniciando AutoStart de FacturacionIMA..."

# ==========================================
# 1. VERIFICAR DEPENDENCIAS DEL SISTEMA
# ==========================================
log "📋 Verificando dependencias del sistema..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    error "Node.js no está instalado. Por favor instalar Node.js 18+ antes de continuar."
fi

# Verificar npm
if ! command -v npm &> /dev/null; then
    error "npm no está instalado. Por favor instalar npm antes de continuar."
fi

# Verificar Python
if ! command -v python3 &> /dev/null; then
    error "Python 3 no está instalado. Por favor instalar Python 3.8+ antes de continuar."
fi

# Verificar PM2
if ! command -v pm2 &> /dev/null; then
    warn "PM2 no está instalado. Instalando PM2 globalmente..."
    npm install -g pm2 || error "No se pudo instalar PM2"
fi

info "✅ Todas las dependencias del sistema están disponibles"

# ==========================================
# 2. DETENER SERVICIOS EXISTENTES
# ==========================================
log "🛑 Deteniendo servicios existentes..."

# Detener PM2 si está corriendo
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true

# Matar procesos Node.js que puedan estar corriendo
pkill -f "node.*next" 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
pkill -f "python.*main.py" 2>/dev/null || true

# Esperar un momento para que los procesos terminen
sleep 2

info "✅ Servicios existentes detenidos"

# ==========================================
# 3. PREPARAR BACKEND
# ==========================================
log "🐍 Preparando backend Python..."

cd "$BACKEND_DIR"

# Crear/activar entorno virtual
if [ ! -d "venv" ]; then
    info "Creando entorno virtual de Python..."
    python3 -m venv venv
fi

# Activar entorno virtual
source venv/bin/activate

# Instalar/actualizar dependencias
info "Instalando dependencias del backend..."
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1

info "✅ Backend preparado correctamente"

# ==========================================
# 4. PREPARAR FRONTEND
# ==========================================
log "📦 Preparando frontend Next.js..."

cd "$FRONTEND_DIR"

# Instalar dependencias de Node.js
info "Instalando dependencias del frontend..."
npm install > /dev/null 2>&1

# Construir aplicación para producción
info "Construyendo aplicación frontend..."
npm run build > /dev/null 2>&1

info "✅ Frontend preparado correctamente"

# ==========================================
# 5. CONFIGURAR PM2
# ==========================================
log "⚙️ Configurando PM2 para auto-restart..."

cd "$PROJECT_DIR"

# Crear configuración PM2 con auto-restart
cat > ecosystem.autostart.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'IMA-backend',
      script: 'python',
      args: '-m uvicorn backend.main:app --host 0.0.0.0 --port 8008',
      cwd: '/home/sgi_user/proyectos/FacturacionIMA',
      interpreter: '/home/sgi_user/proyectos/FacturacionIMA/backend/venv/bin/python',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        PYTHONPATH: '/home/sgi_user/proyectos/FacturacionIMA',
        NODE_ENV: 'production'
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    },
    {
      name: 'IMA-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/home/sgi_user/proyectos/FacturacionIMA/frontend',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true,
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000
    }
  ]
};
EOF

# ==========================================
# 6. CREAR DIRECTORIO DE LOGS
# ==========================================
mkdir -p logs

# ==========================================
# 7. INICIAR SERVICIOS CON PM2
# ==========================================
log "🚀 Iniciando servicios con PM2..."

# Iniciar con configuración de auto-restart
pm2 start ecosystem.autostart.config.js

# Guardar configuración PM2 para reinicio automático del sistema
pm2 save

# Configurar PM2 para iniciarse automáticamente al reiniciar el servidor
pm2 startup systemd -u $USER --hp $HOME 2>/dev/null || true

info "✅ Servicios iniciados con auto-restart habilitado"

# ==========================================
# 8. VERIFICAR ESTADO DE SERVICIOS
# ==========================================
log "🔍 Verificando estado de los servicios..."

sleep 5  # Dar tiempo a que los servicios se inicien

# Mostrar estado de PM2
pm2 status

# Verificar conectividad del backend
info "Probando conectividad del backend..."
for i in {1..10}; do
    if curl -s http://localhost:8008/saludo > /dev/null 2>&1; then
        info "✅ Backend respondiendo correctamente en puerto 8008"
        break
    else
        if [ $i -eq 10 ]; then
            error "❌ Backend no responde después de 10 intentos"
        fi
        warn "Esperando backend... intento $i/10"
        sleep 3
    fi
done

# Verificar conectividad del frontend
info "Probando conectividad del frontend..."
for i in {1..10}; do
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        info "✅ Frontend respondiendo correctamente en puerto 3001"
        break
    else
        if [ $i -eq 10 ]; then
            error "❌ Frontend no responde después de 10 intentos"
        fi
        warn "Esperando frontend... intento $i/10"
        sleep 3
    fi
done

# ==========================================
# 9. CONFIGURAR REINICIO AUTOMÁTICO DEL SISTEMA
# ==========================================
log "🔄 Configurando reinicio automático del sistema..."

# Crear script de inicio que se ejecuta al arrancar el servidor
cat > /tmp/facturacionima-autostart.service << EOF
[Unit]
Description=FacturacionIMA AutoStart Service
After=network.target

[Service]
Type=forking
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$PROJECT_DIR/autostart.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Intentar instalar el servicio systemd (puede requerir sudo)
if command -v systemctl &> /dev/null; then
    info "Configurando servicio systemd para inicio automático..."
    if sudo cp /tmp/facturacionima-autostart.service /etc/systemd/system/ 2>/dev/null; then
        sudo systemctl daemon-reload 2>/dev/null
        sudo systemctl enable facturacionima-autostart 2>/dev/null
        info "✅ Servicio systemd configurado (se iniciará automáticamente al reiniciar)"
    else
        warn "⚠️ No se pudo configurar systemd (permisos insuficientes). El sistema se reiniciará manualmente."
    fi
else
    warn "⚠️ systemctl no disponible. Usando solo PM2 para auto-restart."
fi

# ==========================================
# 10. MOSTRAR INFORMACIÓN FINAL
# ==========================================
log "🎉 ¡AutoStart completado exitosamente!"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 FACTURACIONIMA ACTIVADO                  ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  🌐 Frontend: ${BLUE}http://localhost:3001${GREEN}                  ║${NC}"
echo -e "${GREEN}║  🔧 Backend:  ${BLUE}http://localhost:8008${GREEN}                  ║${NC}"
echo -e "${GREEN}║  📚 API Docs: ${BLUE}http://localhost:8008/docs${GREEN}             ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  👤 Usuario:  admin                                     ║${NC}"
echo -e "${GREEN}║  🔐 Password: admin123                                  ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                    CARACTERÍSTICAS                      ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  ✅ Auto-restart habilitado                            ║${NC}"
echo -e "${GREEN}║  ✅ Logging automático                                 ║${NC}"
echo -e "${GREEN}║  ✅ Monitoreo con PM2                                  ║${NC}"
echo -e "${GREEN}║  ✅ Inicio automático del sistema                      ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"

echo ""
log "📋 Comandos útiles:"
echo "  • pm2 status          - Ver estado de servicios"
echo "  • pm2 logs            - Ver logs en tiempo real"
echo "  • pm2 restart all     - Reiniciar todos los servicios"
echo "  • pm2 stop all        - Detener todos los servicios"
echo "  • pm2 monit           - Monitor interactivo"

echo ""
log "🔧 En caso de problemas:"
echo "  • Logs backend:  tail -f logs/backend-combined.log"
echo "  • Logs frontend: tail -f logs/frontend-combined.log"
echo "  • Reiniciar:     ./autostart.sh"

echo ""
log "🎯 ¡El sistema está listo para usar! Accede a http://localhost:3001"

exit 0