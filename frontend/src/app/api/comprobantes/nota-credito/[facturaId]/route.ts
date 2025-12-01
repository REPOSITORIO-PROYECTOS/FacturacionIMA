import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest, context: { params: Promise<{ facturaId: string }> }) {
  const auth = request.headers.get('authorization')
  const { facturaId } = await context.params
  if (!auth) return new NextResponse('No autenticado', { status: 401 })
  const basesRaw = [
    process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8008',
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008',
  ]
  const bases = Array.from(new Set(basesRaw.map(b => b.replace(/\/$/, ''))))
  const host = (() => { try { return new URL(request.url).host } catch { return null } })()
  const policy = 'strict-origin-when-cross-origin'
  for (const base of bases) {
    const candidates = [
      `${base}/comprobantes/nota-credito/${facturaId}/pdf`,
      `${base}/api/comprobantes/nota-credito/${facturaId}/pdf`,
    ]
    for (const cand of candidates) {
      try {
        const h = (() => { try { return new URL(cand).host } catch { return null } })()
        if (host && h === host && base !== process.env.BACKEND_INTERNAL_URL) continue
        const res = await fetch(cand, {
          headers: { Authorization: auth },
          referrerPolicy: policy as any,
        })
        const ct = res.headers.get('content-type') || 'application/pdf'
        const buf = await res.arrayBuffer()
        if (res.ok && buf.byteLength > 0) {
          const headers = new Headers()
          headers.set('Content-Type', ct)
          headers.set('Content-Disposition', `attachment; filename=nota_credito_${facturaId}.pdf`)
          return new NextResponse(Buffer.from(buf), { status: res.status, headers })
        }
      } catch {}
    }
  }
  return new NextResponse('No se pudo descargar el Ticket de Nota de Crédito', { status: 502 })
}
