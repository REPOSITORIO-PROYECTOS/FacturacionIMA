import { NextRequest, NextResponse } from 'next/server';
import { getBackendServerBases, joinBackendUrl } from '@/lib/backendUrl';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const token = request.headers.get('authorization');

    if (!token) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const bases = getBackendServerBases();

    for (const base of bases) {
        try {
            // Intentamos la ruta base definida en el APIRouter del backend
            const url = joinBackendUrl(base, '/sheets/stats/mensuales');
            console.log(`[Stats Mensuales] Intentando: ${url}`);

            const res = await fetch(url, {
                headers: {
                    Authorization: token,
                    Accept: 'application/json'
                },
                referrerPolicy: 'strict-origin-when-cross-origin' as any,
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`[Stats Mensuales] ✓ Datos obtenidos exitosamente`);
                return NextResponse.json(data);
            }

            console.log(`[Stats Mensuales] Fallo con ${url}: ${res.status}`);

            // Si falla con 404, probamos con el prefijo /api por si acaso
            if (res.status === 404) {
                const apiUrl = `${base}/api/sheets/stats/mensuales`;
                console.log(`[Stats Mensuales] 404 en ruta base, intentando: ${apiUrl}`);
                const res2 = await fetch(apiUrl, {
                    headers: {
                        Authorization: token,
                        Accept: 'application/json'
                    },
                    referrerPolicy: 'strict-origin-when-cross-origin' as any,
                });
                if (res2.ok) {
                    const data = await res2.json();
                    return NextResponse.json(data);
                }
                console.log(`[Stats Mensuales] También fallo con ${apiUrl}: ${res2.status}`);
            }
        } catch (e) {
            console.error(`[Stats Mensuales] EXCEPCIÓN con base ${base}:`, e);
            continue;
        }
    }

    return NextResponse.json({ error: 'No se pudieron obtener las estadísticas desde el backend' }, { status: 500 });
}
