// Proxy AFIP reforzado: evita recursión cuando NEXT_PUBLIC_BACKEND_URL apunta al mismo host que el frontend
// y agrega fallback interno (BACKEND_INTERNAL_URL o localhost). También estandariza diagnósticos.
const envBase = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalOverride = process.env.BACKEND_INTERNAL_URL || '';
const fallbackBase = internalOverride || 'http://127.0.0.1:8008';

function sanitize(u: string) { return u.replace(/\/$/, ''); }
function buildBases(incomingHost: string): string[] {
  const bases: string[] = [];
  const sEnv = sanitize(envBase);
  if (sEnv) bases.push(sEnv);
  if (!bases.includes(fallbackBase)) bases.push(fallbackBase);
  // Filtrar hosts que serían recursivos (mismo host que el request) si no hay internalOverride explícito
  return bases.filter(b => {
    try {
      const h = new URL(b).host;
      if (h === incomingHost && !internalOverride) {
        console.warn(`[api/afip] Omitiendo base ${b} (mismo host) para evitar recursión. Configure BACKEND_INTERNAL_URL para forzar.`);
        return false;
      }
    } catch { }
    return true;
  });
}

function composeEndpoint(action: string | null, cuit: string | null, method: 'GET' | 'POST'): string {
  if (method === 'POST') {
    switch (action) {
      case 'generar-csr': return '/api/afip/generar-csr';
      case 'subir-certificado': return '/api/afip/subir-certificado';
      case 'procesar-archivo-completo': return '/api/afip/procesar-archivo-completo';
      case 'configurar-emisor': return '/api/afip/configurar-emisor';
      default: return '';
    }
  } else { // GET
    if (action === 'configuracion-emisor' && cuit) return `/api/afip/configuracion-emisor/${cuit}`;
    if (action === 'condiciones-iva') return '/api/afip/condiciones-iva';
    if (cuit) return `/api/afip/estado/${cuit}`;
    // Por defecto listado de certificados
    return '/api/afip/certificados';
  }
}

function finalizeUrl(base: string, endpoint: string): string {
  const sanitized = sanitize(base);
  if (sanitized.endsWith('/api')) {
    // evitar /api/api/
    return sanitized + endpoint.replace(/^\/api/, '');
  }
  return sanitized + endpoint;
}

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (request.headers.get('x-forwarded-afip')) {
    return new Response(JSON.stringify({ detail: 'Recursión AFIP detectada (loop interno)' }), { status: 508, headers: { 'Content-Type': 'application/json' } });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const endpoint = composeEndpoint(action, url.searchParams.get('cuit'), 'POST');
  if (!endpoint) {
    return new Response(JSON.stringify({ detail: 'Acción no válida' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  let body: unknown = {};
  try { body = await request.json(); } catch { }
  const incomingHost = (() => { try { return new URL(request.url).host; } catch { return ''; } })();
  const bases = buildBases(incomingHost);
  for (const base of bases) {
    const finalUrl = finalizeUrl(base, endpoint);
    try {
      const response = await fetch(finalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Forwarded-Afip': '1' },
        body: JSON.stringify(body)
      });
      if (action === 'generar-csr' && response.ok) {
        const content = await response.text();
        return new Response(content, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-pem-file',
            'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment; filename=csr.pem'
          }
        });
      }
      let parsed: unknown = {};
      try { parsed = await response.json(); } catch { }
      if (!response.ok) {
        // Intentar siguiente base si 404 / 502; para otros códigos devolvemos ya
        if ([404, 502, 503, 500].includes(response.status) && base !== bases[bases.length - 1]) {
          console.warn(`[api/afip] POST fallback tras status ${response.status} en ${finalUrl}`);
          continue;
        }
      }
      return new Response(JSON.stringify(parsed), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[api/afip] Error POST', finalUrl, e);
      continue;
    }
  }
  return new Response(JSON.stringify({ detail: 'Error de conexión AFIP (todas las bases fallaron)', basesIntentadas: bases }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}

export async function GET(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (request.headers.get('x-forwarded-afip')) {
    return new Response(JSON.stringify({ detail: 'Recursión AFIP detectada (loop interno)' }), { status: 508, headers: { 'Content-Type': 'application/json' } });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const cuit = url.searchParams.get('cuit');
  const endpoint = composeEndpoint(action, cuit, 'GET');
  const incomingHost = (() => { try { return new URL(request.url).host; } catch { return ''; } })();
  const bases = buildBases(incomingHost);
  for (const base of bases) {
    const finalUrl = finalizeUrl(base, endpoint);
    try {
      const response = await fetch(finalUrl, { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-Afip': '1' } });
      const text = await response.text();
      let parsed: unknown = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { parseError: true, rawSnippet: text.slice(0, 200) }; }
      if (!response.ok) {
        if ([404, 502, 503, 500].includes(response.status) && base !== bases[bases.length - 1]) {
          console.warn(`[api/afip] GET fallback tras status ${response.status} en ${finalUrl}`);
          continue;
        }
        const errPayload = { status: response.status, endpoint: finalUrl, detalle: 'Backend AFIP devolvió error', bodyType: typeof parsed, keys: parsed && typeof parsed === 'object' ? Object.keys(parsed as Record<string, unknown>) : [], parsed };
        return new Response(JSON.stringify(errPayload), { status: response.status, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(parsed), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      console.error('[api/afip] Error GET', finalUrl, e);
      continue;
    }
  }
  return new Response(JSON.stringify({ detail: 'Error de conexión AFIP (todas las bases fallaron)', basesIntentadas: bases }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}