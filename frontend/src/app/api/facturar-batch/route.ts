// Endpoint alternativo para facturación batch que evita el patrón /api/facturador/* (algunos proxies lo bloquean)
export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.split(' ')[1] || '';
  const internal = process.env.BACKEND_INTERNAL_URL?.trim();
  const publicBase = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  const fallbackLocal = 'http://127.0.0.1:8008';
  const bases = [internal, publicBase, fallbackLocal].filter(Boolean) as string[];
  const body = await request.text();
  const attempts: any[] = [];
  for (const rawBase of bases) {
    const base = rawBase.replace(/\/$/, '');
    const candidates = [
      `${base}/facturador/facturar-por-cantidad`,
      `${base}/api/facturador/facturar-por-cantidad`,
    ];
    for (const target of candidates) {
      try {
        const res = await fetch(target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : ''
          },
          body
        });
        const txt = await res.text();
        const ct = res.headers.get('content-type') || '';
        const html = /<html[\s>]/i.test(txt) || ct.includes('text/html');
        attempts.push({ target, status: res.status, html });
        if (html || res.status === 404 || res.status === 405) continue;
        return new Response(txt, { status: res.status, headers: { 'Content-Type': ct || 'application/json', 'X-Attempts': JSON.stringify(attempts) } });
      } catch (e: any) {
        attempts.push({ target, error: String(e) });
        continue;
      }
    }
  }
  return new Response(JSON.stringify({ detail: 'No se pudo facturar (batch alt)', attempts }), { status: 502, headers: { 'Content-Type': 'application/json' } });
}

// GET de diagnóstico rápido: muestra bases evaluadas y variables
export async function GET(): Promise<Response> {
  const internal = process.env.BACKEND_INTERNAL_URL?.trim();
  const publicBase = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  const payload = {
    msg: 'diagnostico facturar-batch',
    BACKEND_INTERNAL_URL: internal,
    NEXT_PUBLIC_BACKEND_URL: publicBase,
    hint: 'El POST prueba /facturador/facturar-por-cantidad y /api/facturador/facturar-por-cantidad sobre cada base',
    now: new Date().toISOString()
  };
  return new Response(JSON.stringify(payload, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
