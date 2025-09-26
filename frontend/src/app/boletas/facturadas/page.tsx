"use client";
import { useEffect, useState } from 'react';
// Image import removed because data-URL QR previews use plain <img>
import { LoadingSpinner } from "../../components/LoadingSpinner";

interface BoletaRecord {
    id?: number | string;
    total?: number | string;
    INGRESOS?: number | string;
    importe_total?: number | string;
    importe_neto?: number | string;
    cliente?: string;
    nombre?: string;
    'Razon Social'?: string;
    'ID Ingresos'?: number | string;
    Repartidor?: string;
    'Nro Comprobante'?: string | number;
    numero_comprobante?: string | number;
    fecha_comprobante?: string;
    created_at?: string;
    nro_doc_receptor?: string | number;
    ingreso_id?: string;
    cae?: string;
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

    function imprimirComprobante(b: BoletaRecord) {
        // Descarga directa de la imagen del comprobante usando el endpoint /api/impresion/{id}
        (async () => {
            const token = localStorage.getItem('token');
            if (!token) { alert('No autenticado'); return; }
            const id = b.ingreso_id || b['ID Ingresos'] || b.id;
            if (!id) { alert('ID no disponible'); return; }
            try {
                const res = await fetch(`/api/impresion/${encodeURIComponent(String(id))}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) {
                    const txt = await res.text().catch(() => res.statusText || 'Error');
                    alert(`Error al descargar comprobante: ${txt}`);
                    return;
                }
                const blob = await res.blob();
                let filename = `comprobante_${String(id)}.jpg`;
                try {
                    const cd = res.headers.get('content-disposition') || '';
                    const m = cd.match(/filename\*?=([^;]+)/i);
                    if (m && m[1]) {
                        filename = decodeURIComponent(m[1].replace(/UTF-8''/, '').replace(/^"'|"'$/g, ''));
                    }
                } catch { }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => { try { URL.revokeObjectURL(url); } catch { } }, 5000);
            } catch (error) {
                alert('Error al descargar comprobante: ' + String(error));
            }
        })();
    }

    // Removed unused helpers (facturarYImprimir, descargarComprobanteJPG) to avoid eslint warnings

    // escapeXml removed: not used in this file

    // Helpers removed: QR image download/convert helpers were unused after removing QR UI

    // Obtener razones sociales asociadas a un repartidor, con coincidencia flexible
    function getRazonesFor(repartidor: string | undefined): string[] {
        if (!repartidor || !repartidoresMap) return [];
        const key = Object.keys(repartidoresMap).find(k => k === repartidor || k.toLowerCase() === String(repartidor).toLowerCase());
        if (key) return repartidoresMap[key] ?? [];
        // intentar búsqueda por inclusión
        const key2 = Object.keys(repartidoresMap).find(k => k.toLowerCase().includes(String(repartidor).toLowerCase()) || String(repartidor).toLowerCase().includes(k.toLowerCase()));
        return key2 ? (repartidoresMap[key2] ?? []) : [];
    }
    const [items, setItems] = useState<BoletaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [repartidoresMap, setRepartidoresMap] = useState<Record<string, string[]> | null>(null);
    const [fechaDesde, setFechaDesde] = useState<string>('');
    const [fechaHasta, setFechaHasta] = useState<string>('');
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
        // Cargar mapping de repartidores -> razones sociales
        (async function loadRepartidores() {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;
                const r = await fetch('/api/boletas/repartidores', { headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) return;
                const data = await r.json().catch(() => []);
                if (!Array.isArray(data)) return;
                const map: Record<string, string[]> = {};
                for (const row of data) {
                    const rname = String(row.repartidor || '').trim();
                    const razones = Array.isArray(row.razones_sociales) ? row.razones_sociales.map(String) : [];
                    if (rname) map[rname] = razones;
                }
                setRepartidoresMap(map);
            } catch {
                // no bloquear la carga de boletas si falla esta llamada
            }
        })();
        return () => { cancel = true; };
    }, []);

    // Restaurar/persistir fechas
    useEffect(() => {
        try {
            // Usar las mismas claves que el Dashboard para mantener el mismo contexto
            const fd = localStorage.getItem('filtro_fecha_desde') || '';
            const fh = localStorage.getItem('filtro_fecha_hasta') || '';
            if (fd || fh) { setFechaDesde(fd); setFechaHasta(fh); }
        } catch { /* noop */ }
    }, []);
    useEffect(() => {
        try {
            localStorage.setItem('filtro_fecha_desde', fechaDesde);
            localStorage.setItem('filtro_fecha_hasta', fechaHasta);
        } catch { /* noop */ }
    }, [fechaDesde, fechaHasta]);

    const normalizaFecha = (texto: string): string | null => {
        if (!texto) return null;
        const t = String(texto).trim();
        const base = t.split(' ')[0].split('T')[0];
        if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return base; // YYYY-MM-DD
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(base)) {
            const [dd, mm, yyyy] = base.split('/');
            return `${yyyy}-${mm}-${dd}`;
        }
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(base)) {
            const [yyyy, mm, dd] = base.split('/');
            return `${yyyy}-${mm}-${dd}`;
        }
        return null;
    };

    const itemsConFecha = items.filter((b) => {
        if (!fechaDesde && !fechaHasta) return true;
        // soportar las claves que envía el backend: fecha_comprobante, created_at, Fecha, fecha, FECHA
        const fechaRaw = String(
            (b as Record<string, unknown>)['fecha_comprobante'] ||
            (b as Record<string, unknown>)['created_at'] ||
            (b as Record<string, unknown>)['Fecha'] ||
            (b as Record<string, unknown>)['fecha'] ||
            (b as Record<string, unknown>)['FECHA'] || ''
        );
        const f = normalizaFecha(fechaRaw);
        if (!f) return false;
        if (fechaDesde && f < fechaDesde) return false;
        if (fechaHasta && f > fechaHasta) return false;
        return true;
    });

    // Filtrar items por búsqueda
    const filteredItems = itemsConFecha.filter((b) => {
        const razonSocial = (b.cliente || b.nombre || b['Razon Social'] || '').toString().toLowerCase();
        const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '').toString().toLowerCase();
        const searchText = search.toLowerCase();
        return razonSocial.includes(searchText) || repartidor.includes(searchText);
    });

    return (
        <div className="p-4 md:p-6 space-y-4">
            <h1 className="text-xl font-bold text-purple-700">Boletas Facturadas</h1>
            <div className="flex flex-col gap-3 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Fecha desde</label>
                        <input aria-label="Fecha desde" type="date" className="border rounded px-3 py-2 w-full" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Fecha hasta</label>
                        <input aria-label="Fecha hasta" type="date" className="border rounded px-3 py-2 w-full" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                    </div>
                    <div className="flex items-end gap-2">
                        <button
                            className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                            onClick={() => { const t = new Date().toISOString().split('T')[0]; setFechaDesde(t); setFechaHasta(t); }}
                        >Hoy</button>
                        <button
                            className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                            onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); const y = d.toISOString().split('T')[0]; setFechaDesde(y); setFechaHasta(y); }}
                        >Ayer</button>
                        <button
                            className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                            onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                        >Borrar</button>
                    </div>
                </div>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por razón social o repartidor..."
                    className="border rounded px-3 py-2 w-full max-w-md"
                />
            </div>
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <LoadingSpinner label="Cargando boletas facturadas…" />
                </div>
            )}
            {error && <p className="text-red-600">{error}</p>}
            {!loading && !error && (
                <div className="overflow-auto border rounded bg-white">
                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                        {filteredItems.map((b, i) => {
                            const rawTotal = b.importe_total || b.total || b.INGRESOS || '';
                            const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                            const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                            const razonSocial = b.razon_social || b.cliente || b.nombre || b['Razon Social'] || '';
                            const id = b.ingreso_id || b['ID Ingresos'] || b.id || i;
                            const repartidor = (b.repartidor ?? b.Repartidor ?? '') as string;
                            const nroComp = b['Nro Comprobante'] || b.numero_comprobante || (b as Record<string, unknown>)['numero_comprobante'];
                            return (
                                <div key={`${String(id)}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{String(razonSocial)}</div>
                                        <div className="text-[11px] text-gray-600">Repartidor: {String(repartidor || '-')}</div>
                                        {(() => {
                                            const razones = getRazonesFor(repartidor);
                                            if (!razones || razones.length === 0) return null;
                                            return <div className="text-[11px] text-gray-500">Razón: {razones.join(', ')}</div>;
                                        })()}
                                        <div className="text-[11px] text-gray-600">Fecha: {String(b.fecha_comprobante || b.created_at || '-')}</div>
                                        <div className="text-[11px] text-gray-600">Total: {String(total)}</div>
                                    </div>
                                    <div className="shrink-0 flex gap-2">
                                        <button
                                            className="text-xs text-blue-700 hover:underline"
                                            onClick={() => abrirDetalle(b)}
                                        >Detalles</button>
                                        {!nroComp && (
                                            <button
                                                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                                                onClick={() => facturarBoleta(b)}
                                            >Facturar</button>
                                        )}
                                        <button
                                            className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300"
                                            onClick={() => imprimirComprobante(b)}
                                        >Imprimir</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block">
                        <table className="w-full text-sm">
                            <thead className="bg-purple-50">
                                <tr>
                                    <th className="p-2">Repartidor</th>
                                    <th className="p-2">Razón Social</th>
                                    <th className="p-2">Fecha</th>
                                    <th className="p-2">Total</th>
                                    <th className="p-2">CAE</th>
                                    <th className="p-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((b, i) => {
                                    // Acomodar el campo importe_total que manda el backend
                                    const rawTotal = b.importe_total || b.total || b.INGRESOS || '';
                                    const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                                    const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                                    const razonSocial = b.cliente || b.nombre || b['Razon Social'] || '';
                                    const id = b.ingreso_id || b['ID Ingresos'] || b.id || i;
                                    const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
                                    const nroComp = b['Nro Comprobante'] || b.numero_comprobante || (b as Record<string, unknown>)['numero_comprobante'];
                                    return (
                                        <tr key={`${String(id)}-${i}`} className="border-t">
                                            <td className="p-2">
                                                <div>{String(repartidor)}</div>
                                                {(() => {
                                                    const razones = getRazonesFor(repartidor);
                                                    if (!razones || razones.length === 0) return null;
                                                    return <div className="text-xs text-gray-500">{razones.join(', ')}</div>;
                                                })()}
                                            </td>
                                            <td className="p-2">{String(razonSocial)}</td>
                                            <td className="p-2">{String(b.fecha_comprobante || b.created_at || '-')}</td>
                                            <td className="p-2">{total}</td>
                                            <td className="p-2">{b.cae || '-'}</td>
                                            <td className="p-2 flex gap-2">
                                                <button
                                                    className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition"
                                                    onClick={() => abrirDetalle(b)}
                                                >Ver detalles</button>
                                                {/* aquí podríamos mostrar un botón de facturar si no existe comprobante */}
                                                {!nroComp && (
                                                    <button className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700" onClick={() => facturarBoleta(b)}>Facturar</button>
                                                )}
                                                <button className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300" onClick={() => imprimirComprobante(b)}>Imprimir</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

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
                        <div className="grid grid-cols-1 gap-4 mb-4">
                            <div className="space-y-2">
                                <div className="flex justify-between"><div className="font-medium text-sm">Fecha</div><div className="text-sm text-gray-700">{String(boletaDetalle.fecha || boletaDetalle.fecha_comprobante || boletaDetalle.created_at || boletaDetalle['Fecha'] || '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Cliente / Razón social</div><div className="text-sm text-gray-700">{String(boletaDetalle.razon_social || boletaDetalle['Razon Social'] || boletaDetalle.Cliente || boletaDetalle.cliente || '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Repartidor</div><div className="text-sm text-gray-700">{String(boletaDetalle.repartidor || boletaDetalle.Repartidor || '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Total</div><div className="text-sm text-gray-700">{String(boletaDetalle['Total a Pagar'] ?? boletaDetalle.importe_total ?? boletaDetalle.INGRESOS ?? boletaDetalle.Total ?? '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Tipo de pago</div><div className="text-sm text-gray-700">{String(boletaDetalle['Tipo Pago'] ?? boletaDetalle.TipoPago ?? boletaDetalle['Tipo de Pago'] ?? '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Nro comprobante</div><div className="text-sm text-gray-700">{String(boletaDetalle['Nro Comprobante'] || boletaDetalle.numero_comprobante || '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Estado</div><div className="text-sm text-gray-700">{String(boletaDetalle.Estado ?? boletaDetalle.estado ?? boletaDetalle.facturacion ?? '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">IDs</div><div className="text-sm text-gray-700">Ingreso: {String(boletaDetalle.id_ingreso ?? boletaDetalle['ID Ingresos'] ?? boletaDetalle.ingreso_id ?? '-')} — Pedido: {String(boletaDetalle['ID Pedido'] ?? boletaDetalle.id_pedido ?? '-')}</div></div>
                            </div>

                            <div className="flex items-center justify-between">
                                <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={() => imprimirComprobante(boletaDetalle)}>Imprimir comprobante</button>
                            </div>
                        </div>

                        <div className="flex gap-2 justify-end">
                            <button className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400" onClick={cerrarDetalle}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

