import { NextRequest, NextResponse } from "next/server";
import { joinBackendUrl, getBackendInternalBase } from "@/lib/backendUrl";

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization");
        const backendUrl = joinBackendUrl(getBackendInternalBase(), '/sheets/sincronizar');
        
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
