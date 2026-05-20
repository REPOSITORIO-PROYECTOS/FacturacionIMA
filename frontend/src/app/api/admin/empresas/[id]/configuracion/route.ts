import { NextRequest, NextResponse } from 'next/server'
import { getBackendInternalBase, joinBackendUrl } from '@/lib/backendUrl'

const BACKEND_URL = getBackendInternalBase()

export async function GET(request: NextRequest, context: any) {
  const { params } = context
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ detail: 'Token de autorización ausente' }, { status: 401 })
  const url = joinBackendUrl(BACKEND_URL, `/admin/empresas/${params.id}`)
  try {
    const res = await fetch(url, { headers: { Authorization: authHeader } })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'Error de conexión con el backend' }, { status: 502 })
  }
}

export async function PUT(request: NextRequest, context: any) {
  const { params } = context
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ detail: 'Token de autorización ausente' }, { status: 401 })
  const url = joinBackendUrl(BACKEND_URL, `/admin/empresas/${params.id}/configuracion`)
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: await request.text(),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ detail: 'Error de conexión con el backend' }, { status: 502 })
  }
}
