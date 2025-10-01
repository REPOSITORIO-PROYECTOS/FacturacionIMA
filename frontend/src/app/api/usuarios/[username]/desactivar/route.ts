// Dedicated endpoint to deactivate user: POST -> backend /usuarios/{username}/desactivar (or /api/...)
const primaryBaseUsrD = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalBaseUsrD = process.env.BACKEND_INTERNAL_URL || '';
const fallbackBaseUsrD = internalBaseUsrD || 'http://127.0.0.1:8008';
const basesUsrD = primaryBaseUsrD ? [primaryBaseUsrD, fallbackBaseUsrD] : [fallbackBaseUsrD];

function buildTargetsD(username: string): string[] {
    const suffix = `usuarios/${username}/desactivar`;
    return basesUsrD.flatMap(b => {
        const base = b.replace(/\/+$/, '');
        return [`${base}/${suffix}`, `${base}/api/${suffix}`];
    });
}

// Nota: Se usa `any` para el segundo argumento por limitación de firma interna de Next que valida la estructura.
export async function POST(request: Request, context: any): Promise<Response> {
    const params = context?.params || {};
    const auth = request.headers.get('authorization');
    if (!auth) return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    const targets = buildTargetsD(params.username);
    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        try {
            const res = await fetch(t, { method: 'POST', headers: { Authorization: auth } });
            const text = await res.text().catch(() => '');
            const trimmed = text.trim();
            if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) { if (i < targets.length - 1) continue; else return new Response(JSON.stringify({ detail: 'HTML inesperado', endpoint: t }), { status: 502, headers: { 'Content-Type': 'application/json' } }); }
            let data: unknown = {};
            try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
            if (!res.ok && res.status === 404 && i < targets.length - 1) continue;
            return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            console.error('[api/usuarios/:username/desactivar] error', t, e);
            continue;
        }
    }
    return new Response(JSON.stringify({ detail: 'Error de conexión usuarios (desactivar)' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
