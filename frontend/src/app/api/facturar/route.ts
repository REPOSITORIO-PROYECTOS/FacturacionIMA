// Proxy para facturación de boleta
import type { FacturarPayload, FacturarResponse } from "../../types/facturar";
// Conexión directa al backend remoto
const baseURL = "https://facturador-ima.sistemataup.online";

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get("authorization")?.split(" ")[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const body: FacturarPayload = await request.json();
  try {
  const response = await fetch(`${baseURL}/api/facturador/facturar-por-cantidad`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data: FacturarResponse = await response.json();
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
