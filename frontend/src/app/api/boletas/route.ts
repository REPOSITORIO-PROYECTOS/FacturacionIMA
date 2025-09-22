// Proxy para boletas protegidas: usa NEXT_PUBLIC_BACKEND_URL con fallback local si no responde correctamente.
const primaryBoletas = process.env.NEXT_PUBLIC_BACKEND_URL;
const fallbackBoletas = 'http://127.0.0.1:8008';
const boletasBases = primaryBoletas ? [primaryBoletas, fallbackBoletas] : [fallbackBoletas];
if (!primaryBoletas) {
  console.warn('[api/boletas] NEXT_PUBLIC_BACKEND_URL no configurada — usando fallback local.');
} else {
  console.log(`[api/boletas] Usando backend primario ${primaryBoletas} con fallback ${fallbackBoletas}`);
}

export async function GET(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Pasar parámetros de paginación y tipo
  const url = new URL(request.url);
  const skip = url.searchParams.get("skip") || "0";
  const limit = url.searchParams.get("limit") || "50";
  const tipo = url.searchParams.get("tipo") || "no-facturadas";
  const buildEndpoint = (base: string) => {
    if (tipo === 'no-facturadas') return `${base}/boletas/obtener-no-facturadas?skip=${skip}&limit=${limit}`;
    if (tipo === 'facturadas') return `${base}/boletas/obtener-facturadas?skip=${skip}&limit=${limit}`;
    return `${base}/boletas/obtener-todas?skip=${skip}&limit=${limit}`;
  };
  for (const base of boletasBases) {
    const endpoint = buildEndpoint(base);
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 404) {
        console.warn(`[api/boletas] 404 en ${endpoint}, probando siguiente base...`);
        continue;
      }
      const data = await response.json().catch(() => ({}));
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
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
