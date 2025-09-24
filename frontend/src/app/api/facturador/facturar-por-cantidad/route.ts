// Proxy para /api/facturador/facturar-por-cantidad hacia el backend
export async function POST(request: Request): Promise<Response> {
    const token = request.headers.get("authorization")?.split(" ")[1] || "";
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8008";
    const url = new URL(request.url);
    const maxWorkers = url.searchParams.get("max_parallel_workers");
    const endpoint = new URL(`${backendUrl}/facturador/facturar-por-cantidad`);
    if (maxWorkers) endpoint.searchParams.set("max_parallel_workers", maxWorkers);
    try {
        const body = await request.text(); // El backend espera un array JSON como body
        const res = await fetch(endpoint.toString(), {
            method: "POST",
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
