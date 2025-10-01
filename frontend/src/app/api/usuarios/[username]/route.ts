// Proxy dinámico para actualizar usuario (PUT) y desactivar (POST /desactivar).
const primaryBaseUsr = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalBaseUsr = process.env.BACKEND_INTERNAL_URL || '';
const fallbackBaseUsr = internalBaseUsr || 'http://127.0.0.1:8008';
const basesUsr = primaryBaseUsr ? [primaryBaseUsr, fallbackBaseUsr] : [fallbackBaseUsr];

function buildTargets(username: string, verb: 'PUT' | 'POST', isDeactivate: boolean): string[] {
    const suffix = isDeactivate ? `usuarios/${username}/desactivar` : `usuarios/${username}`;
    return basesUsr.flatMap(b => {
        const base = b.replace(/\/+$/, '');
        return [`${base}/${suffix}`, `${base}/api/${suffix}`];
    });
}

async function forward(username: string, request: Request, options: { isDeactivate: boolean, method: 'PUT' | 'POST' }) {
    const auth = request.headers.get('authorization');
    if (!auth) return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let payload: unknown = undefined;
    if (options.method === 'PUT' && !options.isDeactivate) {
        try { payload = await request.json(); } catch { payload = {}; }
    }
    const targets = buildTargets(username, options.method, options.isDeactivate);
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
            const res = await fetch(t, {
                method: options.method,
                headers: { 'Content-Type': 'application/json', Authorization: auth },
                body: options.isDeactivate ? undefined : JSON.stringify(payload)
            });
            const text = await res.text().catch(() => '');
            const trimmed = text.trim();
            if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
                console.warn('[api/usuarios/:username] HTML inesperado', t);
                if (i < targets.length - 1) continue; else return new Response(JSON.stringify({ detail: 'HTML inesperado', endpoint: t }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }
            let data: unknown = {};
            try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
            if (!res.ok && res.status === 404 && i < targets.length - 1) continue;
            return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            console.error('[api/usuarios/:username] error', t, e);
            continue;
        }
    }
    return new Response(JSON.stringify({ detail: 'Error de conexión usuarios (dynamic)' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}

export async function PUT(request: Request, context: any): Promise<Response> {
    return forward(context?.params?.username, request, { isDeactivate: false, method: 'PUT' });
}

export async function POST(request: Request, context: any): Promise<Response> {
    return forward(context?.params?.username, request, { isDeactivate: false, method: 'PUT' });
}
