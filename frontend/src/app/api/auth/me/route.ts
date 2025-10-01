// Proxy GET /api/auth/me -> backend /auth/me (o /api/auth/me) con fallback
// Similar a /api/auth login pero solo lectura y requiere Authorization.
const primaryBase = process.env.NEXT_PUBLIC_BACKEND_URL;
const internalBase = process.env.BACKEND_INTERNAL_URL;
const fallbackBase = internalBase || 'http://127.0.0.1:8008';
const baseCandidates = primaryBase ? [primaryBase, fallbackBase] : [fallbackBase];

function joinUrl(base: string, path: string) {
    return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

export async function GET(request: Request): Promise<Response> {
    const auth = request.headers.get('authorization');
    if (!auth) {
        return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const endpoints: string[] = [];
    for (const base of baseCandidates) {
        endpoints.push(joinUrl(base, '/auth/me'));
        endpoints.push(joinUrl(base, '/api/auth/me'));
    }
    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, { headers: { Authorization: auth } });
            const text = await res.text().catch(() => '');
            // Detectar HTML erróneo
            const looksLikeHtml = /^<!DOCTYPE|<html[\s>]/i.test(text.trim());
            if (looksLikeHtml) {
                console.warn('[api/auth/me] Respuesta HTML inesperada en', endpoint);
                continue;
            }
            let data: unknown = {};
            try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
            if (!res.ok) {
                if (res.status === 404) { continue; }
                return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            console.error('[api/auth/me] Error consultando', endpoint, e);
            continue;
        }
    }
    return new Response(JSON.stringify({ detail: 'No se pudo resolver /auth/me en ningún backend candidato', bases: baseCandidates }), { status: 502, headers: { 'Content-Type': 'application/json' } });
}
