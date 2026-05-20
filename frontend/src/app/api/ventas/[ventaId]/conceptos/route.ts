import { NextRequest, NextResponse } from 'next/server';
import { getBackendServerBases } from '@/lib/backendUrl';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ ventaId: string }> }
) {
    const token = request.headers.get('authorization');
    const { ventaId } = await context.params;

    if (!token) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const uniqBases = getBackendServerBases();

    for (const base of uniqBases) {
        const candidates = [
            `${base}/ventas/${ventaId}/conceptos`,
            `${base}/api/ventas/${ventaId}/conceptos`,
        ];
        for (const url of candidates) {
            try {
                const res = await fetch(url, {
                    headers: { Authorization: token },
                });

                if (res.ok) {
                    const data = await res.json();
                    return NextResponse.json(data);
                }
                if (res.status === 404 || res.status === 405) {
                    continue;
                }
            } catch {
                continue;
            }
        }
    }

    return NextResponse.json({ error: 'No se pudieron obtener conceptos' }, { status: 500 });
}
