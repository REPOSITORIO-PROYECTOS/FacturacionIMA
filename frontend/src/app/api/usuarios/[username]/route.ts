// Proxy dinámico para /api/usuarios/[username] hacia el backend
export async function PUT(request: Request): Promise<Response> {
    const token = request.headers.get("authorization")?.split(" ")[1] || "";
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
    const url = new URL(request.url);
    const parts = url.pathname.split("/");
    const idx = parts.findIndex((p) => p === "usuarios");
    const username = idx >= 0 && parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : "";
    try {
        const body = await request.text();
        const res = await fetch(`${backendUrl}/usuarios/${encodeURIComponent(username)}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body,
        });
        const data = await res.text();
        return new Response(data, {
            status: res.status,
            headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
        });
    } catch {
        return new Response(JSON.stringify({ detail: "Error al conectar con backend" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
