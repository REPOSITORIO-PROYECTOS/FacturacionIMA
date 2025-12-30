import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const token = request.headers.get('authorization');
    const { searchParams } = new URL(request.url);

    const tipo = searchParams.get('tipo');
    const limit = searchParams.get('limit') || '50';

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
    // Copiar todos los parámetros de la petición original para no perder filtros
    for (const [key, value] of searchParams.entries()) {
        if (value !== null && value !== undefined) {
            params.set(key, value);
        }
    }
    // Asegurar 'tipo' y 'limit' si faltan
    if (tipo && !params.has('tipo')) params.set('tipo', tipo);
    if (!params.has('limit')) params.set('limit', limit);
    const queryStr = params.toString();

    for (const base of bases) {
        try {
            const url = `${base}/sheets/boletas?${queryStr}`;
            try { const h = new URL(url).host; /* allow same host, backend might be under same domain */ } catch { }
            console.log(`[Sheets Boletas] Intentando: ${url}`);

            const res = await fetch(url, {
                headers: { Authorization: token, Accept: 'application/json' },
                referrerPolicy: 'strict-origin-when-cross-origin' as any,
            });

            if (res.ok) {
                const data = await res.json();
                const count = Array.isArray(data) ? data.length : (data?.data?.length || 0);
                console.log(`[Sheets Boletas] ✓ ${count} boletas obtenidas`);
                return NextResponse.json(data);
            }

            // Propagar errores de autenticación inmediatamente
            if (res.status === 401 || res.status === 403) {
                const errTxt = await res.text().catch(() => 'No autorizado');
                return NextResponse.json({ error: errTxt }, { status: res.status });
            }

            if (res.status === 404) {
                const apiUrl = `${base}/api/sheets/boletas?${queryStr}`;
                console.log(`[Sheets Boletas] 404 en ruta base, intentando: ${apiUrl}`);
                const res2 = await fetch(apiUrl, {
                    headers: { Authorization: token, Accept: 'application/json' },
                    referrerPolicy: 'strict-origin-when-cross-origin' as any,
                });
                if (res2.ok) {
                    const data = await res2.json();
                    console.log(`[Sheets Boletas] ✓ Datos obtenidos (API_PREFIX)`);
                    return NextResponse.json(data);
                }
                if (res2.status === 401 || res2.status === 403) {
                    const errTxt = await res2.text().catch(() => 'No autorizado');
                    return NextResponse.json({ error: errTxt }, { status: res2.status });
                }
            }
        } catch (e) {
            console.warn(`[Sheets Boletas] Error con ${base}:`, e);
            continue;
        }
    }

    return NextResponse.json({ error: 'No se pudieron obtener boletas desde Sheets' }, { status: 500 });
}
