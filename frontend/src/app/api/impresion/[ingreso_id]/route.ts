export async function POST(req: Request) {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const ingreso_id = parts[parts.length - 1] ?? '';
    const token = req.headers?.get('authorization') ?? '';

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8008';
    const target = `${backendUrl}/impresion/${encodeURIComponent(ingreso_id)}/facturar-imagen`;

    const r = await fetch(target, {
        method: 'POST',
        headers: { Authorization: token },
    });

    const blob = await r.blob();
    return new Response(blob, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } });
}
