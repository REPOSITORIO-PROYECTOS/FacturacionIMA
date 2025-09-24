/* eslint-disable @typescript-eslint/no-explicit-any */
// Proxy para login: usa NEXT_PUBLIC_BACKEND_URL si existe, con fallback local.
const primaryBase = process.env.NEXT_PUBLIC_BACKEND_URL;
const fallbackBase = 'http://127.0.0.1:8008';
const baseCandidates = primaryBase ? [primaryBase, fallbackBase] : [fallbackBase];
if (!primaryBase) {
  console.warn('[api/auth] NEXT_PUBLIC_BACKEND_URL no configurada — usando sólo fallback local.');
} else {
  console.log(`[api/auth] Usando backend primario ${primaryBase} con fallback ${fallbackBase}`);
}

function joinUrl(base: string, path: string) {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

export async function POST(request: Request): Promise<Response> {
  // Aceptamos JSON { username, password } desde el frontend y lo transformamos
  const body = await request.json().catch(() => ({}));
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');

  // Construir lista combinada de endpoints de autenticación para cada base candidate
  const endpoints: string[] = [];
  for (const base of baseCandidates) {
    endpoints.push(joinUrl(base, '/auth/token'));
    endpoints.push(joinUrl(base, '/api/auth/token'));
  }

  for (const endpoint of endpoints) {
    console.log(`[api/auth] probando endpoint ${endpoint}`);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }),
      });

      const text = await response.text().catch(() => '');
      let data: unknown = { detail: text };
      try { data = JSON.parse(text); } catch { /* silent */ }

      // Si el backend devolvió HTML (por ejemplo el front-end por error), detectarlo y fallar rápido
      const preview = (typeof text === 'string' ? text.trim().slice(0, 2000) : '');
      const looksLikeHtml = typeof preview === 'string' && (preview.startsWith('<!DOCTYPE') || /<html[\s>]/i.test(preview));
      if (looksLikeHtml) {
        // Si el primario responde HTML (p. ej. devuelve la app en lugar de la API),
        // registrar y continuar para intentar el siguiente endpoint (fallback local).
        console.error(`[api/auth] respuesta inesperada (HTML) desde ${endpoint}. status=${response.status}. preview=${preview.slice(0,200)}`);
        // intentar siguiente candidato en la lista en lugar de devolver 502
        continue;
      }

      // Normalizar `detail` si viene como array de errores (pydantic)
      const normalizeDetail = (d: unknown) => {
        if (d === null || d === undefined) return '';
        if (typeof d === 'string') return d;
        if (Array.isArray(d)) {
          try {
            // Mapear a mensajes "campo: mensaje"
            const parts = d.map((err) => {
              const e = err as any;
              const loc = Array.isArray(e?.loc) ? e.loc.join('.') : String(e?.loc || '');
              const msg = e?.msg || e?.message || JSON.stringify(e);
              return loc ? `${loc}: ${msg}` : String(msg);
            });
            return parts.join(' | ');
          } catch {
            return JSON.stringify(d);
          }
        }
        // Caso genérico: stringify
        try { return String(d); } catch { return JSON.stringify(d); }
      };

      if (typeof data === 'object' && data !== null && 'detail' in data) {
        const dObj: any = data;
        dObj.detail = normalizeDetail(dObj.detail);
        data = dObj;
      }

      // Si 404 probamos siguiente endpoint (podría ser base equivocada)
      if (response.status === 404) {
        console.warn(`[api/auth] endpoint 404, intentando siguiente: ${endpoint}`);
        continue;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // Si autenticación exitosa, setear cookie HttpOnly (8h TTL aprox)
      if (response.ok && typeof data === 'object' && data && 'access_token' in data) {
        const tokenVal = (data as any).access_token;
        const maxAge = 60 * 60 * 8; // 8 horas
        headers['Set-Cookie'] = `session_token=${tokenVal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
      }
      return new Response(JSON.stringify(data), { status: response.status || 200, headers });
    } catch (err) {
      // Intentar el siguiente candidato y loguear detalle completo para depuración
      try {
        const e = err as unknown;
        let msg = String(e);
        if (typeof e === 'object' && e !== null) {
          try {
            const eo: any = e;
            msg = eo?.stack || eo?.message || JSON.stringify(eo);
          } catch {
            msg = String(e);
          }
        }
        console.error(`[api/auth] fallo al conectar con ${endpoint}: ${msg}`);
      } catch (logErr) {
        console.error('[api/auth] fallo al imprimir error de conexión', String(logErr));
      }
      continue;
    }
  }

  return new Response(JSON.stringify({ detail: 'Error de conexión con el backend' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET informativo (evitar 404 al cargar /api/auth en navegador)
export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({
    detail: 'Use POST con { username, password } para obtener token OAuth2',
    bases: baseCandidates
  }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}
