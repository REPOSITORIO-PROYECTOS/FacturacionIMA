import { NextRequest, NextResponse } from 'next/server';

export async function POST(
    request: NextRequest,
    { params }: { params: { ventaId: string } }
) {
    try {
        const { ventaId } = params;

        // Obtener el token de autenticación
        const authHeader = request.headers.get('authorization');
        if (!authHeader) {
            return NextResponse.json(
                { error: 'No autorizado' },
                { status: 401 }
            );
        }

        // Configurar bases de API con multi-base fallback
        const apiBases = [
            process.env.NEXT_PUBLIC_API_BASE_URL,
            'http://localhost:8000',
            'http://127.0.0.1:8000'
        ].filter(Boolean);

        let lastError: Error | null = null;

        // Intentar con cada base hasta que una funcione
        for (const apiBase of apiBases) {
            try {
                const url = `${apiBase}/ventas/${ventaId}/marcar-facturada`;
                console.log(`Intentando marcar venta como facturada en: ${url}`);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: 'Error desconocido' }));
                    throw new Error(`Error del backend: ${response.status} - ${JSON.stringify(errorData)}`);
                }

                const data = await response.json();
                return NextResponse.json(data);

            } catch (error: any) {
                console.warn(`Falló con ${apiBase}:`, error.message);
                lastError = error;
                continue; // Intentar con la siguiente base
            }
        }

        // Si llegamos aquí, todas las bases fallaron
        throw lastError || new Error('No se pudo conectar con ninguna API base');

    } catch (error: any) {
        console.error('Error en proxy marcar-facturada:', error);
        return NextResponse.json(
            { error: error.message || 'Error al marcar venta como facturada' },
            { status: 500 }
        );
    }
}
