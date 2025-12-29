"use client";
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";

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
    reload: (filters?: BoletasFilters) => Promise<void>;
    filters: BoletasFilters;
    setFilters: (f: BoletasFilters) => void;
};

const defaultValue: BoletasContext = {
    boletasFacturadas: [],
    boletasNoFacturadas: [],
    loading: false,
    error: null,
    lastUpdated: null,
    reload: () => Promise.resolve(),
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
    const filtersRef = useRef<BoletasFilters>(filters);
    const fetchHistoryRef = useRef<{ timestamp: number }[]>([]);

    // Sincronizar ref con el estado para acceso en callbacks estables
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    // Monoize fetchAll to avoid unnecessary effect re-runs
    const fetchAll = useCallback(async (currentFilters: BoletasFilters = {}, isBackground = false) => {
        // --- GUARDIA DE LOOPS ---
        const now = Date.now();
        fetchHistoryRef.current = [...fetchHistoryRef.current.filter(t => now - t.timestamp < 10000), { timestamp: now }];

        if (fetchHistoryRef.current.length > 10) {
            console.error("🚨 [BoletasStore] LOOP DETECTADO: Se han realizado más de 10 peticiones en 10 segundos. Abortando peticiones para proteger el servidor.");
            setError("Error: Sistema de protección contra bucles activado. Por favor recarga la página.");
            return;
        }
        // -------------------------

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
            params.append('limit', '1000'); // Límite reducido para evitar N+1 masivos en el backend
            if (currentFilters.fechaDesde) params.append('fecha_desde', currentFilters.fechaDesde);
            if (currentFilters.fechaHasta) params.append('fecha_hasta', currentFilters.fechaHasta);

            // Fetch paralelo optimizado
            const [nfRes, fRes] = await Promise.all([
                fetch(`/api/sheets/boletas?tipo=no-facturadas&${params.toString()}`, { headers }),
                fetch(`/api/sheets/boletas?tipo=facturadas&${params.toString()}`, { headers }),
            ]);

            // Manejo de errores de autenticación
            if (nfRes.status === 401 || fRes.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("user_info");
                window.location.href = "/login?expired=true";
                return;
            }

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
        } catch (e: unknown) {
            console.error("Error fetching boletas:", e);
            setError(String((e as Error)?.message || e));
        } finally {
            setLoading(false);
        }
    }, []);

    // Reload manual que acepta nuevos filtros opcionales
    const reload = useCallback(async (newFilters?: BoletasFilters) => {
        if (newFilters) {
            setFilters(prev => ({ ...prev, ...newFilters }));
            // El useEffect de filters se encargará de llamar a fetchAll
            return;
        }
        // Si no hay nuevos filtros, forzamos el fetchAll usando los filtros actuales del ref
        return await fetchAll(filtersRef.current, false);
    }, [fetchAll]);

    useEffect(() => {
        // Configuramos el intervalo de actualización automática
        const intervalId = window.setInterval(() => {
            const t = localStorage.getItem("token");
            if (t !== tokenRef.current) tokenRef.current = t;
            // Refrescar silenciosamente (SIN loading) usando el ref para evitar depender de filters
            fetchAll(filtersRef.current, true);
        }, 5 * 60 * 1000); // 5 min refresh

        intervalRef.current = intervalId;

        const onStorage = (ev: StorageEvent) => {
            if (ev.key === "token") fetchAll(filtersRef.current, false);
        };
        window.addEventListener("storage", onStorage);

        // Auto-reload al volver a la pestaña (silencioso)
        const onVis = () => {
            if (document.visibilityState === 'visible') fetchAll(filtersRef.current, true);
        };
        document.addEventListener('visibilitychange', onVis);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("storage", onStorage);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [fetchAll]); // filters removido de dependencias para evitar reinicios del loop

    // Único punto de entrada para la carga inicial y cambios de filtros
    useEffect(() => {
        // Solo disparar si los filtros realmente han cambiado o es la carga inicial
        // Evitamos disparar si fetchAll ya está en curso para el mismo set de filtros
        const hasData = boletasFacturadas.length > 0 || boletasNoFacturadas.length > 0;

        // Log para depuración de loops
        console.log(`[BoletasStore] useEffect filters: desde=${filters.fechaDesde}, hasta=${filters.fechaHasta}, hasData=${hasData}`);

        fetchAll(filters, hasData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.fechaDesde, filters.fechaHasta, fetchAll]);

    const contextValue = React.useMemo(() => ({
        boletasFacturadas,
        boletasNoFacturadas,
        loading,
        error,
        lastUpdated,
        reload,
        filters,
        setFilters
    }), [
        boletasFacturadas,
        boletasNoFacturadas,
        loading,
        error,
        lastUpdated,
        reload,
        filters.fechaDesde,
        filters.fechaHasta,
        setFilters
    ]);

    return (
        <BoletasContext.Provider value={contextValue}>
            {children}
        </BoletasContext.Provider>
    );
}

export default BoletasProvider;
