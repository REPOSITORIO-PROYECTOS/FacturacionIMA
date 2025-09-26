// Proxy para /api/boletas/repartidores -> backend /boletas/repartidores
const primaryBoletas = process.env.NEXT_PUBLIC_BACKEND_URL;
const fallbackBoletas = 'http://127.0.0.1:8008';
const boletasBases = primaryBoletas ? [primaryBoletas, fallbackBoletas] : [fallbackBoletas];
if (!primaryBoletas) {
    console.warn('[api/boletas/repartidores] NEXT_PUBLIC_BACKEND_URL no configurada — usando fallback local.');
} else {
    console.log(`[api/boletas/repartidores] Usando backend primario ${primaryBoletas} con fallback ${fallbackBoletas}`);
}

export async function GET(request: Request): Promise<Response> {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
        return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    for (const base of boletasBases) {
        const endpoint = `${base}/boletas/repartidores`;
        try {
            const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
            if (response.status === 404) {
                console.warn(`[api/boletas/repartidores] 404 en ${endpoint}, probando siguiente base...`);
                continue;
            }
            const data = await response.json().catch(() => ({}));
            return new Response(JSON.stringify(data), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e) {
            console.error(`[api/boletas/repartidores] error consultando ${endpoint}:`, e);
            continue;
        }
    }

    return new Response(JSON.stringify({ detail: 'Error de conexión' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
