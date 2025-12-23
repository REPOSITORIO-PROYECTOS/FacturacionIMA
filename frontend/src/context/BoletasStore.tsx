"use client";
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";

type Boleta = Record<string, any>;

export type BoletasFilters = {
    fechaDesde?: string;
    fechaHasta?: string;
};

type BoletasContext = {
    boletasFacturadas: Boleta[];
    boletasNoFacturadas: Boleta[];
    loading: boolean;
    error?: string | null;
    lastUpdated?: string | null;
    reload: (filters?: BoletasFilters) => void;
    filters: BoletasFilters;
    setFilters: (f: BoletasFilters) => void;
};

const defaultValue: BoletasContext = {
    boletasFacturadas: [],
    boletasNoFacturadas: [],
    loading: false,
    error: null,
    lastUpdated: null,
    reload: () => { },
    filters: {},
    setFilters: () => { },
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
    const [filters, setFilters] = useState<BoletasFilters>({});

    const tokenRef = useRef<string | null>(null);
    const intervalRef = useRef<number | null>(null);

    const fetchAll = async (currentFilters: BoletasFilters = {}, isBackground = false) => {
        const token = localStorage.getItem("token");
        tokenRef.current = token;
        if (!token) {
            setBoletasFacturadas([]);
            setBoletasNoFacturadas([]);
            setLoading(false);
            setLastUpdated(null);
            return;
        }

        // Solo mostrar loading si NO es background refresh
        if (!isBackground) setLoading(true);

        setError(null);
        try {
            const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;

            // Construir query string con filtros
            const params = new URLSearchParams();
            params.append('limit', '5000'); // Límite amplio pero seguro para SQL
            if (currentFilters.fechaDesde) params.append('fecha_desde', currentFilters.fechaDesde);
            if (currentFilters.fechaHasta) params.append('fecha_hasta', currentFilters.fechaHasta);

            // Fetch paralelo optimizado (solo al endpoint SQL nuevo)
            const [nfRes, fRes] = await Promise.all([
                fetch(`/api/sheets/boletas?tipo=no-facturadas&${params.toString()}`, { headers }),
                fetch(`/api/sheets/boletas?tipo=facturadas&${params.toString()}`, { headers }),
            ]);

            const [nfData, fData] = await Promise.all([
                nfRes.ok ? nfRes.json().catch(() => []) : [],
                fRes.ok ? fRes.json().catch(() => []) : []
            ]);

            // Normalizar respuestas (pueden venir directas o wrappeadas)
            const arrNF = Array.isArray(nfData) ? nfData : (Array.isArray(nfData?.items) ? nfData.items : []);
            const arrF = Array.isArray(fData) ? fData : (Array.isArray(fData?.items) ? fData.items : []);

            setBoletasNoFacturadas(arrNF as Boleta[]);
            setBoletasFacturadas(arrF as Boleta[]);
            setLastUpdated(new Date().toISOString());
        } catch (e: any) {
            console.error("Error fetching boletas:", e);
            setError(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    // Reload manual que acepta nuevos filtros opcionales
    const reload = (newFilters?: BoletasFilters) => {
        const nextFilters = { ...filters, ...newFilters };
        if (newFilters) setFilters(nextFilters);
        // Reload manual siempre muestra loading
        fetchAll(nextFilters, false);
    };

    useEffect(() => {
        // Cargar filtros iniciales
        // Si ya tenemos datos, hacemos un fetch silencioso (background) para actualizar
        // Si no hay datos, mostramos loading
        const hasData = boletasFacturadas.length > 0 || boletasNoFacturadas.length > 0;
        fetchAll(filters, hasData);

        intervalRef.current = window.setInterval(() => {
            const t = localStorage.getItem("token");
            if (t !== tokenRef.current) tokenRef.current = t;
            // Refrescar silenciosamente (SIN loading)
            fetchAll(filters, true);
        }, 5 * 60 * 1000); // 5 min refresh (para evitar Quota Exceeded de Google)

        const onStorage = (ev: StorageEvent) => { if (ev.key === "token") fetchAll(filters, false); };
        window.addEventListener("storage", onStorage);

        // Auto-reload al volver a la pestaña (silencioso)
        const onVis = () => { if (document.visibilityState === 'visible') fetchAll(filters, true); };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
            window.removeEventListener("storage", onStorage);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []); // Run once on mount

    // Re-fetch cuando cambian los filtros explícitamente (con loading)
    useEffect(() => {
        fetchAll(filters, false);
    }, [filters.fechaDesde, filters.fechaHasta]);

    return (
        <BoletasContext.Provider value={{ boletasFacturadas, boletasNoFacturadas, loading, error, lastUpdated, reload, filters, setFilters }}>
            {children}
        </BoletasContext.Provider>
    );
}

export default BoletasProvider;
