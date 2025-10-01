/* Proxy /api/me -> backend /auth/me utilizando session_token de cookie.
   Devuelve 401 si no hay cookie o si el backend responde no OK.
*/

const primaryBase = process.env.NEXT_PUBLIC_BACKEND_URL;
const fallbackBase = 'http://127.0.0.1:8008';
const baseCandidates = primaryBase ? [primaryBase, fallbackBase] : [fallbackBase];

function joinUrl(base: string, path: string) {
    return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

export async function GET(request: Request): Promise<Response> {
    const cookie = request.headers.get('cookie') || '';
    const match = cookie.match(/(?:^|; )session_token=([^;]+)/);
    if (!match) {
        return new Response(JSON.stringify({ detail: 'No autenticado (falta session_token)' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const token = decodeURIComponent(match[1]);

    for (const base of baseCandidates) {
        const url = joinUrl(base, '/auth/me');
        try {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
            const text = await res.text().catch(() => '');
            let data: unknown = text;
            try { data = JSON.parse(text); } catch { /* plain text */ }
            if (res.status === 404) continue; // probar siguiente base
            if (!res.ok) {
                // Si backend responde 401/403, cortar (token inválido)
                if ([401, 403].includes(res.status)) {
                    return new Response(JSON.stringify({ detail: 'Token inválido o expirado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
                }
                // Otro error -> intentar siguiente base
                continue;
            }
            // En caso exitoso, retornamos data normalizada
            return new Response(typeof data === 'string' ? data : JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            // Intentar siguiente base
            continue;
        }
    }
    return new Response(JSON.stringify({ detail: 'No se pudo obtener identidad' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
}
