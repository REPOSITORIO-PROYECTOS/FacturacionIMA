import { NextRequest, NextResponse } from 'next/server';

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

  const bases = [
    process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8008',
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008',
  ];

  for (const base of bases) {
    try {
      const url = `${base.replace(/\/$/,'')}/comprobantes/${facturaId}/pdf`;
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
    } catch (e) {
      continue;
    }
  }

  return NextResponse.json({ error: 'No se pudo generar el PDF' }, { status: 500 });
}
