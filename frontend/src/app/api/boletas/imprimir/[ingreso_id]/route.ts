import { getBackendInternalBase, joinBackendUrl } from '@/lib/backendUrl';

export async function POST(req: Request) {
    // Extraer ingreso_id desde la URL: /api/boletas/imprimir/{ingreso_id}
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const ingreso_id = parts[parts.length - 1] ?? '';
    const token = req.headers?.get('authorization') ?? '';
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const target = joinBackendUrl(
        getBackendInternalBase(),
        `/boletas/${encodeURIComponent(ingreso_id)}/facturar-e-imprimir`
    );

    const r = await fetch(target, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            Authorization: token,
        },
        body: JSON.stringify(body),
    });

    const text = await r.text();
    return new Response(text, { status: r.status, headers: { 'content-type': 'text/html' } });
}
