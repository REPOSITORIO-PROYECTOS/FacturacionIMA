import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8008';

async function forwardRequest(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
        return NextResponse.json({ detail: 'Token de autorización ausente' }, { status: 401 });
    }

    const url = `${BACKEND_URL}/admin/empresas/`;
    const method = request.method;

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
            },
            body: method !== 'GET' ? await request.text() : undefined,
            cache: 'no-store',
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ detail: 'Error de conexión con el backend' }, { status: 502 });
    }
}

export async function GET(request: NextRequest) {
    return forwardRequest(request);
}

export async function POST(request: NextRequest) {
    return forwardRequest(request);
}