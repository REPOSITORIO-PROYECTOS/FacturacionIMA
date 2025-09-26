"use client";
import { useEffect, useState } from 'react';
import { LoadingSpinner } from "../../components/LoadingSpinner";

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
    const [detalleOpen, setDetalleOpen] = useState(false);
    const [boletaDetalle, setBoletaDetalle] = useState<BoletaRecord | null>(null);
    const [showRaw, setShowRaw] = useState(false);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [repartidoresMap, setRepartidoresMap] = useState<Record<string, string[]> | null>(null);
    const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
    // Estado para el modal de test imágenes
    const [testModalOpen, setTestModalOpen] = useState(false);
    interface TestResult {
        id?: string | number;
        ok?: boolean;
        size?: number;
        media_type?: string;
        error?: string;
        detail?: string;
    }
    const [testResults, setTestResults] = useState<TestResult[] | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    function abrirDetalle(boleta: BoletaRecord) {
        setBoletaDetalle(boleta);
        setDetalleOpen(true);
    }
    function cerrarDetalle() {
        setDetalleOpen(false);
        setBoletaDetalle(null);
    }
    function facturarBoleta(boleta: BoletaRecord) {
        // Aquí iría la lógica real de facturación (API, etc)
        alert(`Facturar boleta: ${boleta['ID Ingresos'] || boleta.id}`);
    }

    function escapeXml(unsafe: string) {
        return String(unsafe).replace(/[&<>"']/g, function (c) {
            switch (c) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&apos;';
                default: return c;
            }
        });
    }

    async function descargarComprobanteJPG(b: BoletaRecord) {
        const bx = b as Record<string, unknown>;
        const fecha = String(bx['Fecha'] ?? bx['fecha'] ?? '');
        const nro = b['Nro Comprobante'] || '-';
        const total = b.total ?? b.INGRESOS ?? '';
        const razon = b['Razon Social'] || b.cliente || b.nombre || '';
        const ingreso = String(b['ID Ingresos'] ?? b.id ?? '');

    // Produce an image that is 58mm wide.
    // 1 mm ≈ 3.7795275591 px at 96dpi. Multiply by devicePixelRatio for sharper output on high-dpi screens.
    const pxPerMm = 3.7795275591 * (window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(58 * pxPerMm)); // 58mm target width
    const lineHeight = Math.round(7 * (window.devicePixelRatio || 1));
    const padding = Math.round(6 * (window.devicePixelRatio || 1));
        const lines = [
            `Comprobante: ${String(nro)}`,
            `Fecha: ${String(fecha)}`,
            `Razón social: ${String(razon)}`,
            `Importe: ${String(total)}`,
            `Ingreso ID: ${ingreso}`,
        ];
        const height = padding * 2 + lines.length * lineHeight;
        const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>` +
            `<rect width='100%' height='100%' fill='#fff'/>` +
            `<style> .text{font:14px Arial; fill:#222;}</style>` +
            lines.map((l, idx) => `<text x='${padding}' y='${padding + (idx + 1) * lineHeight}' class='text'>${escapeXml(l)}</text>`).join('') +
            `</svg>`;
        try {
            const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas no soportado');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                        if (!blob) { alert('No se pudo generar la imagen'); URL.revokeObjectURL(url); return; }
                        const a = document.createElement('a');
                        const fileUrl = URL.createObjectURL(blob);
                        a.href = fileUrl;
                        a.download = `comprobante_${String(nro)}.jpg`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => { try { URL.revokeObjectURL(fileUrl); URL.revokeObjectURL(url); } catch { } }, 3000);
                    }, 'image/jpeg', 0.92);
                } catch (e) { alert('Error al generar la imagen: ' + String(e)); URL.revokeObjectURL(url); }
            };
            img.onerror = () => { alert('No se pudo cargar la imagen SVG para convertirla'); URL.revokeObjectURL(url); };
            img.src = url;
        } catch (e) { alert('Error creando comprobante: ' + String(e)); }
    }
    const [items, setItems] = useState<BoletaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [fechaDesde, setFechaDesde] = useState<string>('');
    const [fechaHasta, setFechaHasta] = useState<string>('');
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
                // ignore
            }
        })();
        return () => { cancel = true; };
    }, [selectedIds]);

    useEffect(() => {
        // reset selection when items change
        const map: Record<string, boolean> = {};
        items.forEach((b) => { const id = String((b as Record<string, unknown>)['ID Ingresos'] || b.id || ''); if (id) map[id] = !!selectedIds[id]; });
        setSelectedIds(map);
    }, [items]);

    // Leer rol de usuario desde localStorage para controlar visibilidad de botones (Mostrar JSON sólo para Admin/Soporte)
    useEffect(() => {
        try {
            const ui = JSON.parse(localStorage.getItem('user_info') || '{}');
            setUserRole(ui?.role || ui?.rol_nombre || ui?.rol || null);
        } catch { setUserRole(null); }
    }, []);

    // Restaurar/persistir fechas
    useEffect(() => {
        try {
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
        const fechaRaw = String((b as Record<string, unknown>)['Fecha'] || (b as Record<string, unknown>)['fecha'] || (b as Record<string, unknown>)['FECHA'] || '');
        const f = normalizaFecha(fechaRaw);
        if (!f) return false;
        if (fechaDesde && f < fechaDesde) return false;
        if (fechaHasta && f > fechaHasta) return false;
        return true;
    });

    // Filtrar solo boletas no facturadas
    const itemsNoFacturadas = itemsConFecha.filter((b) => {
        const estado = String(b.facturacion ?? b.Estado ?? b.estado ?? '').toLowerCase();
        return estado.includes('falta facturar') || estado.includes('no facturada');
    });

    // Filtrar items por búsqueda
    const filteredItems = itemsNoFacturadas.filter((b) => {
        const razonSocial = (b.cliente || b.nombre || b['Razon Social'] || '').toString().toLowerCase();
        const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '').toString().toLowerCase();
        const searchText = search.toLowerCase();
        return razonSocial.includes(searchText) || repartidor.includes(searchText);
    });

    function getRazonesFor(repartidor: string | undefined): string[] {
        if (!repartidor || !repartidoresMap) return [];
        const key = Object.keys(repartidoresMap).find(k => k === repartidor || k.toLowerCase() === String(repartidor).toLowerCase());
        if (key) return repartidoresMap[key] ?? [];
        const key2 = Object.keys(repartidoresMap).find(k => k.toLowerCase().includes(String(repartidor).toLowerCase()) || String(repartidor).toLowerCase().includes(k.toLowerCase()));
        return key2 ? (repartidoresMap[key2] ?? []) : [];
    }

    async function descargarPackSeleccionado() {
        // ...existing code...
        const token = localStorage.getItem('token');
        if (!token) { alert('No autenticado'); return; }
        const ids = Object.keys(selectedIds).filter(k => selectedIds[k]);
        if (ids.length === 0) { alert('No hay boletas seleccionadas'); return; }

        if (!confirm(`Vas a descargar ${ids.length} imagen(es) una por una. Continuar?`)) return;

        let success = 0;
        let failed = 0;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            try {
                // Call the proxy that triggers facturación+imagen and returns image/jpeg
                const res = await fetch(`/api/impresion/${encodeURIComponent(id)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) {
                    const txt = await res.text().catch(() => res.statusText || 'Error');
                    console.error(`Error al descargar ID ${id}:`, txt);
                    failed++;
                    continue;
                }
                const blob = await res.blob();
                // Try to infer filename from headers; fallback to comprobante_{id}.jpg
                let filename = `comprobante_${String(id)}.jpg`;
                try {
                    const cd = res.headers.get('content-disposition') || '';
                    const m = cd.match(/filename\*?=([^;]+)/i);
                    if (m && m[1]) {
                        filename = decodeURIComponent(m[1].replace(/UTF-8''/, '').replace(/^\"'|\"'$/g, ''));
                    }
                } catch (e) { /* ignore */ }

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                // Revoke URL after a short delay to ensure download started
                setTimeout(() => { try { URL.revokeObjectURL(url); } catch { } }, 5000);
                success++;
                // Small delay between downloads to reduce chance of browser blocking
                await new Promise((r) => setTimeout(r, 600));
                } catch {
                    failed++;
            }
        }

        alert(`Descarga finalizada: ${success} correctas, ${failed} errores.`);
    }

    // Test imágenes: llama al endpoint de diagnóstico y muestra resultados en modal
    async function testImagenesSeleccionadas() {
        const token = localStorage.getItem('token');
        if (!token) { alert('No autenticado'); return; }
        const ids = Object.keys(selectedIds).filter(k => selectedIds[k]);
        if (ids.length === 0) { alert('No hay boletas seleccionadas'); return; }
        setTestLoading(true);
        setTestModalOpen(true);
        setTestResults(null);
        try {
            const res = await fetch('/api/impresion/test-imagenes', {
                method: 'POST',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(ids)
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => 'Error');
                setTestResults([{ error: txt }]);
                return;
            }
            const data = await res.json();
            setTestResults(data.results || []);
        } catch (e) {
            setTestResults([{ error: String(e) }]);
        } finally {
            setTestLoading(false);
        }
    }

    return (
        <div className="p-4 md:p-6 space-y-4">
            <h1 className="text-xl font-bold text-purple-700">Boletas No Facturadas</h1>
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
                        <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50" onClick={() => { const t = new Date().toISOString().split('T')[0]; setFechaDesde(t); setFechaHasta(t); }}>Hoy</button>
                        <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 1); const y = d.toISOString().split('T')[0]; setFechaDesde(y); setFechaHasta(y); }}>Ayer</button>
                        <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50" onClick={() => { setFechaDesde(''); setFechaHasta(''); }}>Borrar</button>
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
                    <LoadingSpinner label="Cargando boletas no facturadas…" />
                </div>
            )}
            {error && <p className="text-red-600">{error}</p>}
            {!loading && !error && (
                <div className="overflow-auto border rounded bg-white">
                    <div className="p-2 flex items-center gap-2">
                        <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={descargarPackSeleccionado}>Descargar imágenes (ZIP)</button>
                        <button className="px-3 py-2 bg-yellow-500 text-white rounded" onClick={testImagenesSeleccionadas}>Test imágenes</button>
                    </div>
                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                        {filteredItems.map((b, i) => {
                            const rawTotal = b.total || b.INGRESOS || '';
                            const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                            const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                            const razonSocial = b.cliente || b.nombre || b['Razon Social'] || '';
                            const id = b['ID Ingresos'] || b.id || i;
                            const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
                            return (
                                <div key={`${String(id)}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                                    <input aria-label={`Seleccionar boleta ${String(id)}`} type="checkbox" checked={!!selectedIds[String(id)]} onChange={(e) => setSelectedIds(s => ({ ...s, [String(id)]: e.target.checked }))} />
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{razonSocial || '— Sin razón social —'}</div>
                                        <div className="text-[11px] text-gray-600">Repartidor: {repartidor || '-'}</div>
                                        {(() => {
                                            const razones = getRazonesFor(repartidor);
                                            if (!razones || razones.length === 0) return null;
                                            return <div className="text-[11px] text-gray-500">Razón: {razones.join(', ')}</div>;
                                        })()}
                                        <div className="text-[11px] text-gray-600">Total: {String(total)}</div>
                                    </div>
                                    <div className="shrink-0 flex gap-2">
                                        <button
                                            className="text-xs text-blue-700 hover:underline"
                                            onClick={() => abrirDetalle(b)}
                                        >Detalles</button>
                                        {!(b['Nro Comprobante']) && (
                                            <button
                                                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                                                onClick={() => facturarBoleta(b)}
                                            >Facturar</button>
                                        )}
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
                                    <th className="p-2"><input aria-label="Seleccionar todas" type="checkbox" onChange={(e) => { const v = e.target.checked; const m: Record<string, boolean> = {}; filteredItems.forEach(b => { const id = String((b as Record<string, unknown>)['ID Ingresos'] || b.id || ''); if (id) m[id] = v; }); setSelectedIds(m); }} /></th>
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
                                        <tr key={`${String(id)}-${i}`} className="border-t">
                                            <td className="p-2"><input aria-label={`Seleccionar boleta ${String(id)}`} type="checkbox" checked={!!selectedIds[String(id)]} onChange={(e) => setSelectedIds(s => ({ ...s, [String(id)]: e.target.checked }))} /></td>
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
                    </div>

                    {filteredItems.length === 0 && (
                        <div className="p-4 text-gray-500">No hay boletas</div>
                    )}
                </div>
            )}
            {/* Modal de test imágenes */}
            {testModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl">
                        <h3 className="text-xl font-bold mb-4">Test de generación de imágenes</h3>
                        {testLoading && <div className="py-4 text-center">Cargando…</div>}
                        {!testLoading && testResults && (
                            <div className="overflow-x-auto max-h-[60vh]">
                                <table className="w-full text-sm border">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="p-2">ID</th>
                                            <th className="p-2">OK</th>
                                            <th className="p-2">Tamaño</th>
                                            <th className="p-2">Media type</th>
                                            <th className="p-2">Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {testResults.map((r, i) => (
                                            <tr key={String(r.id || i)} className={r.ok ? '' : 'bg-red-50'}>
                                                <td className="p-2">{String(r.id || '')}</td>
                                                <td className="p-2">{r.ok ? '✔️' : '❌'}</td>
                                                <td className="p-2">{r.size ?? ''}</td>
                                                <td className="p-2">{r.media_type ?? ''}</td>
                                                <td className="p-2 text-xs text-red-600">{r.error || r.detail || ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="flex gap-2 justify-end mt-4">
                            <button className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400" onClick={() => setTestModalOpen(false)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de detalles de boleta */}
            {detalleOpen && boletaDetalle && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg">
                        <h3 className="text-xl font-bold mb-4">Detalle de Boleta</h3>
                        <div className="grid grid-cols-1 gap-4 mb-4">
                            <div className="space-y-2">
                                <div className="flex justify-between"><div className="font-medium text-sm">Fecha</div><div className="text-sm text-gray-700">{String(boletaDetalle.fecha || boletaDetalle['Fecha'] || '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Cliente / Razón social</div><div className="text-sm text-gray-700">{String(boletaDetalle['Razon Social'] || boletaDetalle.cliente || boletaDetalle.nombre || '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Repartidor</div><div className="text-sm text-gray-700">{String(boletaDetalle.repartidor || boletaDetalle.Repartidor || '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Total</div><div className="text-sm text-gray-700">{String(boletaDetalle['Total a Pagar'] ?? boletaDetalle.total ?? boletaDetalle.INGRESOS ?? '-')}</div></div>
                                <div className="flex justify-between"><div className="font-medium text-sm">Nro comprobante</div><div className="text-sm text-gray-700">{String(boletaDetalle['Nro Comprobante'] || '-')}</div></div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="flex gap-2">
                                    <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={() => descargarComprobanteJPG(boletaDetalle)}>Descargar JPG</button>
                                    <button className="px-3 py-2 bg-green-600 text-white rounded" onClick={() => { /* facturar y luego imprimir mediante backend */
                                        if (!boletaDetalle) return;
                                        (async () => {
                                            const token = localStorage.getItem('token');
                                            if (!token) { alert('No autenticado'); return; }
                                            const bx = boletaDetalle as Record<string, unknown>;
                                            const ingreso = String(bx['ingreso_id'] ?? bx['ID Ingresos'] ?? bx['id'] ?? '');
                                            if (!ingreso) { alert('ID no disponible'); return; }
                                            try {
                                                // Call backend to facturar and receive HTML; then open and print/download automatically
                                                const res = await fetch(`/api/boletas/imprimir/${encodeURIComponent(ingreso)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                                                const text = await res.text();
                                                if (!res.ok) { alert(text || 'Error en facturar e imprimir'); return; }
                                                // Open in new tab and trigger print automatically
                                                const blob = new Blob([text], { type: 'text/html' });
                                                const url = URL.createObjectURL(blob);
                                                const w = window.open(url, '_blank');
                                                if (!w) {
                                                    // Fallback: navigate current window to printable HTML then trigger print
                                                    window.location.href = url;
                                                    setTimeout(() => { try { window.print(); } catch { } }, 600);
                                                    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { } }, 5000);
                                                    return;
                                                }
                                                // Optionally trigger print after a short delay
                                                setTimeout(() => { try { w.print(); } catch { } }, 800);
                                            } catch (e) { alert('Error al facturar e imprimir: ' + String(e)); }
                                        })();
                                    }}>Facturar y imprimir</button>
                                </div>
                                {/* Mostrar JSON sólo si el rol es Admin o Soporte */}
                                {['Admin', 'Soporte'].includes(String(userRole || '')) && (
                                    <button className="px-3 py-2 bg-gray-200 rounded" onClick={() => setShowRaw(s => !s)}>{showRaw ? 'Ocultar JSON' : 'Mostrar JSON'}</button>
                                )}
                            </div>

                            {showRaw && (
                                <pre className="text-xs bg-gray-100 p-2 rounded mb-2 overflow-x-auto max-h-64">{JSON.stringify(boletaDetalle, null, 2)}</pre>
                            )}

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
