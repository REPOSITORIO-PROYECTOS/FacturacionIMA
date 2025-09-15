// Proxy para endpoint de tablas protegidas: usa NEXT_PUBLIC_BACKEND_URL (obligatoria en prod)
const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
if (!baseURL) {
  console.warn('[api/tablas] NEXT_PUBLIC_BACKEND_URL no configurada. Configure .env.local en desarrollo o variables en prod.');
}

export async function GET(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
  const response = await fetch(`${baseURL}/api/tablas`, {
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
