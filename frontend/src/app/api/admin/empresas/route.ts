import { NextRequest, NextResponse } from 'next/server';
import { getBackendInternalBase, joinBackendUrl } from '@/lib/backendUrl';

const BACKEND_URL = getBackendInternalBase();

async function forwardRequest(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
        return NextResponse.json({ detail: 'Token de autorización ausente' }, { status: 401 });
    }

    const url = joinBackendUrl(BACKEND_URL, '/admin/empresas/');
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