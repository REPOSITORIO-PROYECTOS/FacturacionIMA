import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8008';

// Usamos 'any' para evitar el conflicto de tipos del build de Next.js
export async function GET(request: NextRequest, context: any) {
    const { params } = context;
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1] || '';
    if (!authHeader || !token || token === 'null') {
        return NextResponse.json({ detail: 'Token de autorización ausente' }, { status: 401 });
    }

    const url = `${BACKEND_URL}/admin/empresas/${params.id}`;
    console.log(`[API /admin/empresas/id] Intentando conectar a: ${url}`); // LOG AÑADIDO

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            cache: 'no-store',
        });
        let data: any = null;
        try {
            data = await response.json();
        } catch {
            return NextResponse.json({ detail: 'Respuesta inválida del backend' }, { status: 502 });
        }
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`[API /admin/empresas/id] Error de conexión a ${url}:`, error); // LOG DE ERROR AÑADIDO
        return NextResponse.json({ detail: 'Error de conexión con el backend' }, { status: 502 });
    }
}

export async function PUT(request: NextRequest, context: any) {
    const { params } = context;
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
        return NextResponse.json({ detail: 'Token de autorización ausente' }, { status: 401 });
    }

    const url = `${BACKEND_URL}/admin/empresas/${params.id}`;

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: await request.text(),
            cache: 'no-store',
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ detail: 'Error de conexión con el backend' }, { status: 502 });
    }
}
