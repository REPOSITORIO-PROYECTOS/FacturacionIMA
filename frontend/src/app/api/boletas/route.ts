// Proxy para boletas protegidas: usa NEXT_PUBLIC_BACKEND_URL (obligatoria en prod)
const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
if (!baseURL) {
  console.warn('[api/boletas] NEXT_PUBLIC_BACKEND_URL no configurada. Configure .env.local en desarrollo o variables en prod.');
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
  let endpoint = '';
  if (tipo === "no-facturadas") endpoint = `${baseURL}/boletas/obtener-no-facturadas?skip=${skip}&limit=${limit}`;
  else if (tipo === "facturadas") endpoint = `${baseURL}/boletas/obtener-facturadas?skip=${skip}&limit=${limit}`;
  else endpoint = `${baseURL}/boletas/obtener-todas?skip=${skip}&limit=${limit}`;
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ detail: "Error de conexión" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
