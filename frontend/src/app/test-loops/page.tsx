"use client";
import { useEffect, useState } from 'react';
import { useBoletas } from '@/context/BoletasStore';

export default function TestLoopsPage() {
    const { fetchAll, filters, setFilters, boletasNoFacturadas, loading } = useBoletas() as any;
    const [renderCount, setRenderCount] = useState(0);
    const [fetchCount, setFetchCount] = useState(0);
    const [lastFetchTime, setLastFetchTime] = useState<number>(0);
    const [history, setHistory] = useState<string[]>([]);

    // Interceptar fetchAll para contar
    useEffect(() => {
        const originalFetch = fetchAll;
        // Nota: No podemos sobrescribir fácilmente si viene de context, 
        // pero podemos observar los cambios en boletasNoFacturadas o loading
    }, [fetchAll]);

    useEffect(() => {
        setRenderCount(prev => prev + 1);
    }, [filters, boletasNoFacturadas, loading]);

    // Monitorear peticiones a la API observando el estado de loading
    useEffect(() => {
        if (loading) {
            setFetchCount(prev => prev + 1);
            setHistory(prev => [`Fetch iniciado a las ${new Date().toLocaleTimeString()}`, ...prev].slice(0, 10));
        }
    }, [loading]);

    return (
        <div className="p-8 space-y-6">
            <h1 className="text-2xl font-bold">Detector de Loops</h1>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border rounded bg-blue-50">
                    <div className="text-sm text-blue-600">Renders del Componente</div>
                    <div className="text-3xl font-bold">{renderCount}</div>
                </div>
                <div className="p-4 border rounded bg-green-50">
                    <div className="text-sm text-green-600">Peticiones Detectadas (Loading cycles)</div>
                    <div className="text-3xl font-bold">{fetchCount}</div>
                </div>
            </div>

            <div className="space-y-2">
                <h2 className="font-bold">Acciones de Prueba</h2>
                <div className="flex gap-2">
                    <button 
                        className="px-4 py-2 bg-purple-600 text-white rounded"
                        onClick={() => setFilters({ fechaDesde: '2025-01-01' })}
                    >
                        Cambiar Filtro (Fecha)
                    </button>
                    <button 
                        className="px-4 py-2 bg-gray-600 text-white rounded"
                        onClick={() => window.location.reload()}
                    >
                        Recargar Página
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                <h2 className="font-bold">Historial de Actividad</h2>
                <div className="border rounded divide-y max-h-60 overflow-auto">
                    {history.length === 0 && <div className="p-4 text-gray-500 italic">Esperando actividad...</div>}
                    {history.map((line, i) => (
                        <div key={i} className="p-2 text-sm">{line}</div>
                    ))}
                </div>
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm">
                <p><strong>Instrucciones:</strong> Si el contador de "Peticiones Detectadas" incrementa sin parar sin que hagas clic en nada, ¡hay un loop!</p>
                <p className="mt-2">Los filtros actuales son: {JSON.stringify(filters)}</p>
            </div>
        </div>
    );
}
