// Lista de usuarios con fallback multi-base y detección de HTML erróneo
const primaryBaseU = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalBaseU = process.env.BACKEND_INTERNAL_URL || '';
const fallbackBaseU = internalBaseU || 'http://127.0.0.1:8008';
const basesUsuarios = primaryBaseU ? [primaryBaseU, fallbackBaseU] : [fallbackBaseU];

function join(base: string, path: string) { return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, ''); }

export async function GET(request: Request): Promise<Response> {
    const auth = request.headers.get('authorization');
    if (!auth) return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    const endpoints = basesUsuarios.flatMap(b => [join(b, 'usuarios/'), join(b, 'api/usuarios/')]);
    for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        try {
            const res = await fetch(ep, { headers: { Authorization: auth } });
            const text = await res.text().catch(() => '');
            const trimmed = text.trim();
            if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
                console.warn('[api/usuarios] HTML inesperado en', ep);
                if (i < endpoints.length - 1) continue; else return new Response(JSON.stringify({ detail: 'Respuesta HTML inesperada', endpoint: ep }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }
            let parsed: unknown = [];
            try { parsed = text ? JSON.parse(text) : []; } catch { parsed = []; }
            if (res.ok && !Array.isArray(parsed)) {
                if (i < endpoints.length - 1) continue;
                return new Response(JSON.stringify({ detail: 'Respuesta no es array', endpoint: ep, tipo: typeof parsed }), { status: 206, headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify(parsed), { status: res.status, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            console.error('[api/usuarios] error', ep, e);
            continue;
        }
    }
    return new Response(JSON.stringify({ detail: 'Error de conexión usuarios' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}

// Creación de usuarios (POST) -> backend /usuarios (o /api/usuarios) esperando {username,password,rol}
export async function POST(request: Request): Promise<Response> {
    const auth = request.headers.get('authorization');
    if (!auth) return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    let body: any = {};
    try { body = await request.json(); } catch { body = {}; }
    // Normalizar campos desde el frontend modal (puede venir nombre_usuario / rol_nombre)
    const username = (body.username || body.nombre_usuario || '').trim();
    const password = body.password || body.pass || '';
    const rol = body.rol || body.rol_nombre || 'Cajero';
    if (!username || !password) {
        return new Response(JSON.stringify({ detail: 'username y password requeridos' }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
    const payload = { username, password, rol };
    const endpoints = basesUsuarios.flatMap(b => [join(b, 'usuarios/'), join(b, 'api/usuarios/')]);
    for (let i = 0; i < endpoints.length; i++) {
        const ep = endpoints[i];
        try {
            const res = await fetch(ep, { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const text = await res.text().catch(() => '');
            const trimmed = text.trim();
            if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
                console.warn('[api/usuarios POST] HTML inesperado en', ep);
                if (i < endpoints.length - 1) continue; else return new Response(JSON.stringify({ detail: 'Respuesta HTML inesperada', endpoint: ep }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }
            let parsed: unknown = {};
            try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
            if (!res.ok && res.status === 404 && i < endpoints.length - 1) continue;
            return new Response(JSON.stringify(parsed), { status: res.status, headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
            console.error('[api/usuarios POST] error', ep, e);
            continue;
        }
    }
    return new Response(JSON.stringify({ detail: 'Error de conexión creando usuario' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}

