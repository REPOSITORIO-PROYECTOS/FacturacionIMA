import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        // Obtener el token del header original
        const authHeader = req.headers.get("authorization");
        
        // Llamar al backend Python localmente (puerto 8008)
        // Usamos el endpoint original /sheets/sincronizar que sabemos que existe en Python
        const backendUrl = "http://127.0.0.1:8008/sheets/sincronizar";
        
        const res = await fetch(backendUrl, {
            method: "POST",
            headers: {
                "Authorization": authHeader || "",
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) {
            const errorText = await res.text();
            return NextResponse.json(
                { error: `Backend error: ${res.status} ${errorText}` }, 
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("Proxy Sync Error:", error);
        return NextResponse.json(
            { error: "Error interno en proxy de sincronización", details: error.message },
            { status: 500 }
        );
    }
}
