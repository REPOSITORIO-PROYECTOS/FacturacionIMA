const envBasePack = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalPack = process.env.BACKEND_INTERNAL_URL || '';
const fallbackPack = internalPack || 'http://127.0.0.1:8008';

function nb(b: string) { return b.replace(/\/$/, ''); }

export async function POST(req: Request) {
    const auth = req.headers.get('authorization');
    if (!auth) return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    const ingreso_ids = await req.json().catch(() => []);
    if (!Array.isArray(ingreso_ids) || ingreso_ids.length === 0) {
        return new Response(JSON.stringify({ detail: 'Se requiere lista de ingreso_ids' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const incomingHost = (() => { try { return new URL(req.url).host; } catch { return ''; } })();
    const bases: string[] = [];
    const envN = nb(envBasePack);
    if (envN) bases.push(envN);
    if (!bases.includes(fallbackPack)) bases.push(fallbackPack);
    for (let i = 0; i < bases.length; i++) {
        const base = bases[i];
        try {
            const host = new URL(base).host;
            if (host === incomingHost && !internalPack) {
                console.warn('[api/impresion/pack] Omitiendo base recursiva', base);
                continue;
            }
        } catch { }
        const target = `${nb(base)}/impresion/pack-imagenes`;
        try {
            const r = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: auth, 'X-Forwarded-Impresion': '1' }, body: JSON.stringify(ingreso_ids) });
            const ct = r.headers.get('content-type') || '';
            const looksHtml = ct.includes('text/html');
            if (looksHtml) {
                if (i < bases.length - 1) { console.warn('[api/impresion/pack] HTML inesperado intentando fallback'); continue; }
                return new Response(JSON.stringify({ detail: 'Respuesta HTML inesperada', endpoint: target }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }
            if (!r.ok && [404, 500, 502, 503].includes(r.status) && i < bases.length - 1) {
                console.warn(`[api/impresion/pack] Status ${r.status} fallback...`);
                continue;
            }
            const blob = await r.blob();
            return new Response(blob, { status: r.status, headers: { 'content-type': ct || 'application/zip', 'content-disposition': r.headers.get('content-disposition') || 'attachment; filename="boletas_imagenes.zip"' } });
        } catch (e) {
            console.error('[api/impresion/pack] Error', target, e);
            if (i < bases.length - 1) continue;
            return new Response(JSON.stringify({ detail: 'Error de conexión pack', endpoint: target, bases }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
    return new Response(JSON.stringify({ detail: 'No se pudo generar pack (todas las bases fallaron)', bases }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
