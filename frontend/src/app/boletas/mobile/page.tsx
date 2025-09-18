"use client";
import { useEffect, useState, useMemo } from 'react';

type Tipo = 'facturadas' | 'no-facturadas';

interface BoletaRecord {
    id?: number | string;
    total?: number | string;
    INGRESOS?: number | string;
    cliente?: string;
    nombre?: string;
    'Razon Social'?: string;
    'ID Ingresos'?: number | string;
    Repartidor?: string;
    'Nro Comprobante'?: string | number;
    [key: string]: unknown;
}

export default function BoletasMobilePage() {
    const [tipo, setTipo] = useState<Tipo>('no-facturadas');
    const [items, setItems] = useState<BoletaRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancel = false;
        async function load() {
            setLoading(true); setError('');
            try {
                const res = await fetch(`/api/boletas?tipo=${tipo}&skip=0&limit=250`);
                if (!res.ok) {
                    const d: unknown = await res.json().catch(() => ({}));
                    const detail = (typeof d === 'object' && d && 'detail' in d) ? (d as { detail: unknown }).detail : undefined;
                    if (!cancel) setError(String(detail ?? 'Error'));
                } else {
                    const d = await res.json().catch(() => []);
                    if (!cancel && Array.isArray(d)) setItems(d);
                }
            } catch { if (!cancel) setError('Error de conexión'); }
            finally { if (!cancel) setLoading(false); }
        }
        load();
        return () => { cancel = true; };
    }, [tipo]);

    const resumidos = useMemo(() => items.map((b, i) => {
        const rawTotal = b.total || b.INGRESOS || '';
        const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
        const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
        const cliente = b.cliente || b.nombre || b['Razon Social'] || '';
        const id = b['ID Ingresos'] || b.id || i;
        const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
        const nroComp = (b['Nro Comprobante'] ?? (b as Record<string, unknown>)['nroComprobante'] ?? '') as string | number;
        return { id, cliente, total, repartidor, nroComp };
    }), [items]);

    return (
        <div className="p-3 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold text-purple-700">Boletas {tipo === 'no-facturadas' ? 'Pendientes' : 'Facturadas'}</h1>
                <div className="flex gap-2">
                    <button onClick={() => setTipo('no-facturadas')} className={`px-3 py-1 rounded text-sm font-medium border ${tipo === 'no-facturadas' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-600 border-purple-300'}`}>Pendientes</button>
                    <button onClick={() => setTipo('facturadas')} className={`px-3 py-1 rounded text-sm font-medium border ${tipo === 'facturadas' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-600 border-purple-300'}`}>Facturadas</button>
                </div>
            </div>

            {loading && <p className="text-sm">Cargando...</p>}
            {error && !loading && <p className="text-sm text-red-600">{error}</p>}

            <ul className="divide-y rounded border bg-white overflow-hidden">
                {resumidos.map(r => (
                    <li key={r.id} className="p-3 flex flex-col gap-1">
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>ID: {r.id}</span>
                            {r.nroComp && <span>Comp: {r.nroComp}</span>}
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-800 truncate pr-3">{r.cliente}</span>
                            <span className="text-sm font-semibold text-purple-700">{r.total}</span>
                        </div>
                        <div className="text-xs text-gray-500 flex justify-between">
                            <span>Rep: {r.repartidor || '-'}</span>
                            <span>{tipo === 'facturadas' ? '✓' : '⏳'}</span>
                        </div>
                    </li>
                ))}
                {(!loading && resumidos.length === 0) && <li className="p-4 text-center text-sm text-gray-500">Sin boletas</li>}
            </ul>
        </div>
    );
}
