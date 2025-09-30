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
    // user role not needed in this view
    const [repartidoresMap, setRepartidoresMap] = useState<Record<string, string[]> | null>(null);
    const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
    // estado para acciones masivas
    interface FacturarPayload {
        id: string | number;
        total: number;
        medio_pago?: string;
        cliente_data?: {
            cuit_o_dni?: string;
            nombre_razon_social?: string;
            domicilio?: string;
            condicion_iva?: string;
        };
    }

    function abrirDetalle(boleta: BoletaRecord) {
        setBoletaDetalle(boleta);
        setDetalleOpen(true);
    }
    function cerrarDetalle() {
        setDetalleOpen(false);
        setBoletaDetalle(null);
    }
    async function facturarBoleta(boleta: BoletaRecord) {
        const bx = boleta as Record<string, unknown>;
        const ingreso = String(bx['ingreso_id'] ?? bx['ID Ingresos'] ?? bx['id'] ?? '');
        if (!ingreso) { alert('ID de ingreso no disponible'); return; }
        const token = localStorage.getItem('token');
        if (!token) { alert('No autenticado'); return; }

        // pedir medio de pago simple
        const medio = prompt('Medio de pago (por ejemplo: Efectivo, Tarjeta):', 'Efectivo');
        if (!medio) return;

        // intentar inferir total y datos del cliente
        const totalRaw = bx['total'] ?? bx['INGRESOS'] ?? bx['Total a Pagar'] ?? 0;
        const totalNum = typeof totalRaw === 'number' ? totalRaw : parseFloat(String(totalRaw).replace(/[^0-9\-,\.]/g, '').replace(/,/g, '.')) || 0;

        const payloadItem = {
            id: ingreso,
            total: Math.round(totalNum),
            medio_pago: medio,
            cliente_data: {
                cuit_o_dni: String(bx['cuit'] ?? bx['CUIT'] ?? bx['dni'] ?? bx['DNI'] ?? ''),
                nombre_razon_social: String(bx['cliente'] ?? bx['nombre'] ?? bx['Razon Social'] ?? ''),
                domicilio: String(bx['Domicilio'] ?? ''),
                condicion_iva: String(bx['condicion_iva'] ?? bx['condicion-iva'] ?? ''),
            }
        };

        try {
            const res = await fetch('/api/facturar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify([payloadItem])
            });

            const text = await res.text().catch(() => '');
            let data: unknown = {};
            try { data = text && (text.trim().startsWith('{') || text.trim().startsWith('[')) ? JSON.parse(text) : { message: text }; } catch { data = { message: text }; }

            if (!res.ok) {
                const detail = (data && typeof data === 'object' && (data as Record<string, unknown>)['detail']) || (data && typeof data === 'object' && (data as Record<string, unknown>)['mensaje']) || (data && typeof data === 'object' && (data as Record<string, unknown>)['message']) || text || 'Error al facturar';
                alert(String(detail));
                return;
            }

            // mostrar éxito y refrescar lista
            let successMsg = 'Facturación exitosa';
            if (Array.isArray(data)) {
                const okCount = data.filter((x: unknown) => {
                    if (!x || typeof x !== 'object') return false;
                    return (x as Record<string, unknown>)['ok'] !== false;
                }).length;
                successMsg = `Facturación procesada: ${okCount} / ${data.length}`;
            } else if (data && typeof data === 'object' && (data as Record<string, unknown>)['mensaje']) {
                successMsg = String((data as Record<string, unknown>)['mensaje']);
            }
            alert(String(successMsg));
            // refrescar la lista
            setRefreshTick(t => t + 1);
        } catch (e) {
            alert('Error de conexión al facturar: ' + String(e));
        }
    }

    // helper removed (not used)

    async function descargarComprobanteJPG(b: BoletaRecord) {
        // Preferir imagen generada por el backend (incluye CAE y QR si existieran)
        const bx = b as Record<string, unknown>;
        const ingreso = String(bx['ingreso_id'] ?? bx['ID Ingresos'] ?? bx['id'] ?? '');
        if (!ingreso) { alert('ID de ingreso no disponible'); return; }
        const token = localStorage.getItem('token');
        if (!token) { alert('No autenticado'); return; }
        try {
            const res = await fetch(`/api/impresion/${encodeURIComponent(ingreso)}/facturar-imagen`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) {
                const txt = await res.text().catch(() => res.statusText || 'Error');
                alert(`Error generando imagen: ${txt}`);
                return;
            }
            const blob = await res.blob();
            let filename = `comprobante_${ingreso}.jpg`;
            try {
                const cd = res.headers.get('content-disposition') || '';
                const m = cd.match(/filename\*?=([^;]+)/i);
                if (m && m[1]) filename = decodeURIComponent(m[1].replace(/UTF-8''/, '').replace(/^"|'|"$/g, ''));
            } catch { /* ignore */ }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => { try { URL.revokeObjectURL(url); } catch { } }, 5000);
        } catch (e) {
            alert('Error generando imagen: ' + String(e));
        }
    }
    const [items, setItems] = useState<BoletaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [fechaDesde, setFechaDesde] = useState<string>('');
    const [fechaHasta, setFechaHasta] = useState<string>('');
    // Tick para controlar refrescos manuales / programados sin recargar al seleccionar checkboxes
    const [refreshTick, setRefreshTick] = useState(0);

    // Cargar boletas y repartidores una sola vez o cuando se solicite refresco explícito
    useEffect(() => {
        let cancel = false;
        (async () => {
            setLoading(true); setError('');
            const token = localStorage.getItem('token');
            if (!token) { if (!cancel) { setError('No autenticado'); setLoading(false); } return; }
            try {
                // Ejecutar en paralelo para menor latencia acumulada
                const [resBoletas, resReps] = await Promise.all([
                    fetch('/api/boletas?tipo=no-facturadas&limit=300', { headers: { Authorization: `Bearer ${token}` } }),
                    fetch('/api/boletas/repartidores', { headers: { Authorization: `Bearer ${token}` } })
                ]);

                if (!resBoletas.ok) {
                    const d: unknown = await resBoletas.json().catch(() => ({}));
                    let detalle: string | undefined;
                    if (d && typeof d === 'object' && 'detail' in d) {
                        const val = (d as Record<string, unknown>).detail;
                        if (typeof val === 'string') detalle = val; else if (val != null) detalle = JSON.stringify(val);
                    }
                    if (!cancel) setError(detalle || 'Error cargando boletas');
                } else {
                    let dRaw: unknown;
                    try { dRaw = await resBoletas.json(); } catch { dRaw = []; }
                    if (!Array.isArray(dRaw)) {
                        console.warn('[no-facturadas] Respuesta no es array', dRaw);
                    } else {
                        const arr = dRaw as BoletaRecord[];
                        console.log('[no-facturadas] Boletas recibidas (crudas):', arr.length);
                        if (arr.length > 0) {
                            console.log('[no-facturadas] Claves ejemplo primer registro:', Object.keys(arr[0] as Record<string, unknown>));
                            console.log('[no-facturadas] Estado facturacion primeros 5:', arr.slice(0, 5).map(x => (x as Record<string, unknown>)['facturacion'] || (x as Record<string, unknown>)['Facturacion'] || (x as Record<string, unknown>)['estado'] || (x as Record<string, unknown>)['Estado']));
                        }
                        if (!cancel) setItems(arr);
                    }
                }

                if (resReps.ok) {
                    const data = await resReps.json().catch(() => []);
                    if (Array.isArray(data) && !cancel) {
                        const map: Record<string, string[]> = {};
                        for (const row of data) {
                            const rname = String(row.repartidor || '').trim();
                            const razones = Array.isArray(row.razones_sociales) ? row.razones_sociales.map(String) : [];
                            if (rname) map[rname] = razones;
                        }
                        setRepartidoresMap(map);
                    }
                }
            } catch {
                if (!cancel) setError('Error de conexión');
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, [refreshTick]);

    // Refrescar automáticamente cada 2 minutos (opcional). Se puede ajustar o eliminar.
    useEffect(() => {
        const id = setInterval(() => {
            setRefreshTick(t => t + 1);
        }, 120000); // 120s
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        // reset selection when items change
        const map: Record<string, boolean> = {};
        items.forEach((b) => { const id = String((b as Record<string, unknown>)['ID Ingresos'] || b.id || ''); if (id) map[id] = false; });
        setSelectedIds(map);
    }, [items]);

    // user role not needed in this view

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

    // (Resumen por repartidor eliminado: no se muestra en esta vista)

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

    // descargar por imagen ya no se usa en este flujo

    // Facturar varias boletas seleccionadas a la vez (usa el endpoint que acepta array)
    async function facturarSeleccionadas() {
        const token = localStorage.getItem('token');
        if (!token) { alert('No autenticado'); return; }
        const ids = Object.keys(selectedIds).filter(k => selectedIds[k]);
        if (ids.length === 0) { alert('No hay boletas seleccionadas'); return; }
        if (!confirm(`Vas a facturar ${ids.length} boletas seleccionadas. Continuar?`)) return;

    // construir payload a partir de items
    const payload: FacturarPayload[] = [];
        for (const sid of ids) {
            const found = items.find(b => String((b as Record<string, unknown>)['ID Ingresos'] || b.id || '') === sid);
            if (!found) continue;
            const bx = found as Record<string, unknown>;
            const totalRaw = bx['total'] ?? bx['INGRESOS'] ?? bx['Total a Pagar'] ?? 0;
            const totalNum = typeof totalRaw === 'number' ? totalRaw : parseFloat(String(totalRaw).replace(/[^0-9\-,\.]/g, '').replace(/,/g, '.')) || 0;
            payload.push({
                id: sid,
                total: Math.round(totalNum),
                medio_pago: 'Efectivo', // valor por defecto; el backend puede aceptarlo o lo puedes ajustar
                cliente_data: {
                    cuit_o_dni: String(bx['cuit'] ?? bx['CUIT'] ?? bx['dni'] ?? bx['DNI'] ?? ''),
                    nombre_razon_social: String(bx['cliente'] ?? bx['nombre'] ?? bx['Razon Social'] ?? ''),
                    domicilio: String(bx['Domicilio'] ?? ''),
                    condicion_iva: String(bx['condicion_iva'] ?? bx['condicion-iva'] ?? ''),
                }
            });
        }

        if (payload.length === 0) { alert('No se construyeron payloads válidos para las boletas seleccionadas'); return; }

        try {
            const res = await fetch('/api/facturar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const text = await res.text().catch(() => '');
            let data: unknown = {};
            try { data = text && (text.trim().startsWith('{') || text.trim().startsWith('[')) ? JSON.parse(text) : { message: text }; } catch { data = { message: text }; }
            if (!res.ok) {
                const detail = (data && typeof data === 'object' && (data as Record<string, unknown>)['detail']) || (data && typeof data === 'object' && (data as Record<string, unknown>)['mensaje']) || (data && typeof data === 'object' && (data as Record<string, unknown>)['message']) || text || 'Error al facturar';
                alert(String(detail));
                return;
            }
            let successMsg = 'Facturación procesada';
            if (Array.isArray(data)) {
                const okCount = data.filter((x: unknown) => {
                    if (!x || typeof x !== 'object') return false;
                    return (x as Record<string, unknown>)['ok'] !== false;
                }).length;
                successMsg = `Facturación procesada: ${okCount} / ${data.length}`;
            } else if (data && typeof data === 'object' && (data as Record<string, unknown>)['mensaje']) {
                successMsg = String((data as Record<string, unknown>)['mensaje']);
            }
            alert(successMsg);
            setRefreshTick(t => t + 1);
        } catch (e) {
            alert('Error de conexión al facturar: ' + String(e));
        }
    }

    // Test imágenes eliminado del flujo

    return (
        <div className="p-4 md:p-6 space-y-4">
            <h1 className="text-xl font-bold text-purple-700">Boletas No Facturadas</h1>
            <div className="flex flex-col gap-3 mb-4">
                {/* Resumen eliminado en esta vista */}
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
                    <div className="p-2 flex flex-wrap items-center gap-2 sticky top-0 bg-white z-10 border-b">
                        <button className="px-3 py-2 bg-green-600 text-white rounded text-xs" onClick={facturarSeleccionadas}>Facturar seleccionadas</button>
                        <button className="px-3 py-2 bg-blue-500 text-white rounded text-xs" onClick={() => setRefreshTick(t => t + 1)}>Refrescar</button>
                        <span className="ml-auto text-[11px] text-gray-500">Mostrando {filteredItems.length} / {itemsNoFacturadas.length}</span>
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
            {/* Test imágenes eliminado */}
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
                            </div>

                            {/* JSON debug removed */}

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
