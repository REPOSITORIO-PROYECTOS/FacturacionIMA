import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8008'

export async function GET(request: NextRequest, context: any) {
  const { params } = context
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ detail: 'Token de autorización ausente' }, { status: 401 })
  const url = `${BACKEND_URL}/admin/empresas/${params.id}`
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
  const url = `${BACKEND_URL}/admin/empresas/${params.id}/configuracion`
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
