"use client";
import { useEffect, useState } from 'react';

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

export default function BoletasNoFacturadasPage() {
    const [items, setItems] = useState<BoletaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        let cancel = false;
        async function load() {
            setLoading(true); setError('');
            const token = localStorage.getItem('token');
            if (!token) { setError('No autenticado'); setLoading(false); return; }
            try {
                const res = await fetch('/api/boletas?tipo=no-facturadas&skip=0&limit=300', { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) { const d = await res.json().catch(() => ({})); if (!cancel) setError(String(d?.detail || 'Error')); }
                else { const d = await res.json().catch(() => []); if (!cancel && Array.isArray(d)) setItems(d); }
            } catch { if (!cancel) setError('Error de conexión'); }
            finally { if (!cancel) setLoading(false); }
        }
        load();
        return () => { cancel = true; };
    }, []);
    return (
        <div className="p-4 md:p-6 space-y-4">
            <h1 className="text-xl font-bold text-purple-700">Boletas No Facturadas</h1>
            {loading ? <p>Cargando...</p> : error ? <p className="text-red-600">{error}</p> : (
                <div className="overflow-auto border rounded bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-purple-50"><tr><th className="p-2">Repartidor</th><th className="p-2">Razón Social</th><th className="p-2">Total</th></tr></thead>
                        <tbody>
                            {items.map((b, i) => {
                                const rawTotal = b.total || b.INGRESOS || '';
                                const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                                const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                                const razonSocial = b.cliente || b.nombre || b['Razon Social'] || '';
                                const id = b['ID Ingresos'] || b.id || i;
                                const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
                                return <tr key={id} className="border-t"><td className="p-2">{repartidor}</td><td className="p-2">{razonSocial}</td><td className="p-2">{total}</td></tr>;
                            })}
                        </tbody>
                    </table>
                    {items.length === 0 && <div className="p-4 text-gray-500">No hay boletas</div>}
                </div>
            )}
        </div>
    );
}
