"use client";
import { useEffect, useMemo, useState, useRef } from 'react';
import { useBoletas } from '@/context/BoletasStore';
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { buildInvoiceItem, facturarItems, buildValidItems, getVentaConceptos, InvoiceItemRequest } from "../../lib/facturacion";
import { useToast } from "@/hooks/useToast";
import { ToastContainer } from "@/components/Toast";

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
    Fecha?: string;
    fecha?: string;
    facturacion?: string;
    Estado?: string;
    estado?: string;
    [key: string]: unknown;
}

export default function BoletasNoFacturadasPage() {
    // Toast notifications
    const { toasts, removeToast, success: showSuccess, error: showError, warning: showWarning } = useToast();

    // user role not needed in this view
    const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set()); // IDs en proceso
    const [isProcessing, setIsProcessing] = useState(false); // Flag general de procesamiento

    // Referencia para limpiar URLs de objetos (PDFs)
    const objectUrlsRef = useRef<Set<string>>(new Set());

    // Limpieza de URLs al desmontar el componente
    useEffect(() => {
        const urls = objectUrlsRef.current;
        return () => {
            console.log('🧹 Limpiando recursos de memoria (ObjectURLs)...');
            urls.forEach(url => {
                window.URL.revokeObjectURL(url);
            });
            urls.clear();
        };
    }, []);

    // Contador de boletas seleccionadas
    const selectedCount = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds]);

    // Función para limpiar toda la selección manualmente
    const clearSelection = () => {
        setSelectedIds({});
    };

    // buildInvoiceItem ahora proviene de helper unificado (importado)

    // --- HELPERS PARA DESCARGA ---
    const downloadInvoicePDF = async (facturaId: string | number, token: string) => {
        if (!facturaId) return false;
        console.log(`📄 Descargando comprobante #${facturaId}...`);
        try {
            const pdfRes = await fetch(`/api/comprobantes/${facturaId}/pdf`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (pdfRes.ok) {
                const blob = await pdfRes.blob();
                if (blob.type !== 'application/pdf') {
                    console.warn('⚠️ El blob no es un PDF válido:', blob.type);
                    return false;
                }

                const url = window.URL.createObjectURL(blob);
                objectUrlsRef.current.add(url);

                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `comprobante_${facturaId}.pdf`;
                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    window.URL.revokeObjectURL(url);
                    objectUrlsRef.current.delete(url);
                    if (document.body.contains(a)) document.body.removeChild(a);
                }, 5000);
                return true;
            } else {
                console.error('❌ Error descargando PDF:', pdfRes.status);
                return false;
            }
        } catch (error) {
            console.error('❌ Excepción descargando PDF:', error);
            return false;
        }
    };

    async function facturarBoleta(boleta: BoletaRecord) {
        const token = localStorage.getItem('token');
        if (!token) { showError('No autenticado'); return; }

        const ventaId = getStableId(boleta);

        // Marcar como en proceso
        setProcessingIds(prev => new Set([...prev, ventaId]));
        setIsProcessing(true);

        try {
            const built = buildInvoiceItem(boleta);
            if ('error' in built) {
                showError('Boleta no facturable (falta ID o total <= 0)');
                return;
            }

            if (ventaId && facturadasSet.has(ventaId)) {
                showWarning('Esta operación ya está facturada');
                return;
            }

            // Obtener conceptos de la venta
            const realVentaId = String((boleta as Record<string, unknown>)['ID Ingresos'] || boleta.id || '');
            if (realVentaId) {
                const conceptos = await getVentaConceptos(realVentaId, token);
                if (conceptos.length > 0) {
                    built.conceptos = conceptos;
                }
            }

            const result = await facturarItems([built], token);
            if (!result.ok) {
                if (result.error && result.error.toLowerCase().includes('no existen credenciales afip')) {
                    showError('No existen credenciales de AFIP para esta empresa. Solicite a un administrador que cargue las credenciales antes de facturar.');
                } else if (result.error && result.error.toLowerCase().includes('emisor_cuit no especificado')) {
                    showError('No se especificó el CUIT emisor. No es posible facturar sin credenciales propias.');
                } else {
                    showError(result.error || 'Error al facturar');
                }
                return;
            }

            const data = result.data;
            let successMsgStr = 'Facturación exitosa';

            if (Array.isArray(data) && data.length > 0) {
                const firstResult = data[0];
                const facturaId = firstResult?.factura_id || firstResult?.result?.factura_id;

                if (facturaId && firstResult.status === 'SUCCESS') {
                    const downloaded = await downloadInvoicePDF(facturaId, token);
                    if (downloaded) successMsgStr += ' ✅ PDF descargado';
                }
            }

            // Si tuvo éxito, limpiar de la selección y recargar
            setSelectedIds(prev => {
                const next = { ...prev };
                delete next[ventaId];
                return next;
            });
            await reload();
            showSuccess(successMsgStr);
        } catch (error) {
            console.error('❌ Error en facturación:', error);
            showError('Error inesperado durante la facturación');
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(ventaId);
                return next;
            });
            setIsProcessing(false);
        }
    }

    const {
        boletasNoFacturadas,
        boletasFacturadas,
        totalNoFacturadas,
        loading,
        error: storeError,
        reload,
        filters: storeFilters
    } = useBoletas();
    const error = storeError ?? '';

    // Sincronizar estado local con el store al montar y cuando el store cambie externamente
    const [search, setSearch] = useState(storeFilters.search || '');
    const [fechaDesde, setFechaDesde] = useState<string>(storeFilters.fechaDesde || '');
    const [fechaHasta, setFechaHasta] = useState<string>(storeFilters.fechaHasta || '');

    // Actualizar estado local si los filtros del store cambian (ej. al borrar filtros)
    useEffect(() => {
        if (storeFilters.search !== undefined && storeFilters.search !== search) setSearch(storeFilters.search);
        if (storeFilters.fechaDesde !== undefined && storeFilters.fechaDesde !== fechaDesde) setFechaDesde(storeFilters.fechaDesde);
        if (storeFilters.fechaHasta !== undefined && storeFilters.fechaHasta !== fechaHasta) setFechaHasta(storeFilters.fechaHasta);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storeFilters.search, storeFilters.fechaDesde, storeFilters.fechaHasta]);

    // AHORA ES ASÍ DE SIMPLE: 
    const items = boletasNoFacturadas ?? [];
    const pageItems = items; // Ya vienen paginados del servidor 
    const totalPages = Math.max(1, Math.ceil(totalNoFacturadas / 50)); // Usamos el total real del server 
    const currentPage = storeFilters.page || 1;

    const facturadasSet = useMemo(() => {
        const arr = boletasFacturadas ?? [];
        const s = new Set<string>();
        for (const b of arr as Record<string, unknown>[]) {
            const id = String(b.ingreso_id ?? b['ID Ingresos'] ?? b.id ?? '');
            if (id) s.add(id);
        }
        return s;
    }, [boletasFacturadas]);

    const getLocalDateStr = (d = new Date()) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const formatDate = (raw: any) => {
        if (!raw) return '-';
        const t = String(raw).trim();
        if (!t || t.toLowerCase() === 'none' || t.toLowerCase() === 'null') return '-';

        try {
            // Caso 1: DD/MM/YYYY
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return t;

            // Caso 2: YYYY-MM-DD (ISO date)
            if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
                const [yyyy, mm, dd] = t.split('T')[0].split('-');
                return `${dd}/${mm}/${yyyy}`;
            }

            // Caso 3: Date object o string parseable
            const d = new Date(t);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            }
        } catch { }
        return t;
    };

    const getStableId = (b: BoletaRecord) => {
        const id = b['ID Ingresos'] || b.id || b.ingreso_id;
        if (id) return String(id);
        const fecha = String(b.Fecha || b.fecha || b.FECHA || '');
        const total = String(b.total || b.INGRESOS || '0');
        const cliente = String(b.cliente || b.nombre || b['Razon Social'] || 'anon');
        const repartidor = String(b.Repartidor || b.repartidor || '');
        return `temp-${cliente}-${repartidor}-${total}-${fecha}`.replace(/\s+/g, '_').toLowerCase();
    };


    // Persistir fechas y búsqueda en el store (CON DEBOUNCE PARA EVITAR LOOPS) 
    useEffect(() => {
        const timer = setTimeout(() => {
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
                changed = true;
            }

            if (changed) {
                console.log('🔄 Filtros cambiaron, pidiendo al servidor...');
                reload(newFilters);
            }
        }, 600); // Espera 600ms a que termines de escribir 

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps 
    }, [fechaDesde, fechaHasta, search]);

    // Limpieza automática de selecciones obsoletas
    useEffect(() => {
        if (Object.keys(selectedIds).length === 0) return;

        // Obtener IDs de los items actualmente visibles/filtrados
        const currentVisibleIds = new Set(pageItems.map((b) => getStableId(b)));

        setSelectedIds(prev => {
            const next = { ...prev };
            let changed = false;
            for (const id in next) {
                if (next[id] && !currentVisibleIds.has(id)) {
                    delete next[id];
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [pageItems]); // Removido selectedIds para evitar loops infinitos

    function clearFilters() {
        setFechaDesde('');
        setFechaHasta('');
        setSearch('');
        reload({ fechaDesde: '', fechaHasta: '', search: '', page: 1 });
    }

    async function facturarSeleccionadas() {
        const token = localStorage.getItem('token');
        if (!token) { showError('No autenticado'); return; }
        const ids = Object.keys(selectedIds).filter(k => selectedIds[k]);
        if (ids.length === 0) { showWarning('No hay boletas seleccionadas'); return; }
        if (ids.length > 5) {
            showError(`Límite excedido: Seleccionaste ${ids.length} boletas. El máximo permitido es 5 por operación.`);
            return;
        }
        if (!confirm(`¿Facturar ${ids.length} boleta(s) seleccionada(s)?`)) return;
        setProcessingIds(new Set(ids));
        setIsProcessing(true);
        try {
            const selectedRaw = ids.map(id => items.find((b) => getStableId(b) === id)).filter(Boolean).filter(b => !facturadasSet.has(getStableId(b as BoletaRecord)));
            const { valid } = await buildValidItems(selectedRaw as Record<string, unknown>[]);
            if (valid.length === 0) { showWarning('No hay boletas válidas para facturar'); return; }
            const itemsConConceptos = await Promise.all((valid as unknown as InvoiceItemRequest[]).map(async (item: InvoiceItemRequest) => {
                const ventaId = String(item.id || '');
                if (ventaId) {
                    const conceptos = await getVentaConceptos(ventaId, token);
                    if (conceptos.length > 0) item.conceptos = conceptos;
                }
                return item;
            }));
            const result = await facturarItems(itemsConConceptos, token);
            if (!result.ok) { showError(result.error || 'Error al facturar'); return; }

            // Descargar todos los comprobantes exitosos
            let downloadCount = 0;
            if (Array.isArray(result.data)) {
                for (const res of result.data) {
                    const fid = res?.factura_id || res?.result?.factura_id;
                    if (fid && res.status === 'SUCCESS') {
                        const ok = await downloadInvoicePDF(fid, token);
                        if (ok) downloadCount++;
                    }
                }
            }

            // 1. Limpieza de IDs
            setSelectedIds({});

            let successMsgStrMulti = `Facturación procesada: ${result.data?.length || 0}`;
            if (downloadCount > 0) successMsgStrMulti += ` (PDFs: ${downloadCount})`;
            showSuccess(successMsgStrMulti);

            // 2. Sincronización de UI: Implementar la llamada a reload() después de la limpieza
            // Garantizar que la actualización de la UI sea consistente
            await reload();
        } catch (error) {
            console.error('❌ Error en facturación múltiple:', error);
            showError('Error durante la facturación múltiple');
        } finally {
            setProcessingIds(new Set());
            setIsProcessing(false);
        }
    }

    return (
        <div className="p-4 md:p-6 space-y-4">
            <ToastContainer toasts={toasts} onRemove={removeToast} />
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
                    <div className="flex flex-wrap items-end gap-2">
                        <button
                            className="px-3 py-2 border rounded text-sm hover:bg-gray-50 bg-white"
                            onClick={() => {
                                const t = getLocalDateStr();
                                setFechaDesde(t);
                                setFechaHasta(t);
                            }}
                        >Hoy</button>
                        <button
                            className="px-3 py-2 border rounded text-sm hover:bg-gray-50 bg-white"
                            onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() - 1);
                                const y = getLocalDateStr(d);
                                setFechaDesde(y);
                                setFechaHasta(y);
                            }}
                        >Ayer</button>
                        <button
                            className="px-3 py-2 border rounded text-sm hover:bg-gray-50 bg-white"
                            onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() - 7);
                                setFechaDesde(getLocalDateStr(d));
                                setFechaHasta(getLocalDateStr());
                            }}
                        >Últimos 7 días</button>
                        <button
                            className="px-3 py-2 border rounded text-sm hover:bg-gray-50 bg-white"
                            onClick={clearFilters}
                        >Borrar filtros</button>
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
                        <button
                            className={`px-3 py-2 rounded text-xs transition-colors flex items-center gap-2 ${isProcessing ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                            onClick={facturarSeleccionadas}
                            disabled={isProcessing}
                        >
                            {isProcessing ? 'Procesando...' : 'Facturar seleccionadas'}
                        </button>
                        <button className="px-3 py-2 bg-blue-500 text-white rounded text-xs" onClick={() => { clearSelection(); reload(); }}>Forzar actualización</button>
                        <button className="px-3 py-2 border rounded text-xs" onClick={clearFilters}>Borrar filtros</button>

                        {/* Contador visual de selección con límite */}
                        <div className={`px-3 py-2 rounded text-xs font-bold border flex items-center gap-2 ${selectedCount >= 5 ? 'bg-red-50 border-red-200 text-red-700' : (selectedCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500')}`}>
                            <span>Seleccionadas: {selectedCount} / 5</span>
                            {selectedCount >= 5 && <span className="animate-pulse">⚠️ Límite alcanzado</span>}
                        </div>
                        {selectedCount > 0 && (
                            <button className="px-3 py-2 bg-red-100 text-red-700 border border-red-200 rounded text-xs hover:bg-red-200 transition-colors" onClick={clearSelection}>
                                Limpiar selección
                            </button>
                        )}
                    </div>

                    <div className="md:hidden divide-y">
                        {pageItems.map((b, i) => {
                            const id = getStableId(b);
                            const ya = facturadasSet.has(id);
                            return (
                                <div key={`${id}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                                    <input
                                        type="checkbox"
                                        checked={!!selectedIds[id]}
                                        disabled={!selectedIds[id] && selectedCount >= 5}
                                        onChange={(e) => {
                                            const isChecked = e.target.checked;
                                            if (isChecked && selectedCount >= 5) {
                                                showWarning('Límite de selección alcanzado (máximo 5 boletas)');
                                                return;
                                            }
                                            setSelectedIds(prev => {
                                                const next = { ...prev };
                                                if (isChecked) next[id] = true;
                                                else delete next[id];
                                                return next;
                                            });
                                        }}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium truncate">{String(b.cliente || b.nombre || b['Razon Social'] || '— Sin razón social —')}</div>
                                        <div className="text-[11px] text-gray-600">Repartidor: {String(b.Repartidor || '-')} | Fecha: {formatDate(b.Fecha || b.fecha)}</div>
                                        {ya && <div className="text-[11px] text-red-600 font-bold">Ya facturada</div>}
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-sm">${String(Math.round(parseFloat(String(b.total || b.INGRESOS || '0').replace(/,/g, ''))))}</div>
                                        <button
                                            className={`text-xs px-2 py-1 rounded mt-1 ${processingIds.has(id) || ya ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 text-white'}`}
                                            onClick={() => facturarBoleta(b)}
                                            disabled={processingIds.has(id) || isProcessing || ya}
                                        >
                                            {processingIds.has(id) ? '...' : 'Facturar'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="hidden md:block">
                        <table className="w-full text-sm">
                            <thead className="bg-purple-50">
                                <tr>
                                    <th className="p-2 w-10">
                                        <input
                                            type="checkbox"
                                            onChange={(e) => {
                                                const v = e.target.checked;
                                                const m: Record<string, boolean> = {};

                                                if (v) {
                                                    // Si intentamos seleccionar todo, debemos respetar el límite de 5
                                                    let count = selectedCount;
                                                    pageItems.forEach((b) => {
                                                        const id = getStableId(b);
                                                        if (id && !facturadasSet.has(id) && !selectedIds[id]) {
                                                            if (count < 5) {
                                                                m[id] = true;
                                                                count++;
                                                            }
                                                        }
                                                    });
                                                    if (count === 5 && pageItems.some(b => !facturadasSet.has(getStableId(b)) && !selectedIds[getStableId(b)] && !m[getStableId(b)])) {
                                                        showWarning('Solo se seleccionaron las primeras boletas hasta alcanzar el límite de 5');
                                                    }
                                                } else {
                                                    // Deseleccionar todos los visibles
                                                    pageItems.forEach((b) => {
                                                        const id = getStableId(b);
                                                        if (id) m[id] = false;
                                                    });
                                                }

                                                setSelectedIds(s => {
                                                    const next = { ...s };
                                                    Object.keys(m).forEach(k => {
                                                        if (m[k]) next[k] = true;
                                                        else delete next[k];
                                                    });
                                                    return next;
                                                });
                                            }}
                                            checked={pageItems.length > 0 && pageItems.every((b) => {
                                                const id = getStableId(b);
                                                return facturadasSet.has(id) || !!selectedIds[id];
                                            })}
                                        />
                                    </th>
                                    <th className="p-2 text-left">Repartidor</th>
                                    <th className="p-2 text-left">Razón Social</th>
                                    <th className="p-2 text-left">Fecha</th>
                                    <th className="p-2 text-right">Total</th>
                                    <th className="p-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map((b, i) => {
                                    const id = getStableId(b);
                                    const ya = facturadasSet.has(id);
                                    return (
                                        <tr key={`${id}-${i}`} className={`border-t hover:bg-gray-50 ${ya ? 'opacity-60 bg-gray-50' : ''}`}>
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={!!selectedIds[id]}
                                                    disabled={ya || (!selectedIds[id] && selectedCount >= 5)}
                                                    onChange={(e) => {
                                                        const isChecked = e.target.checked;
                                                        if (isChecked && selectedCount >= 5) {
                                                            showWarning('Límite de selección alcanzado (máximo 5 boletas)');
                                                            return;
                                                        }
                                                        setSelectedIds(prev => {
                                                            const next = { ...prev };
                                                            if (isChecked) next[id] = true;
                                                            else delete next[id];
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </td>
                                            <td className="p-2">{String(b.Repartidor || '-')}</td>
                                            <td className="p-2">{String(b.cliente || b.nombre || b['Razon Social'] || '—')}</td>
                                            <td className="p-2">{formatDate(b.Fecha || b.fecha)}</td>
                                            <td className="p-2 text-right font-mono font-bold">${String(Math.round(parseFloat(String(b.total || b.INGRESOS || '0').replace(/,/g, ''))))}</td>
                                            <td className="p-2 text-center">
                                                {ya ? (
                                                    <span className="text-xs font-bold text-red-600">YA FACTURADA</span>
                                                ) : (
                                                    <button
                                                        className={`px-3 py-1 rounded text-xs transition ${processingIds.has(id) ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                                                        onClick={() => facturarBoleta(b)}
                                                        disabled={processingIds.has(id) || isProcessing}
                                                    >
                                                        {processingIds.has(id) ? 'Procesando...' : 'Facturar'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-3 border-t bg-gray-50 flex items-center justify-between">
                        <div className="text-[11px] text-gray-500 font-medium">Mostrando {pageItems.length} boletas de {totalNoFacturadas} encontradas</div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 mr-2">Total: {totalNoFacturadas}</span>
                            <button
                                className={`px-3 py-1 rounded text-sm border ${currentPage <= 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-100'}`}
                                onClick={() => reload({ page: currentPage - 1 })}
                                disabled={currentPage <= 1}
                            >Anterior</button>
                            <span className="text-xs font-medium">Página {currentPage} de {totalPages}</span>
                            <button
                                className={`px-3 py-1 rounded text-sm border ${currentPage >= totalPages ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white hover:bg-gray-100'}`}
                                onClick={() => reload({ page: currentPage + 1 })}
                                disabled={currentPage >= totalPages}
                            >Siguiente</button>
                        </div>
                    </div>

                    {pageItems.length === 0 && (
                        <div className="p-12 text-center text-gray-500 italic">No se encontraron boletas con los filtros actuales</div>
                    )}
                </div>
            )}
        </div>
    );
}
