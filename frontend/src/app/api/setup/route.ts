// Proxy para endpoints de gestión de usuarios SQLite
const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
if (!baseURL) {
  console.warn('[api/setup] NEXT_PUBLIC_BACKEND_URL no configurada.');
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "create-user";
  
  try {
    const body = await request.json();
    let endpoint = "";
    let requiresAuth = true;
    
    switch (action) {
      case "create-admin-public":
        endpoint = "/api/setup/create-admin-public";
        requiresAuth = false;
        break;
      case "create-user":
        endpoint = "/api/setup/create-user";
        break;
      default:
        return new Response(JSON.stringify({ detail: "Acción no válida" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (requiresAuth) {
      const token = request.headers.get("authorization")?.split(" ")[1];
      if (!token) {
        return new Response(JSON.stringify({ detail: "Token requerido" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseURL}${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ detail: "Error de conexión" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
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
    const response = await fetch(`${baseURL}/api/setup/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ detail: "Error de conexión" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}