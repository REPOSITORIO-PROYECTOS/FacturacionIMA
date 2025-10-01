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

    const bases = [
        process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8008',
        process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008',
    ];

    for (const base of bases) {
        try {
            const params = new URLSearchParams();
            if (tipo) params.append('tipo', tipo);
            params.append('limit', limit);
            
            const url = `${base.replace(/\/$/, '')}/sheets/boletas?${params.toString()}`;
            console.log(`[Sheets Boletas] Intentando: ${url}`);
            
            const res = await fetch(url, {
                headers: { Authorization: token },
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`[Sheets Boletas] ✓ ${data.length} boletas obtenidas`);
                return NextResponse.json(data);
            }
        } catch (e) {
            console.warn(`[Sheets Boletas] Error con ${base}:`, e);
            continue;
        }
    }

    return NextResponse.json({ error: 'No se pudieron obtener boletas desde Sheets' }, { status: 500 });
}
