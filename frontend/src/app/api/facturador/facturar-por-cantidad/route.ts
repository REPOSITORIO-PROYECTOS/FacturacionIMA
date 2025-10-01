// Proxy robusto para /api/facturador/facturar-por-cantidad
// Incluye:
//  - Preferencia por BACKEND_INTERNAL_URL si existe
//  - Fallback automático probando con y sin prefijo /api
//  - Detección de respuesta HTML (config errónea) y mensaje claro
//  - Query param debug=1 para devolver metadata de la prueba
//  - Header X-Proxy para trazar en logs backend
export async function POST(request: Request): Promise<Response> {
    const started = Date.now();
    const originalUrl = request.url;
    const token = request.headers.get('authorization')?.split(' ')[1] || '';
    const clientHost = ((): string | null => {
        try { return new URL(request.url).host; } catch { return null; }
    })();

    // Bases en orden de preferencia
    const internal = process.env.BACKEND_INTERNAL_URL?.trim();
    const publicBase = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
    const fallbackLocal = 'http://127.0.0.1:8008';

    const bases = [internal, publicBase, fallbackLocal].filter(Boolean) as string[];
    // Sanitizar barras finales
    const uniqBases: string[] = [];
    for (const b of bases) {
        const clean = b!.replace(/\/$/, '');
        if (!uniqBases.includes(clean)) uniqBases.push(clean);
    }

    // Para cada base probamos dos rutas: sin /api y con /api (para ambientes con API_PREFIX)
    const urlObj = new URL(request.url);
    const maxWorkers = urlObj.searchParams.get('max_parallel_workers');
    const wantDebug = urlObj.searchParams.get('debug') === '1';

    const attempted: Array<{ target: string; status?: number; html?: boolean; error?: string }> = [];

    const bodyText = await request.text();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout defensivo

    console.log('[facturar-proxy] INIT', { bases: uniqBases, originalUrl, maxWorkers, lenBody: bodyText.length });

    try {
        for (const base of uniqBases) {
            const candidates = [
                `${base}/facturador/facturar-por-cantidad`,
                `${base}/api/facturador/facturar-por-cantidad`,
            ];
            for (const rawTarget of candidates) {
                // Evitar recursión: si base apunta al mismo host del front y no es internal, saltar
                try {
                    const h = new URL(rawTarget).host;
                    if (clientHost && h === clientHost && base !== internal) {
                        attempted.push({ target: rawTarget, error: 'same_host_skipped' });
                        continue;
                    }
                } catch { /* noop */ }

                const targetUrl = new URL(rawTarget);
                if (maxWorkers) targetUrl.searchParams.set('max_parallel_workers', maxWorkers);
                let res: Response | null = null;
                let text: string | null = null;
                try {
                    const targetStr = targetUrl.toString();
                    res = await fetch(targetStr, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: token ? `Bearer ${token}` : '',
                            'X-Proxy': 'facturar-por-cantidad',
                        },
                        body: bodyText,
                        signal: controller.signal,
                    });
                    const ct = res.headers.get('content-type') || '';
                    // Obtenemos texto siempre para poder detectar HTML / reenviar
                    text = await res.text();
                    const looksHTML = /<html[\s>]/i.test(text) || ct.startsWith('text/html');
                    attempted.push({ target: targetUrl.toString(), status: res.status, html: looksHTML });
                    console.log('[facturar-proxy] TRY', { target: targetStr, status: res.status, html: looksHTML, ct });

                    if (looksHTML) {
                        // Config incorrecta o recursión; probamos siguiente candidate
                        continue;
                    }
                    if (res.status === 404 || res.status === 405) {
                        // Intentar siguiente candidato
                        continue;
                    }
                    // Éxito (o error de negocio 422/500 que igualmente viene del backend legítimo)
                    const headers = new Headers();
                    headers.set('Content-Type', ct || 'application/json');
                    if (wantDebug) headers.set('X-Debug-Attempts', JSON.stringify(attempted));
                    console.log('[facturar-proxy] SUCCESS', { target: targetStr, status: res.status, attempts: attempted.length, elapsed: Date.now() - started });
                    return new Response(text, { status: res.status, headers });
                } catch (e: any) {
                    attempted.push({ target: targetUrl.toString(), error: String(e && e.name === 'AbortError' ? 'timeout' : e) });
                    console.warn('[facturar-proxy] ERROR_ATTEMPT', { target: targetUrl.toString(), error: String(e) });
                    continue;
                }
            }
        }
    } finally {
        clearTimeout(timeout);
    }

    // Si llegamos aquí, no hubo respuesta válida
    const payloadPreview = ((): any => {
        try {
            const parsed = JSON.parse(bodyText);
            if (Array.isArray(parsed)) {
                return parsed.slice(0, 3).map(p => ({ id: p?.id, total: p?.total, cuit: p?.cliente_data?.cuit_o_dni }));
            }
            return parsed;
        } catch { return 'no-json'; }
    })();

    const respBody = {
        detail: 'No se pudo entregar la solicitud de facturación al backend (todas las variantes fallaron).',
        attempts: attempted,
        hint: 'Verifique NEXT_PUBLIC_BACKEND_URL y/o defina BACKEND_INTERNAL_URL apuntando al backend real. Si backend monta con API_PREFIX=/api, asegure que la URL base NO lo duplique.',
        elapsed_ms: Date.now() - started,
        preview: payloadPreview,
    };
    console.error('[facturar-proxy] ALL_FAILED', respBody);
    return new Response(JSON.stringify(respBody, null, 2), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
    });
}
