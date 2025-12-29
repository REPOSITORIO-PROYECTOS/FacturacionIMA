"use client";
import { useEffect, useState, useMemo, useRef } from 'react';
import { useBoletas } from '@/context/BoletasStore';
// Image import removed because data-URL QR previews use plain <img>
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { useToast } from "@/hooks/useToast";
import { ToastContainer } from "@/components/Toast";

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
    // Toast notifications
    const { toasts, removeToast, success: showSuccess, error: showError } = useToast();

    // Estado de procesamiento para botones
    const [processingId, setProcessingId] = useState<string | number | null>(null);
    const objectUrlsRef = useRef<Set<string>>(new Set());

    // Limpieza de ObjectURLs al desmontar
    useEffect(() => {
        const urls = objectUrlsRef.current;
        return () => {
            urls.forEach(url => window.URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    const getFacturaId = (b: BoletaRecord): string | number | null => {
        // Priorizar IDs específicos de facturación AFIP si existen
        return (b as Record<string, unknown>).factura_id as string | number | null || b.id || b.ingreso_id || b['ID Ingresos'] || null;
    };

    const isAnulada = (b: BoletaRecord): boolean => {
        const v = (b as Record<string, unknown>).anulada;
        return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
    };

    async function imprimirComprobante(b: BoletaRecord) {
        const token = localStorage.getItem('token');
        if (!token) { showError('No autenticado'); return; }

        const facturaId = getFacturaId(b);
        if (!facturaId) {
            showError('ID de factura no disponible');
            return;
        }

        try {
            setProcessingId(facturaId);
            showSuccess('Generando PDF...');

            const res = await fetch(`/api/comprobantes/${facturaId}/pdf`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => res.statusText || 'Error');
                showError(`Error al descargar comprobante: ${txt}`);
                return;
            }

            const blob = await res.blob();
            if (blob.type !== 'application/pdf') {
                showError('El archivo descargado no es un PDF válido');
                return;
            }

            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.add(url);

            const filename = `comprobante_${String(facturaId)}.pdf`;
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // Fallback para visualización
            window.open(url, '_blank');

            setTimeout(() => {
                URL.revokeObjectURL(url);
                objectUrlsRef.current.delete(url);
                if (document.body.contains(a)) document.body.removeChild(a);
            }, 5000); // 5 segundos para asegurar la descarga

            showSuccess('✅ Comprobante descargado');
        } catch (error) {
            showError('Error al descargar comprobante: ' + String(error));
        } finally {
            setProcessingId(null);
        }
    }

    async function descargarTicketNC(b: BoletaRecord) {
        const token = localStorage.getItem('token');
        if (!token) { showError('No autenticado'); return; }

        const fid = getFacturaId(b);
        if (!fid) { showError('ID de factura no disponible'); return; }

        try {
            setProcessingId(`nc-${fid}`);
            showSuccess('Generando Ticket NC...');

            const res = await fetch(`/api/comprobantes/nota-credito/${fid}/pdf`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => 'Error al descargar');
                showError(`No se pudo descargar Ticket NC: ${txt}`);
                return;
            }

            const blob = await res.blob();
            if (blob.type !== 'application/pdf') {
                showError('El archivo no es un PDF válido');
                return;
            }

            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.add(url);

            const a = document.createElement('a');
            a.href = url;
            a.download = `nota_credito_${fid}.pdf`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                URL.revokeObjectURL(url);
                objectUrlsRef.current.delete(url);
                if (document.body.contains(a)) document.body.removeChild(a);
            }, 5000);

            showSuccess('Ticket de Nota de Crédito descargado');
        } catch (e) {
            showError('Error descargando Ticket NC: ' + String(e));
        } finally {
            setProcessingId(null);
        }
    }

    async function anularComprobante(b: BoletaRecord) {
        const token = localStorage.getItem('token');
        if (!token) { showError('No autenticado'); return; }

        const fid = getFacturaId(b);
        if (!fid) { showError('ID de factura no disponible'); return; }

        const motivo = prompt('Motivo de anulación (opcional):') || '';

        try {
            setProcessingId(`anular-${fid}`);
            showSuccess('Procesando anulación en AFIP (puede tardar unos segundos)...');

            const res = await fetch(`/api/facturador/anular-afip/${fid}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ motivo, force: true })
            });

            const data = await res.json().catch(() => null);

            if (!res.ok) {
                const errorMsg = data?.detail || data?.error || 'Error al anular';
                showError(String(errorMsg));
                return;
            }

            showSuccess(`✅ Anulada exitosamente. NC: ${String(data?.codigo_nota_credito || '')}`);
            // Recargar datos para reflejar el estado anulado
            await reload();
        } catch (e) {
            showError('Error al procesar anulación: ' + String(e));
        } finally {
            setProcessingId(null);
        }
    }
    const { boletasFacturadas, totalFacturadas, loading, error: storeError, reload, filters: storeFilters } = useBoletas();
    const error = storeError ?? '';
    const [search, setSearch] = useState('');
    const [fechaDesde, setFechaDesde] = useState<string>('');
    const [fechaHasta, setFechaHasta] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'anuladas' | 'activas'>('all');
    const [page, setPage] = useState(1);

    // Restaurar fechas desde localStorage al inicio
    useEffect(() => {
        try {
            const fd = localStorage.getItem('boletas_facturadas_fecha_desde') || '';
            const fh = localStorage.getItem('boletas_facturadas_fecha_hasta') || '';
            if (fd) setFechaDesde(fd);
            if (fh) setFechaHasta(fh);
        } catch { /* noop */ }
    }, []);

    // Persistir fechas y búsqueda en el store (con debounce para evitar loops)
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                localStorage.setItem('boletas_facturadas_fecha_desde', fechaDesde);
                localStorage.setItem('boletas_facturadas_fecha_hasta', fechaHasta);
            } catch { /* noop */ }

            const newFilters: any = {};
            let changed = false;

            if (fechaDesde !== (storeFilters.fechaDesde || '')) {
                newFilters.fechaDesde = fechaDesde;
                changed = true;
            }
            if (fechaHasta !== (storeFilters.fechaHasta || '')) {
                newFilters.fechaHasta = fechaHasta;
                changed = true;
            }
            if (search !== (storeFilters.search || '')) {
                newFilters.search = search;
                newFilters.page = 1; // Reset a página 1 al buscar
                setPage(1);
                changed = true;
            }
            if (statusFilter !== (storeFilters.status || 'all')) {
                newFilters.status = statusFilter;
                newFilters.page = 1;
                setPage(1);
                changed = true;
            }

            if (changed) {
                console.log('🔄 Sincronizando filtros con el Store:', newFilters);
                reload(newFilters);
            }
        }, 500);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fechaDesde, fechaHasta, search, statusFilter]);

    // Manejo de cambio de página
    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        reload({ page: newPage });
    };

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

    const filteredItems = useMemo(() => {
        // El filtrado por búsqueda y fecha ya se hizo en el servidor
        return boletasFacturadas.filter((b) => {
            // Filtro por estado (este sigue siendo local por ahora)
            const anulada = isAnulada(b);
            if (statusFilter === 'anuladas' && !anulada) return false;
            if (statusFilter === 'activas' && anulada) return false;

            return true;
        });
    }, [boletasFacturadas, statusFilter]);

    const [sortDesc, setSortDesc] = useState<boolean>(true);

    const sortedItems = useMemo(() => {
        function getFechaKey(b: BoletaRecord): number {
            const raw = String(
                (b as Record<string, unknown>)['fecha_comprobante'] ||
                (b as Record<string, unknown>)['created_at'] ||
                (b as Record<string, unknown>)['Fecha'] ||
                (b as Record<string, unknown>)['fecha'] ||
                (b as Record<string, unknown>)['FECHA'] || ''
            );
            const norm = normalizaFecha(raw);
            if (!norm) return 0;
            const [yyyy, mm, dd] = norm.split('-');
            const n = parseInt(`${yyyy}${mm}${dd}`, 10);
            return isNaN(n) ? 0 : n;
        }
        return [...filteredItems].sort((a, b) => {
            const ak = getFechaKey(a);
            const bk = getFechaKey(b);
            return sortDesc ? (bk - ak) : (ak - bk);
        });
    }, [filteredItems, sortDesc]);

    const PAGE_SIZE = 50;
    const totalPages = Math.max(1, Math.ceil(totalFacturadas / PAGE_SIZE));
    const pageItems = sortedItems;

    function clearFilters() {
        setFechaDesde('');
        setFechaHasta('');
        setSearch('');
        setPage(1);
        reload({ fechaDesde: '', fechaHasta: '', search: '', page: 1 });
    }

    return (
        <div className="p-4 md:p-6 space-y-4">
            {/* Toast notifications container */}
            <ToastContainer toasts={toasts} onRemove={removeToast} />

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
                            onClick={clearFilters}
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
                <div className="flex items-center gap-2">
                    <label htmlFor="orden-lista-f" className="text-[12px] text-gray-600">Orden</label>
                    <select
                        id="orden-lista-f"
                        aria-label="Orden de lista"
                        className="border rounded px-2 py-1 text-xs"
                        value={sortDesc ? 'desc' : 'asc'}
                        onChange={(e) => setSortDesc(e.target.value === 'desc')}
                    >
                        <option value="desc">Recientes primero</option>
                        <option value="asc">Antiguas primero</option>
                    </select>
                    <label htmlFor="filtro-estado" className="text-[12px] text-gray-600 ml-2">Estado</label>
                    <select
                        id="filtro-estado"
                        aria-label="Filtro de estado"
                        className="border rounded px-2 py-1 text-xs"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'anuladas' | 'activas')}
                    >
                        <option value="all">Todas</option>
                        <option value="activas">Activas</option>
                        <option value="anuladas">Anuladas</option>
                    </select>
                </div>
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
                        {pageItems.map((b, i) => {
                            const rawTotal = b.importe_total || b.total || b.INGRESOS || '';
                            const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                            const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                            const razonSocial = b.razon_social || b.cliente || b.nombre || b['Razon Social'] || '';
                            const fid = getFacturaId(b) || i;
                            const repartidor = (b.repartidor ?? b.Repartidor ?? '') as string;
                            const anulada = isAnulada(b);

                            return (
                                <div key={`${String(fid)}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <div className="font-medium truncate">{String(razonSocial)}</div>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${anulada ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                {anulada ? 'ANULADA' : 'VIGENTE'}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-gray-600">Repartidor: {String(repartidor || '-')}</div>
                                        <div className="text-[11px] text-gray-600">Fecha: {String(b.fecha_comprobante || b.created_at || '-')}</div>
                                        <div className="text-[11px] text-gray-600 font-bold">Total: ${String(total)}</div>
                                    </div>
                                    <div className="shrink-0 flex flex-col gap-1">
                                        {!anulada ? (
                                            <>
                                                <button
                                                    disabled={!!processingId}
                                                    className={`text-[11px] px-2 py-1.5 rounded font-medium min-w-[70px] ${processingId ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                                    onClick={() => imprimirComprobante(b)}
                                                >
                                                    {processingId === fid ? <LoadingSpinner size="xs" /> : 'Imprimir'}
                                                </button>
                                                <button
                                                    disabled={!!processingId}
                                                    className={`text-[11px] px-2 py-1.5 rounded font-medium min-w-[70px] ${processingId ? 'bg-gray-100 text-gray-400' : 'bg-red-500 text-white hover:bg-red-600'}`}
                                                    onClick={() => anularComprobante(b)}
                                                >
                                                    {processingId === `anular-${fid}` ? '...' : 'Anular'}
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                disabled={!!processingId}
                                                className={`text-[11px] px-2 py-1.5 rounded font-medium min-w-[80px] ${processingId ? 'bg-gray-100 text-gray-400' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                                                onClick={() => descargarTicketNC(b)}
                                            >
                                                {processingId === `nc-${fid}` ? <LoadingSpinner size="xs" /> : 'Ticket NC'}
                                            </button>
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
                                    <th className="p-2">Repartidor</th>
                                    <th className="p-2">Razón Social</th>
                                    <th className="p-2">Fecha</th>
                                    <th className="p-2">Total</th>
                                    <th className="p-2">CAE</th>
                                    <th className="p-2">Estado</th>
                                    <th className="p-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map((b, i) => {
                                    const rawTotal = b.importe_total || b.total || b.INGRESOS || '';
                                    const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                                    const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                                    const razonSocial = b.cliente || b.nombre || b['Razon Social'] || '';
                                    const fid = getFacturaId(b) || i;
                                    const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
                                    const anulada = isAnulada(b);

                                    return (
                                        <tr key={`${String(fid)}-${i}`} className="border-t hover:bg-gray-50">
                                            <td className="p-2">
                                                <div>{String(repartidor)}</div>
                                            </td>
                                            <td className="p-2">{String(razonSocial)}</td>
                                            <td className="p-2">{String(b.fecha_comprobante || b.created_at || '-')}</td>
                                            <td className="p-2 font-medium">${total}</td>
                                            <td className="p-2 text-xs text-gray-500 font-mono">{b.cae || '-'}</td>
                                            <td className="p-2">
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold ${anulada ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                    {anulada ? 'ANULADA' : 'VIGENTE'}
                                                </span>
                                            </td>
                                            <td className="p-2">
                                                <div className="flex gap-2">
                                                    {!anulada ? (
                                                        <>
                                                            <button
                                                                disabled={!!processingId}
                                                                className={`text-[11px] px-2 py-1 rounded font-medium min-w-[70px] ${processingId ? 'bg-gray-100 text-gray-400' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                                                onClick={() => imprimirComprobante(b)}
                                                            >
                                                                {processingId === fid ? <LoadingSpinner size="xs" /> : 'Imprimir'}
                                                            </button>
                                                            <button
                                                                disabled={!!processingId}
                                                                className={`text-[11px] px-2 py-1 rounded font-medium min-w-[70px] ${processingId ? 'bg-gray-100 text-gray-400' : 'bg-red-500 text-white hover:bg-red-600'}`}
                                                                onClick={() => anularComprobante(b)}
                                                            >
                                                                {processingId === `anular-${fid}` ? '...' : 'Anular'}
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            disabled={!!processingId}
                                                            className={`text-[11px] px-2 py-1 rounded font-medium min-w-[80px] ${processingId ? 'bg-gray-100 text-gray-400' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                                                            onClick={() => descargarTicketNC(b)}
                                                        >
                                                            {processingId === `nc-${fid}` ? <LoadingSpinner size="xs" /> : 'Ticket NC'}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between p-3 border-t bg-gray-50">
                        <div className="text-[11px] text-gray-500 font-medium">Mostrando {pageItems.length} de {totalFacturadas} encontradas</div>
                        <div className="flex items-center gap-2">
                            <button
                                className={`px-3 py-1 rounded text-sm border ${page <= 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-100'}`}
                                onClick={() => handlePageChange(Math.max(1, page - 1))}
                                disabled={page <= 1}
                            >Anterior</button>
                            <span className="text-xs font-medium">Página {page} de {totalPages}</span>
                            <button
                                className={`px-3 py-1 rounded text-sm border ${page >= totalPages ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-100'}`}
                                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                                disabled={page >= totalPages}
                            >Siguiente</button>
                        </div>
                    </div>

                    {totalFacturadas === 0 && (
                        <div className="p-4 text-center text-gray-500 italic">No se encontraron boletas facturadas con los filtros aplicados</div>
                    )}
                </div>
            )}
            {/* Modal de detalles eliminado */}
        </div>
    );
}
