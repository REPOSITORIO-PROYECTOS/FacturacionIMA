// Proxy para login: usa NEXT_PUBLIC_BACKEND_URL (obligatoria en prod)
const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
if (!baseURL) {
  console.warn('[api/auth] NEXT_PUBLIC_BACKEND_URL no configurada. Configure .env.local en desarrollo o variables en prod.');
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const { username, password } = body;
  try {
  const response = await fetch(`${baseURL}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username, password }),
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
