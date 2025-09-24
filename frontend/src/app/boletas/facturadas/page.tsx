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
    [key: string]: unknown; // Campos adicionales dinámicos
}

export default function BoletasFacturadasPage() {
    const [detalleOpen, setDetalleOpen] = useState(false);
    const [boletaDetalle, setBoletaDetalle] = useState<BoletaRecord | null>(null);

    function abrirDetalle(boleta: BoletaRecord) {
        setBoletaDetalle(boleta);
        setDetalleOpen(true);
    }
    function cerrarDetalle() {
        setDetalleOpen(false);
        setBoletaDetalle(null);
    }
    function facturarBoleta(boleta: BoletaRecord) {
        alert(`Facturar boleta: ${boleta['ID Ingresos'] || boleta.id}`);
    }
    const [items, setItems] = useState<BoletaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => {
        let cancel = false;
        async function load() {
            setLoading(true); setError('');
            const token = localStorage.getItem('token');
            if (!token) { setError('No autenticado'); setLoading(false); return; }
            try {
                const res = await fetch('/api/boletas?tipo=facturadas&skip=0&limit=300', { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) { const d = await res.json().catch(() => ({})); if (!cancel) setError(String(d?.detail || 'Error')); }
                else { const d = await res.json().catch(() => []); if (!cancel && Array.isArray(d)) setItems(d); }
            } catch { if (!cancel) setError('Error de conexión'); }
            finally { if (!cancel) setLoading(false); }
        }
        load();
        return () => { cancel = true; };
    }, []);

    // Filtrar items por búsqueda
    const filteredItems = items.filter((b) => {
        const razonSocial = (b.cliente || b.nombre || b['Razon Social'] || '').toString().toLowerCase();
        const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '').toString().toLowerCase();
        const searchText = search.toLowerCase();
        return razonSocial.includes(searchText) || repartidor.includes(searchText);
    });

    return (
        <div className="p-4 md:p-6 space-y-4">
            <h1 className="text-xl font-bold text-purple-700">Boletas Facturadas</h1>
            <div className="mb-4">
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por razón social o repartidor..."
                    className="border rounded px-3 py-2 w-full max-w-md"
                />
            </div>
            {loading && <p>Cargando...</p>}
            {error && <p className="text-red-600">{error}</p>}
            {!loading && !error && (
                <div className="overflow-auto border rounded bg-white">
                    <table className="w-full text-sm">
                        <thead className="bg-purple-50">
                            <tr>
                                <th className="p-2">Repartidor</th>
                                <th className="p-2">Razón Social</th>
                                <th className="p-2">Total</th>
                                <th className="p-2">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map((b, i) => {
                                const rawTotal = b.total || b.INGRESOS || '';
                                const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                                const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                                const razonSocial = b.cliente || b.nombre || b['Razon Social'] || '';
                                const id = b['ID Ingresos'] || b.id || i;
                                const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
                                return (
                                    <tr key={id} className="border-t">
                                        <td className="p-2">{repartidor}</td>
                                        <td className="p-2">{razonSocial}</td>
                                        <td className="p-2">{total}</td>
                                        <td className="p-2 flex gap-2">
                                            <button
                                                className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition"
                                                onClick={() => abrirDetalle(b)}
                                            >Ver detalles</button>
                                            {!(b['Nro Comprobante']) && (
                                                <button
                                                    className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 transition"
                                                    onClick={() => facturarBoleta(b)}
                                                >Facturar</button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filteredItems.length === 0 && (
                        <div className="p-4 text-gray-500">No hay boletas facturadas</div>
                    )}
                </div>
            )}
            {/* Modal de detalles de boleta */}
            {detalleOpen && boletaDetalle && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
                        <h3 className="text-xl font-bold mb-4">Detalle de Boleta</h3>
                        <pre className="text-xs bg-gray-100 p-2 rounded mb-4 overflow-x-auto max-h-64">{JSON.stringify(boletaDetalle, null, 2)}</pre>
                        {boletaDetalle['Nro Comprobante'] && (
                            <div className="bg-green-100 text-green-700 p-2 rounded mb-2">Esta boleta está facturada.<br />Ticket: {boletaDetalle['Nro Comprobante'] || '-'}</div>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400" onClick={cerrarDetalle}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
