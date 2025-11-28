import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest, context: { params: Promise<{ facturaId: string }> }) {
  const token = request.headers.get('authorization')
  const { facturaId } = await context.params
  const body = await request.json().catch(() => ({}))
  const motivo = typeof body?.motivo === 'string' ? body.motivo : undefined
  if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const bases = [
    process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8008',
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008',
  ]
  for (const base of bases) {
    try {
      const url = `${base.replace(/\/$/, '')}/facturador/anular-afip/${facturaId}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ motivo }),
      })
      const text = await res.text()
      const data = text && (text.trim().startsWith('{') || text.trim().startsWith('[')) ? JSON.parse(text) : text
      if (res.ok) return NextResponse.json(data)
    } catch { }
  }
  return NextResponse.json({ error: 'No se pudo anular' }, { status: 500 })
}
