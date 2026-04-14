module.exports = {
    apps: [
        {
            name: 'FacturacionIMA-backend',
            script: './scripts/backend_start.sh',
            cwd: '/home/dev_taup/proyectos/FacturacionIMA',
            interpreter: 'bash',
            max_restarts: 10,
            restart_delay: 4000,
            env: {
                PYTHONPATH: __dirname,
                BACKEND_PORT: process.env.BACKEND_PORT || '8012',
                STRICT_AFIP_CREDENTIALS: '0',  // Temporalmente deshabilitado para usar bóveda
                INTERNAL_API_KEY: 'D5AW6D1W6A1D6W1D65A1W8D4A6D48WA8F4W86A',
                // Cuenta de servicio Google Sheets (en backend/); prioridad sobre .env si load_dotenv no pisa variables ya definidas
                GOOGLE_SERVICE_ACCOUNT_FILE: 'facturacion-493302-7c55eb5d5073.json'
            }
        },
        {
            name: 'FacturacionIMA-frontend',
            script: './scripts/frontend_start.sh',
            cwd: __dirname,
            interpreter: 'bash',
            max_restarts: 10,
            restart_delay: 4000,
            env: {
                BACKEND_URL: 'http://127.0.0.1:8012',
                BACKEND_INTERNAL_URL: 'http://127.0.0.1:8012',
                NEXT_PUBLIC_BACKEND_URL: '/api',
                FRONTEND_PORT: process.env.FRONTEND_PORT || '3001'
            }
        }
    ]
};
