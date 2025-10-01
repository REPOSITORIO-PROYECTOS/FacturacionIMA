import { NextRequest, NextResponse } from 'next/server';

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

  const bases = [
    process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8008',
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008',
  ];

  for (const base of bases) {
    try {
      const url = `${base.replace(/\/$/,'')}/ventas/${ventaId}/conceptos`;
      const res = await fetch(url, {
        headers: { Authorization: token },
      });
      
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
    } catch (e) {
      continue;
    }
  }

  return NextResponse.json({ error: 'No se pudieron obtener conceptos' }, { status: 500 });
}
