// Proxy para /api/usuarios hacia el backend
export async function GET(request: Request): Promise<Response> {
    const token = request.headers.get("authorization")?.split(" ")[1] || "";
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
    try {
        const res = await fetch(`${backendUrl}/usuarios/`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        const data = await res.text();
        return new Response(data, {
            status: res.status,
            headers: { "Content-Type": res.headers.get("content-type") || "application/json" }
        });
    } catch {
        return new Response(JSON.stringify({ detail: "Error al conectar con backend" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
