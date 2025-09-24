// Proxy para desactivar usuario /api/usuarios/[username]/desactivar
export async function POST(request: Request): Promise<Response> {
    const token = request.headers.get("authorization")?.split(" ")[1] || "";
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8080";
    const url = new URL(request.url);
    const parts = url.pathname.split("/");
    const idx = parts.findIndex((p) => p === "usuarios");
    const username = idx >= 0 && parts[idx + 1] ? decodeURIComponent(parts[idx + 1]) : "";
    try {
        const res = await fetch(`${backendUrl}/usuarios/${encodeURIComponent(username)}/desactivar`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
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
