module.exports = {
    apps: [
        {
            name: 'IMA-backend',
            script: './scripts/backend_start.sh',
            cwd: __dirname,
            interpreter: 'bash',
            max_restarts: 10,
            restart_delay: 4000,
            env: {
                PYTHONPATH: __dirname,
                BACKEND_PORT: process.env.BACKEND_PORT || '8008',
                STRICT_AFIP_CREDENTIALS: '0'  // Temporalmente deshabilitado para usar bóveda
            }
        },
        {
            name: 'IMA-frontend',
            script: './scripts/frontend_start.sh',
            cwd: __dirname,
            interpreter: 'bash',
            max_restarts: 10,
            restart_delay: 4000,
            env: {
                BACKEND_URL: 'http://127.0.0.1:8008',
                NEXT_PUBLIC_BACKEND_URL: '/api',
                FRONTEND_PORT: process.env.FRONTEND_PORT || '3001'
            }
        }
    ]
};
