// Proxy para endpoint de tablas protegidas: usa NEXT_PUBLIC_BACKEND_URL (obligatoria en prod)
const baseURL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';
if (!baseURL) {
  console.warn('[api/tablas] NEXT_PUBLIC_BACKEND_URL no configurada. Configure .env.local en desarrollo o variables en prod.');
}

// Adaptación: ahora el endpoint devuelve las "tablas" únicas extraídas de las boletas
export async function GET(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    // Pedimos todas las boletas y extraemos las tablas únicas
    const response = await fetch(`${baseURL}/boletas/obtener-todas?skip=0&limit=1000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const boletas = await response.json();
    // Extraer tablas únicas
  const nombres: string[] = [];
    if (Array.isArray(boletas)) {
      for (const r of boletas) {
        let val = null;
        for (const key of ["tabla", "TABLA", "Tabla"]) {
          if (r[key] && r[key] !== "") {
            val = String(r[key]).trim();
            break;
          }
        }
        if (val && !nombres.includes(val)) nombres.push(val);
      }
    }
    const resultado = nombres.map((nombre, idx) => ({ id: idx + 1, nombre }));
    return new Response(JSON.stringify(resultado), {
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
