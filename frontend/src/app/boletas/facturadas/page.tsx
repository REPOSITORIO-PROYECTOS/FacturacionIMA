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
    function parseRawResponse(b: BoletaRecord): Record<string, unknown> | null {
        const raw = (b.raw_response ?? (b as Record<string, unknown>)['raw_response']);
        if (!raw) return null;
        if (typeof raw === 'object') return raw as Record<string, unknown>;
        try {
            return JSON.parse(String(raw));
        } catch {
            // a veces el backend ya devuelve string escapado; intentar reemplazos básicos
            try {
                return JSON.parse(String(raw).replace(/\\\"/g, '"'));
            } catch {
                return null;
            }
        }
    }

    function imprimirComprobante(b: BoletaRecord) {
        const parsed = parseRawResponse(b) || {};
        const fecha = (b.fecha_comprobante || b.created_at || '') as string;
        const nro = b['Nro Comprobante'] || b.numero_comprobante || (b as Record<string, unknown>)['numero_comprobante'] || '-';
        const cae = parsed?.cae || b.cae || '-';
        const total = b.importe_total ?? b.total ?? b.INGRESOS ?? '';
        const razon = b.cliente || b.nombre || b['Razon Social'] || '';
        const qrCandidate = parsed?.qr_code || parsed?.qr || (b as Record<string, unknown>)['qr_url_afip'] as unknown || parsed?.qr_code_data || null;
        const qr = typeof qrCandidate === 'string' ? qrCandidate : null;

        const html = `
<!doctype html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Comprobante ${String(nro)}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #111 }
        .card { border: 1px solid #ddd; padding: 18px; max-width: 720px; margin: 0 auto }
        .header { display:flex; justify-content:space-between; align-items:center }
        .qr { max-width:160px }
        .lines { margin-top:12px }
        .lines div { margin-bottom:8px }
        .small { color:#666; font-size:0.9em }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <div>
                <h2>Comprobante ${String(nro)}</h2>
                <div class="small">Fecha: ${String(fecha)}</div>
            </div>
            ${qr ? `<img class="qr" src="${qr}" alt="QR"/>` : ''}
        </div>
        <div class="lines">
            <div><strong>Razón social:</strong> ${String(razon)}</div>
            <div><strong>Importe:</strong> ${String(total)}</div>
            <div><strong>CAe:</strong> ${String(cae)}</div>
            <div><strong>Ingreso ID:</strong> ${String(b.ingreso_id ?? b['ID Ingresos'] ?? '')}</div>
        </div>
        <hr />
        <pre style="white-space:pre-wrap;background:#f8f8f8;padding:8px;border-radius:6px">${JSON.stringify(parsed || {}, null, 2)}</pre>
    </div>
    <script>
        setTimeout(()=>{ window.print(); }, 300);
    </script>
</body>
</html>
`;

        const w = window.open('', '_blank', 'noopener,noreferrer');
        if (!w) { alert('No se pudo abrir ventana para imprimir. Revisa el bloqueador de ventanas.'); return; }
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    // Helpers para manejar data URLs (QR) -> permitir descargar/convertir a JPG
    function dataUrlToBlob(dataUrl: string) {
        const parts = dataUrl.split(',');
        const meta = parts[0].match(/data:(.*);base64/);
        const mime = meta ? meta[1] : 'image/png';
        const binary = atob(parts[1]);
        const len = binary.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
        return new Blob([u8], { type: mime });
    }

    function downloadBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function downloadDataUrlAsFile(dataUrl: string, filename: string) {
        try {
            const blob = dataUrlToBlob(dataUrl);
            downloadBlob(blob, filename);
        } catch {
            alert('No se pudo descargar la imagen');
        }
    }

    function convertPngDataUrlToJpegDataUrl(dataUrl: string, quality = 0.92): Promise<string | null> {
        return new Promise((resolve) => {
            const img = document.createElement('img');
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = (img as HTMLImageElement).width;
                canvas.height = (img as HTMLImageElement).height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }
                // pintar fondo blanco para evitar transparencias
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img as CanvasImageSource, 0, 0);
                try {
                    const jpeg = canvas.toDataURL('image/jpeg', quality);
                    resolve(jpeg);
                } catch { resolve(null); }
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
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
            } catch (e) {
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
                        <input type="date" className="border rounded px-3 py-2 w-full" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-600 mb-1">Fecha hasta</label>
                        <input type="date" className="border rounded px-3 py-2 w-full" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
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
                                <div key={id} className="px-3 py-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{String(razonSocial)}</div>
                                        <div className="text-[11px] text-gray-600">Repartidor: {String(repartidor || '-')}</div>
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
                                    <th className="p-2">Total</th>
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
                                        <tr key={id} className="border-t">
                                <td className="p-2">{repartidor}</td>
                                <td className="p-2">{razonSocial}</td>
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div className="md:col-span-2">
                                <pre className="text-xs bg-gray-100 p-2 rounded mb-2 overflow-x-auto max-h-64">{JSON.stringify(boletaDetalle, null, 2)}</pre>
                            </div>
                            <div className="md:col-span-1 flex flex-col items-center gap-2">
                                {/* QR preview y acciones */}
                                {(() => {
                                    const parsed = parseRawResponse(boletaDetalle) || {};
                                    const qr = parsed?.qr_code || parsed?.qr || (boletaDetalle as Record<string, unknown>)['qr_url_afip'] as string | undefined || null;
                                    if (!qr || typeof qr !== 'string') return <div className="text-sm text-gray-500">Sin QR</div>;
                                    return (
                                        <div className="w-full flex flex-col items-center">
                                            {/* data URLs no siempre son optimizables por next/image, usamos img directo para asegurar compatibilidad */}
                                            <img src={qr} alt="QR" className="w-40 h-40 object-contain bg-white p-2 border" />
                                            <div className="flex gap-2 mt-2">
                                                <button className="px-2 py-1 bg-gray-200 rounded" onClick={() => downloadDataUrlAsFile(qr as string, `qr_${boletaDetalle.ingreso_id || boletaDetalle.id || 'comp'}.png`)}>Descargar PNG</button>
                                                <button className="px-2 py-1 bg-gray-200 rounded" onClick={async () => {
                                                    const jpeg = await convertPngDataUrlToJpegDataUrl(qr as string);
                                                    if (!jpeg) { alert('No se pudo convertir a JPEG'); return; }
                                                    downloadDataUrlAsFile(jpeg, `qr_${boletaDetalle.ingreso_id || boletaDetalle.id || 'comp'}.jpg`);
                                                }}>Descargar JPG</button>
                                            </div>
                                            <button className="mt-2 px-2 py-1 bg-blue-500 text-white rounded" onClick={() => {
                                                const w = window.open('', '_blank', 'noopener');
                                                if (!w) return alert('No se pudo abrir ventana');
                                                w.document.write(`<img src="${qr as string}" onload="setTimeout(()=>window.print(),200)"/>`);
                                                w.document.close();
                                            }}>Imprimir QR</button>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
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
