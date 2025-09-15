// Proxy para endpoints AFIP
const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
if (!baseURL) {
  console.warn('[api/afip] NEXT_PUBLIC_BACKEND_URL no configurada.');
}

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  
  try {
    const body = await request.json();
    let endpoint = "";
    
    switch (action) {
      case "generar-csr":
        endpoint = "/api/afip/generar-csr";
        break;
      case "subir-certificado":
        endpoint = "/api/afip/subir-certificado";
        break;
      default:
        return new Response(JSON.stringify({ detail: "Acción no válida" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
    }

    const response = await fetch(`${baseURL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (action === "generar-csr" && response.ok) {
      // Para CSR, devolver el archivo directamente
      const content = await response.text();
      return new Response(content, {
        status: 200,
        headers: {
          "Content-Type": "application/x-pem-file",
          "Content-Disposition": response.headers.get("Content-Disposition") || "attachment; filename=csr.pem",
        },
      });
    }

    const data = await response.json().catch(() => ({}));
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

  const url = new URL(request.url);
  const cuit = url.searchParams.get("cuit");
  
  try {
    let endpoint = "/api/afip/certificados";
    if (cuit) {
      endpoint = `/api/afip/estado/${cuit}`;
    }

    const response = await fetch(`${baseURL}${endpoint}`, {
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