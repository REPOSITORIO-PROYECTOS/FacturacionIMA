import { getBackendServerBases, joinBackendUrl } from '@/lib/backendUrl';

const bases = getBackendServerBases();

export async function GET(request: Request): Promise<Response> {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    for (const base of bases) {
        const endpoint = joinBackendUrl(base, '/boletas/resumen-no-facturadas');
        try {
            const r = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
            if (r.status === 404) continue;
            const data = await r.json().catch(() => ({}));
            return new Response(JSON.stringify(data), { status: r.status, headers: { 'Content-Type': 'application/json' } });
        } catch {
            continue;
        }
    }
    return new Response(JSON.stringify({ detail: 'Error de conexión' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
