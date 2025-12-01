// Proxy para boletas protegidas con prevención de recursión y diagnóstico mejorado.
// Problema observado: el frontend recibía {} y la página cliente logueaba "Respuesta no es array {}".
// Posibles causas: (1) Endpoint apuntando al mismo dominio (recursión), (2) El backend responde objeto de error
// o (3) Prefijo /api duplicado ausente/presente generando 404 y fallback devolviendo objeto vacío.
// Estrategia: construir bases dinámicamente, evitar recursion y devolver 206 si la respuesta 200 no es array.

const envBase = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalOverride = process.env.BACKEND_INTERNAL_URL || '';
const fallbackBoletas = internalOverride || 'http://127.0.0.1:8008';

function sanitizeBase(u: string): string { return u.replace(/\/$/, ''); }

export async function GET(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (request.headers.get('x-forwarded-boletas')) {
    return new Response(JSON.stringify({ detail: 'Recursión detectada en proxy /api/boletas' }), { status: 508, headers: { 'Content-Type': 'application/json' } });
  }
  // Pasar parámetros de paginación y tipo
  const url = new URL(request.url);
  const skip = url.searchParams.get("skip") || "0";
  const limit = url.searchParams.get("limit") || "50";
  const tipo = url.searchParams.get("tipo") || "no-facturadas";
  const bases: string[] = [];
  const sanitizedEnv = sanitizeBase(envBase);
  if (sanitizedEnv) bases.push(sanitizedEnv);
  if (!bases.includes(fallbackBoletas)) bases.push(fallbackBoletas);

  const buildEndpoint = (base: string) => {
    // IMPORTANTE: El backend expone /boletas (sin /api) excepto que se haya configurado API_PREFIX global.
    // Para evitar duplicar prefijo erróneo NO agregamos /api aquí.
    if (tipo === 'no-facturadas') return `${base}/boletas?tipo=no-facturadas&ver_todas=true&skip=${skip}&limit=${limit}`;
    if (tipo === 'facturadas') return `${base}/boletas?tipo=facturadas&skip=${skip}&limit=${limit}`;
    return `${base}/boletas?skip=${skip}&limit=${limit}`;
  };

  for (let i = 0; i < bases.length; i++) {
    let base = sanitizeBase(bases[i]);
    const endpoint = buildEndpoint(base);
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-Boletas': '1', Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' as any });
      if (response.status === 404) {
        console.warn(`[api/boletas] 404 en ${endpoint}, probando siguiente base...`);
        // probar variante con API_PREFIX
        const apiEndpoint = endpoint.replace(/\/boletas\?/, '/api/boletas?');
        try {
          const response2 = await fetch(apiEndpoint, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-Boletas': '1', Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' as any });
          if (response2.ok) {
            const text2 = await response2.text();
            const parsed2 = text2 ? JSON.parse(text2) : [];
            return new Response(JSON.stringify(parsed2), { status: response2.status, headers: { 'Content-Type': 'application/json' } });
          }
        } catch {}
        continue;
      }
      let raw = '';
      let parsed: unknown = {};
      try {
        raw = await response.text();
        // Detección temprana de HTML (misconfiguración apunta al frontend)
        const trimmed = raw.trim();
        const looksHtml = /^<!DOCTYPE|<html[\s>]/i.test(trimmed);
        if (looksHtml) {
          console.warn(`[api/boletas] Respuesta HTML inesperada en ${endpoint} (posible NEXT_PUBLIC_BACKEND_URL incorrecta).`);
          if (i < bases.length - 1) continue; // intentar siguiente base
          return new Response(JSON.stringify({ detalle: 'Respuesta HTML inesperada', endpoint, hint: 'Revisar NEXT_PUBLIC_BACKEND_URL o configurar BACKEND_INTERNAL_URL', preview: trimmed.slice(0, 160) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
        }
        parsed = raw ? JSON.parse(raw) : [];
      } catch {
        parsed = {};
      }
      if (response.ok && !Array.isArray(parsed)) {
        // Intentar fallback si no es último intento
        if (i < bases.length - 1) {
          console.warn(`[api/boletas] Objeto recibido en ${endpoint} cuando se esperaba array. Intentando siguiente base...`);
          continue;
        }
        const diag = { detalle: 'Respuesta no es array', esperado: 'array', recibido: typeof parsed, keys: parsed && typeof parsed === 'object' ? Object.keys(parsed as Record<string, unknown>) : [], endpoint };
        return new Response(JSON.stringify(diag), { status: 206, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(parsed), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    } catch (e: unknown) {
      const msg = ((): string => {
        if (e && typeof e === 'object' && 'message' in e) {
          return String((e as { message?: unknown }).message);
        }
        try { return JSON.stringify(e); } catch { return String(e); }
      })();
      console.error(`[api/boletas] error consultando ${endpoint}:`, msg);
      continue;
    }
  }
  return new Response(JSON.stringify({ detail: 'Error de conexión' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
