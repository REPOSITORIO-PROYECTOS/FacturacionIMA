"use client";
import React, { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";

type Boleta = Record<string, any>;

export type BoletasFilters = {
    fechaDesde?: string;
    fechaHasta?: string;
    search?: string;
    page?: number;
    limit?: number;
    status?: string;
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
    totalFacturadas: number;
    totalNoFacturadas: number;
};

const defaultValue: BoletasContext = {
    boletasFacturadas: [],
    boletasNoFacturadas: [],
    loading: false,
    error: null,
    lastUpdated: null,
    reload: () => Promise.resolve(),
    filters: { page: 1, limit: 50 },
    setFilters: () => { },
    totalFacturadas: 0,
    totalNoFacturadas: 0,
};

const BoletasContext = createContext<BoletasContext>(defaultValue);

export function useBoletas() {
    return useContext(BoletasContext);
}

export function BoletasProvider({ children }: { children: ReactNode }) {
    const [boletasFacturadas, setBoletasFacturadas] = useState<Boleta[]>([]);
    const [boletasNoFacturadas, setBoletasNoFacturadas] = useState<Boleta[]>([]);
    const [totalFacturadas, setTotalFacturadas] = useState(0);
    const [totalNoFacturadas, setTotalNoFacturadas] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [filters, setFiltersState] = useState<BoletasFilters>({ page: 1, limit: 50 });

    const isEqualFilters = useCallback((f1: BoletasFilters, f2: BoletasFilters) => {
        return (f1.fechaDesde || '') === (f2.fechaDesde || '') &&
            (f1.fechaHasta || '') === (f2.fechaHasta || '') &&
            (f1.search || '') === (f2.search || '') &&
            (f1.page || 1) === (f2.page || 1) &&
            (f1.limit || 50) === (f2.limit || 50) &&
            (f1.status || '') === (f2.status || '');
    }, []);

    const setFilters = useCallback((newFilters: BoletasFilters | ((prev: BoletasFilters) => BoletasFilters)) => {
        setFiltersState(prev => {
            const next = typeof newFilters === 'function' ? newFilters(prev) : { ...prev, ...newFilters };
            if (isEqualFilters(prev, next)) return prev;
            return next;
        });
    }, [isEqualFilters]);

    const tokenRef = useRef<string | null>(null);
    const intervalRef = useRef<number | null>(null);
    const filtersRef = useRef<BoletasFilters>(filters);
    const fetchHistoryRef = useRef<{ timestamp: number }[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Sincronizar ref con el estado para acceso en callbacks estables
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    // Monoize fetchAll to avoid unnecessary effect re-runs
    const fetchAll = useCallback(async (currentFilters: BoletasFilters = {}, isBackground = false) => {
        // --- GUARDIA DE LOOPS ---
        const now = Date.now();
        fetchHistoryRef.current = [...fetchHistoryRef.current.filter(t => now - t.timestamp < 10000), { timestamp: now }];

        if (fetchHistoryRef.current.length > 15) {
            console.error("🚨 [BoletasStore] LOOP DETECTADO: Se han realizado más de 15 peticiones en 10 segundos. Abortando peticiones para proteger el servidor.");
            setError("Error: El sistema detectó demasiadas peticiones seguidas. Se ha pausado la carga automática para proteger el servidor.");
            return;
        }
        // -------------------------

        // --- ABORT PREVIOUS REQUEST ---
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        // -------------------------------

        // --- HELPER PARA REINTENTOS CON BACKOFF ---
        const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
            try {
                const res = await fetch(url, { ...options, signal: controller.signal });
                // Reintentar solo en errores de servidor (5xx) o timeouts
                if (!res.ok && retries > 0 && (res.status >= 500 || res.status === 408)) {
                    console.warn(`[BoletasStore] Fallo en API (${res.status}). Reintentando en ${backoff}ms...`);
                    await new Promise(resolve => setTimeout(resolve, backoff));
                    return fetchWithRetry(url, options, retries - 1, backoff * 2);
                }
                return res;
            } catch (e: any) {
                if (e.name === 'AbortError') throw e;
                if (retries > 0) {
                    console.warn(`[BoletasStore] Error de red. Reintentando en ${backoff}ms...`, e);
                    await new Promise(resolve => setTimeout(resolve, backoff));
                    return fetchWithRetry(url, options, retries - 1, backoff * 2);
                }
                throw e;
            }
        };
        // ------------------------------------------

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
            const limit = currentFilters.limit || 50;
            const page = currentFilters.page || 1;
            const offset = (page - 1) * limit;

            params.append('limit', String(limit));
            params.append('offset', String(offset));

            if (currentFilters.search) params.append('search', currentFilters.search);
            if (currentFilters.fechaDesde) params.append('fecha_desde', currentFilters.fechaDesde);
            if (currentFilters.fechaHasta) params.append('fecha_hasta', currentFilters.fechaHasta);

            // 1. Cargar No Facturadas (Secuencial para liberar memoria)
            const nfRes = await fetchWithRetry(`/api/sheets/boletas?tipo=no-facturadas&${params.toString()}`, { headers });

            // Manejo de errores de autenticación
            if (nfRes.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("user_info");
                window.location.href = "/login?expired=true";
                return;
            }

            if (nfRes.ok) {
                const nfData = await nfRes.json();
                // Nuevo formato: { data: [], total: 0, ... }
                if (nfData && typeof nfData === 'object' && 'data' in nfData) {
                    setBoletasNoFacturadas(nfData.data || []);
                    setTotalNoFacturadas(nfData.total || 0);
                } else {
                    const arrNF = Array.isArray(nfData) ? nfData : [];
                    setBoletasNoFacturadas(arrNF as Boleta[]);
                    setTotalNoFacturadas(arrNF.length);
                }
            }

            // 2. Cargar Facturadas (solo después de terminar la anterior)
            const fRes = await fetchWithRetry(`/api/sheets/boletas?tipo=facturadas&${params.toString()}`, { headers });

            if (fRes.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("user_info");
                window.location.href = "/login?expired=true";
                return;
            }

            if (fRes.ok) {
                const fData = await fRes.json();
                if (fData && typeof fData === 'object' && 'data' in fData) {
                    setBoletasFacturadas(fData.data || []);
                    setTotalFacturadas(fData.total || 0);
                } else {
                    const arrF = Array.isArray(fData) ? fData : [];
                    setBoletasFacturadas(arrF as Boleta[]);
                    setTotalFacturadas(arrF.length);
                }
            }

            setLastUpdated(new Date().toISOString());
        } catch (e: any) {
            if (e.name === 'AbortError') {
                console.log('[BoletasStore] Petición cancelada por el usuario o nueva solicitud');
                return;
            }
            console.error("Error fetching boletas:", e);
            setError(String(e?.message || e));
        } finally {
            // Solo quitar loading si este controlador es el actual (evita parpadeo si hay una nueva carga)
            if (abortControllerRef.current === controller) {
                setLoading(false);
            }
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
            if (abortControllerRef.current) abortControllerRef.current.abort();
            window.clearInterval(intervalId);
            window.removeEventListener("storage", onStorage);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [fetchAll]); // filters removido de dependencias para evitar reinicios del loop

    // Único punto de entrada para la carga inicial y cambios de filtros
    const lastFiltersRef = useRef<BoletasFilters | null>(null);

    useEffect(() => {
        // Solo disparar si los filtros realmente han cambiado o es la carga inicial
        if (lastFiltersRef.current && isEqualFilters(filters, lastFiltersRef.current)) {
            return;
        }
        lastFiltersRef.current = { ...filters };

        const hasData = boletasFacturadas.length > 0 || boletasNoFacturadas.length > 0;

        // Log para depuración de loops
        console.log(`[BoletasStore] useEffect filters (CAMBIO DETECTADO): desde=${filters.fechaDesde}, hasta=${filters.fechaHasta}`);

        fetchAll(filters, hasData);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, fetchAll, isEqualFilters]);

    const contextValue = React.useMemo(() => ({
        boletasFacturadas,
        boletasNoFacturadas,
        totalFacturadas,
        totalNoFacturadas,
        loading,
        error,
        lastUpdated,
        reload,
        filters,
        setFilters
    }), [
        boletasFacturadas,
        boletasNoFacturadas,
        totalFacturadas,
        totalNoFacturadas,
        loading,
        error,
        lastUpdated,
        reload,
        filters,
        setFilters
    ]);

    return (
        <BoletasContext.Provider value={contextValue}>
            {children}
        </BoletasContext.Provider>
    );
}

export default BoletasProvider;
