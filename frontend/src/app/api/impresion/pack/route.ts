export async function POST(req: Request) {
    const token = req.headers?.get('authorization') ?? '';
    const body = await req.json().catch(() => []);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8008';
    const target = `${backendUrl}/impresion/pack-imagenes`;

    const r = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
    });

    const blob = await r.blob();
    return new Response(blob, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } });
}
