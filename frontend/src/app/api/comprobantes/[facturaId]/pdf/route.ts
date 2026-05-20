import { NextRequest, NextResponse } from 'next/server';
import { getBackendServerBases, joinBackendUrl } from '@/lib/backendUrl';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ facturaId: string }> }
) {
    const token = request.headers.get('authorization');
    const { facturaId } = await context.params;

    if (!token) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const bases = getBackendServerBases();

    for (const base of bases) {
        try {
            const url = joinBackendUrl(base, `/comprobantes/${facturaId}/pdf`);
            const res = await fetch(url, {
                headers: { Authorization: token },
            });

            if (res.ok) {
                const pdfBuffer = await res.arrayBuffer();
                return new NextResponse(pdfBuffer, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename=comprobante_${facturaId}.pdf`
                    }
                });
            }
            // Propagar errores de autenticación para que el frontend pueda redirigir
            if (res.status === 401 || res.status === 403) {
                const errTxt = await res.text().catch(() => 'No autorizado');
                return NextResponse.json({ error: errTxt }, { status: res.status });
            }
        } catch (e) {
            continue;
        }
    }

    return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 });
}
