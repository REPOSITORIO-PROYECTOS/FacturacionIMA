"use client";
import { useEffect, useState } from 'react';
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { buildInvoiceItem, facturarItems, buildValidItems } from "@/app/lib/facturacion";

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

    // buildInvoiceItem ahora proviene de helper unificado (importado)

    async function facturarBoleta(boleta: BoletaRecord) {
        const token = localStorage.getItem('token');
        if (!token) { alert('No autenticado'); return; }
        const built = buildInvoiceItem(boleta);
        if ('error' in built) {
            alert('Boleta no facturable (falta ID o total <= 0)');
            return;
        }
        const result = await facturarItems([built as any], token);
        const mode = result.meta?.mode || '¿?';
        if (!result.ok) {
            alert((result.error || 'Error al facturar') + ` (modo=${mode})`);
            return;
        }
        const data = result.data;
        let successMsg = 'Facturación exitosa';
        if (Array.isArray(data)) {
            const okCount = data.filter((r: any) => r && typeof r === 'object' && r.ok !== false).length;
            successMsg = `Facturación procesada: ${okCount} / ${data.length} (modo=${mode})`;
        }
        alert(successMsg);
        setRefreshTick(t => t + 1);
    }

    // helper removed (not used)

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

    // --- Filtrado por fecha robusto ---
    // Acepta formatos comunes: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, DD/MM/YY
    function parseFechaToKey(raw: string): number | null {
        if (!raw) return null;
        const t = String(raw).trim();
        const base = t.split(' ')[0].split('T')[0];
        let yyyy: number, mm: number, dd: number;
        if (/^\d{4}-\d{2}-\d{2}$/.test(base)) { // 2025-10-01
            [yyyy, mm, dd] = base.split('-').map(n => parseInt(n, 10));
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(base)) { // 01/10/2025
            const [d, m, y] = base.split('/');
            dd = parseInt(d, 10); mm = parseInt(m, 10); yyyy = parseInt(y, 10);
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(base)) { // 01-10-2025
            const [d, m, y] = base.split('-');
            dd = parseInt(d, 10); mm = parseInt(m, 10); yyyy = parseInt(y, 10);
        } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(base)) { // 2025/10/01
            const [y, m, d] = base.split('/');
            yyyy = parseInt(y, 10); mm = parseInt(m, 10); dd = parseInt(d, 10);
        } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(base)) { // 01/10/25 -> asumir 20xx
            const [d, m, y] = base.split('/');
            dd = parseInt(d, 10); mm = parseInt(m, 10); yyyy = 2000 + parseInt(y, 10);
        } else {
            return null;
        }
        if (!yyyy || !mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        return (yyyy * 10000) + (mm * 100) + dd; // clave comparable
    }

    const desdeKey = fechaDesde ? parseFechaToKey(fechaDesde) : null; // fechaDesde ya viene en YYYY-MM-DD
    const hastaKey = fechaHasta ? parseFechaToKey(fechaHasta) : null;

    const itemsConFecha = items.filter((b) => {
        if (!desdeKey && !hastaKey) return true;
        const fechaRaw = String(
            (b as Record<string, unknown>)['Fecha'] ||
            (b as Record<string, unknown>)['fecha'] ||
            (b as Record<string, unknown>)['FECHA'] || ''
        );
        const key = parseFechaToKey(fechaRaw);
        if (key == null) return false; // si no se pudo parsear, excluir
        if (desdeKey && key < desdeKey) return false;
        if (hastaKey && key > hastaKey) return false;
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
        // Sin confirm: acción directa
        const selectedRaw = ids.map(id => items.find(b => String((b as any)['ID Ingresos'] || (b as any).id || '') === id)).filter(Boolean);
        const { valid, invalid } = buildValidItems(selectedRaw as any[]);
        if (valid.length === 0) {
            alert('No hay boletas válidas para facturar (todas con total <= 0 o sin ID)');
            return;
        }
        if (invalid.length > 0) {
            console.warn('[facturarSeleccionadas] Saltando boletas inválidas:', invalid);
        }
        const result = await facturarItems(valid as any, token);
        const mode = result.meta?.mode || '¿?';
        if (!result.ok) {
            alert((result.error || 'Error al facturar') + ` (modo=${mode})`);
            return;
        }
        const data = result.data;
        let successMsg = 'Facturación procesada';
        if (Array.isArray(data)) {
            const okCount = data.filter((r: any) => r && typeof r === 'object' && r.ok !== false).length;
            successMsg = `Facturación procesada: ${okCount} / ${data.length} (modo=${mode})`;
        }
        if (invalid.length > 0) successMsg += ` (Saltadas ${invalid.length})`;
        alert(successMsg);
        setRefreshTick(t => t + 1);
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
                                    <th className="p-2">Fecha</th>
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
                                    const fecha = String((b as Record<string, unknown>)['Fecha'] || (b as Record<string, unknown>)['fecha'] || '');
                                    return (
                                        <tr key={`${String(id)}-${i}`} className="border-t">
                                            <td className="p-2"><input aria-label={`Seleccionar boleta ${String(id)}`} type="checkbox" checked={!!selectedIds[String(id)]} onChange={(e) => setSelectedIds(s => ({ ...s, [String(id)]: e.target.checked }))} /></td>
                                            <td className="p-2">{repartidor}</td>
                                            <td className="p-2">{razonSocial}</td>
                                            <td className="p-2">{fecha}</td>
                                            <td className="p-2">{total}</td>
                                            <td className="p-2 flex gap-2">
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
            {/* Modal de detalles eliminado */}
        </div>
    );
}
