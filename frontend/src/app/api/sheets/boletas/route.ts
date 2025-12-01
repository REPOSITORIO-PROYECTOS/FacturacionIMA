import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const token = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);

    const tipo = searchParams.get('tipo');
    const limit = searchParams.get('limit') || '300';

    if (!token) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const basesRaw = [
        process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008',
        process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8008',
    ];
    const bases = Array.from(new Set(basesRaw.map(b => b.replace(/\/$/, ''))));
    const host = (() => { try { return new URL(request.url).host } catch { return null } })();
    const params = new URLSearchParams();
    if (tipo) params.append('tipo', tipo);
    params.append('limit', limit);
    const queryStr = params.toString();

    for (const base of bases) {
        try {
            const url = `${base}/sheets/boletas?${queryStr}`;
            try { const h = new URL(url).host; if (host && h === host && base !== process.env.BACKEND_INTERNAL_URL) { throw new Error('skip_same_host'); } } catch {}
            console.log(`[Sheets Boletas] Intentando: ${url}`);

            const res = await fetch(url, {
                headers: { Authorization: token, Accept: 'application/json' },
                referrerPolicy: 'strict-origin-when-cross-origin' as any,
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`[Sheets Boletas] ✓ ${data.length} boletas obtenidas`);
                return NextResponse.json(data);
            }
        } catch (e) {
            console.warn(`[Sheets Boletas] Error con ${base}:`, e);
            // Fallback con prefijo /api si el backend está montado con API_PREFIX
            try {
                const apiUrl = `${base}/api/sheets/boletas?${queryStr}`;
                const res2 = await fetch(apiUrl, {
                    headers: { Authorization: token, Accept: 'application/json' },
                    referrerPolicy: 'strict-origin-when-cross-origin' as any,
                });
                if (res2.ok) {
                    const data = await res2.json();
                    console.log(`[Sheets Boletas] ✓ ${Array.isArray(data) ? data.length : (Array.isArray((data as any)?.items) ? (data as any).items.length : 0)} boletas obtenidas (API_PREFIX)`);
                    return NextResponse.json(data);
                }
            } catch {}
            continue;
        }
    }

    return NextResponse.json({ error: 'No se pudieron obtener boletas desde Sheets' }, { status: 500 });
}
