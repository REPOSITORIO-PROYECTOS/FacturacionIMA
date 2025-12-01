"use client";
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";

type Boleta = Record<string, any>;

type BoletasContext = {
    boletasFacturadas: Boleta[];
    boletasNoFacturadas: Boleta[];
    loading: boolean;
    error?: string | null;
    lastUpdated?: string | null;
    reload: () => void;
};

const defaultValue: BoletasContext = {
    boletasFacturadas: [],
    boletasNoFacturadas: [],
    loading: false,
    error: null,
    lastUpdated: null,
    reload: () => { },
};

const BoletasContext = createContext<BoletasContext>(defaultValue);

export function useBoletas() {
    return useContext(BoletasContext);
}

export function BoletasProvider({ children }: { children: ReactNode }) {
    const [boletasFacturadas, setBoletasFacturadas] = useState<Boleta[]>([]);
    const [boletasNoFacturadas, setBoletasNoFacturadas] = useState<Boleta[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const tokenRef = useRef<string | null>(null);
    const intervalRef = useRef<number | null>(null);

    const fetchAll = async () => {
        const token = localStorage.getItem("token");
        tokenRef.current = token;
        if (!token) {
            // Clear data when no token
            setBoletasFacturadas([]);
            setBoletasNoFacturadas([]);
            setLoading(false);
            setLastUpdated(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
            const [nfRes, fRes] = await Promise.all([
                fetch(`/api/boletas?tipo=no-facturadas&limit=1000`, { headers }),
                fetch(`/api/boletas?tipo=facturadas&limit=1000`, { headers }),
            ]);

            const [nfData, fData] = await Promise.all([nfRes.json().catch(() => []), fRes.json().catch(() => [])]);

            const arrNF = Array.isArray(nfData) ? nfData : (Array.isArray(nfData?.items) ? nfData.items : []);
            const arrF = Array.isArray(fData) ? fData : (Array.isArray(fData?.items) ? fData.items : []);

            setBoletasNoFacturadas(arrNF as Boleta[]);

            let arrFEnriched = arrF as Boleta[];
            try {
                const sheetsRes = await fetch(`/api/sheets/boletas?tipo=facturadas&limit=3000`, { headers });
                const sheetsData = await sheetsRes.json().catch(() => []);
                const isArr = Array.isArray(sheetsData);
                const sheetList: Boleta[] = isArr ? sheetsData as Boleta[] : (Array.isArray((sheetsData as any)?.items) ? (sheetsData as any).items : []);
                const repByIngreso: Record<string, string> = {};
                for (const row of sheetList) {
                    const idIng = String((row as any)['ID Ingresos'] ?? (row as any).id_ingreso ?? '').trim();
                    const rep = String((row as any)['Repartidor'] ?? (row as any).repartidor ?? '').trim();
                    if (idIng) repByIngreso[idIng] = rep;
                }
                arrFEnriched = (arrF as Boleta[]).map((f: Boleta) => {
                    const key = String((f as any).ingreso_id ?? (f as any)['ID Ingresos'] ?? '').trim();
                    const rep = key ? repByIngreso[key] : undefined;
                    return rep ? { ...f, Repartidor: rep, repartidor: rep } : f;
                });
            } catch { /* mantener datos si fallo */ }

            setBoletasFacturadas(arrFEnriched as Boleta[]);
            setLastUpdated(new Date().toISOString());
        } catch (e: any) {
            setError(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    // Exposed reload to consumers
    const reload = () => {
        fetchAll();
    };

    useEffect(() => {
        // initial fetch
        fetchAll();

        intervalRef.current = window.setInterval(() => {
            // If token changed in localStorage, update tokenRef and fetch again
            const t = localStorage.getItem("token");
            if (t !== tokenRef.current) {
                tokenRef.current = t;
            }
            fetchAll();
        }, 5 * 60 * 1000);

        // Listen for storage events (login/logout in other tabs)
        const onStorage = (ev: StorageEvent) => {
            if (ev.key === "token") {
                fetchAll();
            }
        };
        window.addEventListener("storage", onStorage);
        const onVis = () => { if (document.visibilityState === 'visible') fetchAll(); };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
            window.removeEventListener("storage", onStorage);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    return (
        <BoletasContext.Provider value={{ boletasFacturadas, boletasNoFacturadas, loading, error, lastUpdated, reload }}>
            {children}
        </BoletasContext.Provider>
    );
}

export default BoletasProvider;
