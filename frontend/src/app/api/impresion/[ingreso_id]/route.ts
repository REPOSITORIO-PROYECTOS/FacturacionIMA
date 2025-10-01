// Proxy multi-base para facturar e imprimir una imagen de boleta.
// Problema original: 405 por recursión (NEXT_PUBLIC_BACKEND_URL apunta al frontend, se llamaba /impresion/... en el propio front donde no existe esa ruta).
// Solución: fallback a BACKEND_INTERNAL_URL o localhost, detección de HTML y diagnóstico estructurado.

const envBaseImp = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalImp = process.env.BACKEND_INTERNAL_URL || '';
const fallbackImp = internalImp || 'http://127.0.0.1:8008';

function normBase(b: string) { return b.replace(/\/$/, ''); }

export async function POST(req: Request) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const ingreso_id = parts[parts.length - 1] ?? '';
    if (!ingreso_id) {
        return new Response(JSON.stringify({ detail: 'Falta ingreso_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const auth = req.headers.get('authorization');
    if (!auth) {
        return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const incomingHost = (() => { try { return new URL(req.url).host; } catch { return ''; } })();
    const bases: string[] = [];
    const nEnv = normBase(envBaseImp);
    if (nEnv) bases.push(nEnv);
    if (!bases.includes(fallbackImp)) bases.push(fallbackImp);

    for (let i = 0; i < bases.length; i++) {
        let base = bases[i];
        try {
            const host = new URL(base).host;
            if (host === incomingHost && !internalImp) {
                console.warn(`[api/impresion/:id] Omitiendo base recursiva ${base}`);
                continue;
            }
        } catch { }
        const target = `${normBase(base)}/impresion/${encodeURIComponent(ingreso_id)}/facturar-imagen`;
        try {
            const r = await fetch(target, { method: 'POST', headers: { Authorization: auth, 'X-Forwarded-Impresion': '1' } });
            const buffer = await r.arrayBuffer();
            // Detección HTML (si se llamó al frontend en vez del backend retornará HTML y content-type text/html)
            const ct = r.headers.get('content-type') || '';
            const looksHtml = ct.includes('text/html');
            if (looksHtml) {
                if (i < bases.length - 1) {
                    console.warn(`[api/impresion/:id] HTML inesperado desde ${target} intentando fallback...`);
                    continue;
                }
                return new Response(JSON.stringify({ detail: 'Respuesta HTML inesperada', endpoint: target, hint: 'Ajustar NEXT_PUBLIC_BACKEND_URL', contentType: ct }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }
            // Si backend devuelve error, intentar fallback para ciertos códigos
            if (!r.ok && [404, 500, 502, 503].includes(r.status) && i < bases.length - 1) {
                console.warn(`[api/impresion/:id] Status ${r.status} en ${target}, fallback siguiente base...`);
                continue;
            }
            const headers = new Headers();
            headers.set('content-type', ct || 'application/octet-stream');
            const cd = r.headers.get('content-disposition');
            if (cd) headers.set('content-disposition', cd); else headers.set('content-disposition', `attachment; filename="comprobante_${ingreso_id}.jpg"`);
            return new Response(buffer, { status: r.status, headers });
        } catch (e) {
            console.error('[api/impresion/:id] Error fetch', target, e);
            if (i < bases.length - 1) continue;
            return new Response(JSON.stringify({ detail: 'Error de conexión impresión', endpoint: target, basesIntentadas: bases }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
    return new Response(JSON.stringify({ detail: 'No se pudo resolver impresión (todas las bases fallaron)', bases }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
