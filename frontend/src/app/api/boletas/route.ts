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
  const incomingHost = (() => { try { return new URL(request.url).host; } catch { return ''; } })();
  const bases: string[] = [];
  const sanitizedEnv = sanitizeBase(envBase);
  if (sanitizedEnv) bases.push(sanitizedEnv);
  if (!bases.includes(fallbackBoletas)) bases.push(fallbackBoletas);

  const buildEndpoint = (base: string) => {
    // IMPORTANTE: El backend expone /boletas (sin /api) excepto que se haya configurado API_PREFIX global.
    // Para evitar duplicar prefijo erróneo NO agregamos /api aquí.
    if (tipo === 'no-facturadas') return `${base}/boletas?tipo=no-facturadas&skip=${skip}&limit=${limit}`;
    if (tipo === 'facturadas') return `${base}/boletas?tipo=facturadas&skip=${skip}&limit=${limit}`;
    return `${base}/boletas?skip=${skip}&limit=${limit}`;
  };

  for (let base of bases) {
    base = sanitizeBase(base);
    try {
      const h = new URL(base).host;
      if (h === incomingHost && !internalOverride) {
        console.warn(`[api/boletas] Saltando base ${base} (mismo host ${incomingHost}) para evitar recursion. Configure BACKEND_INTERNAL_URL.`);
        continue;
      }
    } catch { }
    const endpoint = buildEndpoint(base);
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-Boletas': '1' } });
      if (response.status === 404) {
        console.warn(`[api/boletas] 404 en ${endpoint}, probando siguiente base...`);
        continue;
      }
      let raw = '';
      let parsed: unknown = {};
      try {
        raw = await response.text();
        parsed = raw ? JSON.parse(raw) : [];
      } catch {
        parsed = {};
      }
      if (response.ok && !Array.isArray(parsed)) {
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
