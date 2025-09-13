// Proxy para login (conexión directa al backend remoto)
const baseURL = "https://facturador-ima.sistemataup.online";

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
