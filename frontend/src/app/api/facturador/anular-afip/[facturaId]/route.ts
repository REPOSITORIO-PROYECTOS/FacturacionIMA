import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest, context: { params: Promise<{ facturaId: string }> }) {
  const auth = request.headers.get('authorization')
  const { facturaId } = await context.params
  const body = await request.json().catch(() => ({}))
  const motivo = typeof body?.motivo === 'string' ? body.motivo : undefined
  const force = Boolean(body?.force)
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const basesRaw = [
    process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8008',
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8008',
  ]
  const bases = Array.from(new Set(basesRaw.map(b => b.replace(/\/$/, ''))))
  const host = (() => { try { return new URL(request.url).host } catch { return null } })()
  const policy = 'strict-origin-when-cross-origin'
  const urlObj = new URL(request.url)
  const wantDebug = urlObj.searchParams.get('debug') === '1'
  const attempted: Array<{ target: string; status?: number; html?: boolean; error?: string }> = []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12000)
  let lastError: any = null
  let lastStatus = 0
  for (const base of bases) {
    const candidates = [
      `${base}/facturador/anular-afip/${facturaId}`,
      `${base}/api/facturador/anular-afip/${facturaId}`,
    ]
    for (const cand of candidates) {
      try {
        const h = (() => { try { return new URL(cand).host } catch { return null } })()
        if (host && h === host && base !== process.env.BACKEND_INTERNAL_URL) {
          continue
        }
        console.log('[anular-afip] POST →', cand, { motivo, force })
        const res = await fetch(cand, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth, Accept: 'application/json' },
          referrerPolicy: policy as any,
          body: JSON.stringify({ motivo, force }),
          signal: controller.signal,
        })
        lastStatus = res.status
        const text = await res.text()
        const data = text && (text.trim().startsWith('{') || text.trim().startsWith('[')) ? JSON.parse(text) : text
        const ct = res.headers.get('content-type') || ''
        const looksHTML = /<html[\s>]/i.test(String(text)) || ct.startsWith('text/html')
        attempted.push({ target: cand, status: res.status, html: looksHTML })
        if (res.ok) {
          console.log('[anular-afip] OK', { status: res.status, data })
          const headers = new Headers()
          headers.set('Content-Type', ct || 'application/json')
          if (wantDebug) headers.set('X-Debug-Attempts', JSON.stringify(attempted))
          return new NextResponse(typeof data === 'string' ? data : JSON.stringify(data), { status: res.status, headers })
        }
        if (!lastError) lastError = data
        console.error('[anular-afip] Error backend', { status: res.status, data })
        if (res.status === 404 || res.status === 405) {
          continue
        }
        if (looksHTML) {
          continue
        }
        lastStatus = res.status
        break
      } catch (e: any) {
        attempted.push({ target: cand, error: String(e && e.name === 'AbortError' ? 'timeout' : e) })
      }
    }
  }
  clearTimeout(timeout)
  const payload = { error: 'No se pudo anular en AFIP', detail: lastError, attempts: attempted }
  return NextResponse.json(payload, { status: lastStatus || 500 })
}
