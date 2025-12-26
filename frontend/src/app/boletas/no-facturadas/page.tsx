"use client";
import { useEffect, useMemo, useState } from 'react';
import { useBoletas } from '@/context/BoletasStore';
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { buildInvoiceItem, facturarItems, buildValidItems, getVentaConceptos } from "../../lib/facturacion";
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
    const { toasts, removeToast, success: showSuccess, error: showError, warning: showWarning, info: showInfo } = useToast();

    // user role not needed in this view
    const [repartidoresMap, setRepartidoresMap] = useState<Record<string, string[]> | null>(null);
    const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set()); // IDs en proceso
    const [isProcessing, setIsProcessing] = useState(false); // Flag general de procesamiento
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
        if (!token) { showError('No autenticado'); return; }

        const ventaId = getStableId(boleta, 0);

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
            // Usamos el ID real de la venta para los conceptos, no el stableId generado
            const realVentaId = String((boleta as Record<string, unknown>)['ID Ingresos'] || boleta.id || '');
            if (realVentaId) {
                const conceptos = await getVentaConceptos(realVentaId, token);
                if (conceptos.length > 0) {
                    (built as any).conceptos = conceptos;
                    console.log(`✓ Boleta ${realVentaId}: ${conceptos.length} conceptos cargados`);
                }
            }

            const result = await facturarItems([built as any], token);
            if (!result.ok) {
                // ... rest of error handling remains same
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
            let successMsg = 'Facturación exitosa';

            console.log('📦 Respuesta completa de facturación:', JSON.stringify(data, null, 2));

            // ⭐ NUEVO: Descargar PDF automáticamente
            if (Array.isArray(data) && data.length > 0) {
                const firstResult = data[0];
                console.log('📋 Primer resultado:', JSON.stringify(firstResult, null, 2));

                const okCount = data.filter((r: any) => r && typeof r === 'object' && r.ok !== false && r.status === 'SUCCESS').length;
                successMsg = `Facturación procesada: ${okCount} / ${data.length}`;

                // Buscar factura_id en diferentes ubicaciones posibles
                const facturaId = firstResult?.factura_id || firstResult?.result?.factura_id;

                console.log('🔍 factura_id encontrado:', facturaId);

                if (facturaId && firstResult.status === 'SUCCESS') {
                    console.log(`📄 Descargando comprobante #${facturaId}...`);

                    try {
                        const pdfRes = await fetch(`/api/comprobantes/${facturaId}/pdf`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });

                        console.log('📡 Respuesta PDF:', pdfRes.status, pdfRes.statusText);

                        if (pdfRes.ok) {
                            const blob = await pdfRes.blob();
                            console.log('📦 Blob recibido, tamaño:', blob.size, 'bytes', 'tipo:', blob.type);

                            // Verificar que sea realmente un PDF
                            if (blob.type !== 'application/pdf') {
                                console.warn('⚠️ El blob no es un PDF válido:', blob.type);
                                const text = await blob.text();
                                console.error('Contenido recibido:', text.substring(0, 200));
                                throw new Error('Respuesta no es un PDF válido');
                            }

                            // Método mejorado de descarga compatible con todos los navegadores
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = `comprobante_${facturaId}.pdf`;
                            a.target = '_blank'; // Intentar abrir en nueva pestaña si falla la descarga

                            // Agregar al DOM, hacer clic, y remover
                            document.body.appendChild(a);

                            // Pequeña pausa para asegurar que el elemento está en el DOM
                            await new Promise(resolve => setTimeout(resolve, 100));

                            a.click();

                            console.log('✅ Click en enlace de descarga ejecutado');

                            // También intentar abrir en ventana nueva como fallback
                            try {
                                window.open(url, '_blank');
                            } catch (e) {
                                console.log('ℹ️ No se pudo abrir en ventana nueva (normal si se descargó)');
                            }

                            // Limpiar después de un momento
                            setTimeout(() => {
                                window.URL.revokeObjectURL(url);
                                if (document.body.contains(a)) {
                                    document.body.removeChild(a);
                                }
                                console.log('✅ Recursos de descarga liberados');
                            }, 2000);

                            console.log('✅ Comprobante descargado exitosamente');
                            successMsg += ' ✅ PDF descargado';
                        } else {
                            const errorText = await pdfRes.text();
                            console.error('❌ Error descargando PDF:', pdfRes.status, errorText);
                        }
                    } catch (pdfError) {
                        console.error('❌ Excepción descargando PDF:', pdfError);
                    }
                } else {
                    console.warn('⚠️ No se encontró factura_id o el status no es SUCCESS');
                }
            }

            // Si tuvo éxito, limpiar de la selección
            setSelectedIds(prev => {
                const next = { ...prev };
                delete next[ventaId];
                return next;
            });

            showSuccess(successMsg);
        } catch (error) {
            console.error('❌ Error en facturación:', error);
        } finally {
            // Remover de procesamiento
            setProcessingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(ventaId);
                return newSet;
            });
            setIsProcessing(false);
        }
    }

    // helper removed (not used)

    const { boletasNoFacturadas, boletasFacturadas, loading: storeLoading, error: storeError, reload } = useBoletas();
    const [search, setSearch] = useState('');
    const [fechaDesde, setFechaDesde] = useState<string>('');
    const [fechaHasta, setFechaHasta] = useState<string>('');
    // items provienen del store
    const items = boletasNoFacturadas ?? [];
    const loading = storeLoading;
    const error = storeError ?? '';
    const facturadasSet = useMemo(() => {
        const arr = boletasFacturadas ?? [];
        const s = new Set<string>();
        for (const b of arr as any[]) {
            const id = String((b as any).ingreso_id ?? (b as any)['ID Ingresos'] ?? (b as any).id ?? '');
            if (id) s.add(id);
        }
        return s;
    }, [boletasFacturadas]);

    // La carga de boletas ahora la gestiona el BoletasStore (carga inicial + polling cada 60s)

    // El store hace polling periódicamente; eliminamos el intervalo local
    // Mantenemos la selección entre recargas para evitar que se pierda al actualizarse la lista
    /* 
    useEffect(() => {
        // reset selection when items change
        const map: Record<string, boolean> = {};
        items.forEach((b) => { const id = String((b as Record<string, unknown>)['ID Ingresos'] || b.id || ''); if (id) { map[id] = false; } });
        setSelectedIds(map);
    }, [items]);
    */

    // user role not needed in this view

    // Restaurar/persistir fechas
    useEffect(() => {
        try {
            const fd = localStorage.getItem('boletas_no_facturadas_fecha_desde') || '';
            const fh = localStorage.getItem('boletas_no_facturadas_fecha_hasta') || '';
            if (fd || fh) { setFechaDesde(fd); setFechaHasta(fh); }
        } catch { /* noop */ }
    }, []);
    useEffect(() => {
        try {
            localStorage.setItem('boletas_no_facturadas_fecha_desde', fechaDesde);
            localStorage.setItem('boletas_no_facturadas_fecha_hasta', fechaHasta);
        } catch { /* noop */ }
    }, [fechaDesde, fechaHasta]);

    // --- Filtrado por fecha robusto ---
    // Acepta formatos comunes: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, DD/MM/YY
    function parseFechaToKey(raw: string | null | undefined): number | null {
        if (!raw) return null;
        const t = String(raw).trim();
        const base = t.split(' ')[0].split('T')[0];
        let yyyy: number | null = null, mm: number | null = null, dd: number | null = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(base) || /^\d{4}-\d{1,2}-\d{1,2}$/.test(base)) {
            const [y, m, d] = base.split('-');
            yyyy = parseInt(y, 10); mm = parseInt(m, 10); dd = parseInt(d, 10);
        } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(base)) {
            const [d, m, y] = base.split('/');
            dd = parseInt(d, 10); mm = parseInt(m, 10); yyyy = parseInt(y, 10);
        } else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(base)) {
            const [d, m, y] = base.split('-');
            dd = parseInt(d, 10); mm = parseInt(m, 10); yyyy = parseInt(y, 10);
        } else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(base)) {
            const [y, m, d] = base.split('/');
            yyyy = parseInt(y, 10); mm = parseInt(m, 10); dd = parseInt(d, 10);
        } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(base)) {
            const [d, m, y] = base.split('/');
            dd = parseInt(d, 10); mm = parseInt(m, 10); yyyy = 2000 + parseInt(y, 10);
        } else {
            return null;
        }
        if (!yyyy || !mm || !dd || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
        return (yyyy * 10000) + (mm * 100) + dd; // clave comparable
    }

    const getStableId = (b: BoletaRecord, index: number) => {
        const id = b['ID Ingresos'] || b.id;
        if (id) return String(id);
        // Si no hay ID, generamos uno basado en propiedades para que sea más estable que el simple índice de página
        return `temp-${b.cliente || b.nombre}-${b.total}-${b.Fecha || b.fecha || index}`;
    };

    const desdeKey = useMemo(() => fechaDesde ? parseFechaToKey(fechaDesde) : null, [fechaDesde]);
    const hastaKey = useMemo(() => fechaHasta ? parseFechaToKey(fechaHasta) : null, [fechaHasta]);

    const itemsConFecha = useMemo(() => {
        return items.filter((b) => {
            if (!desdeKey && !hastaKey) return true;
            const fechaRaw = String(
                (b as Record<string, unknown>)['Fecha'] ||
                (b as Record<string, unknown>)['fecha'] ||
                (b as Record<string, unknown>)['FECHA'] || ''
            );
            const key = parseFechaToKey(fechaRaw);
            if (key == null) return false;
            if (desdeKey && key < desdeKey) return false;
            if (hastaKey && key > hastaKey) return false;
            return true;
        });
    }, [items, desdeKey, hastaKey]);

    // Filtrar solo boletas no facturadas
    const itemsNoFacturadas = useMemo(() => {
        return itemsConFecha.filter((b) => {
            const estado = String(b.facturacion ?? b.Estado ?? b.estado ?? '').toLowerCase();
            return estado.includes('falta facturar') || estado.includes('no facturada');
        });
    }, [itemsConFecha]);

    // Filtrar items por búsqueda
    const filteredItems = useMemo(() => {
        const searchText = search.toLowerCase();
        if (!searchText) return itemsNoFacturadas;
        return itemsNoFacturadas.filter((b) => {
            const razonSocial = (b.cliente || b.nombre || b['Razon Social'] || '').toString().toLowerCase();
            const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '').toString().toLowerCase();
            return razonSocial.includes(searchText) || repartidor.includes(searchText);
        });
    }, [itemsNoFacturadas, search]);

    const [sortDesc, setSortDesc] = useState<boolean>(true);

    const sortedItems = useMemo(() => {
        function getFechaKeyFromBoleta(b: Record<string, unknown>): number {
            const fechaRaw = String(
                b['Fecha'] || b['fecha'] || b['FECHA'] || ''
            );
            const key = parseFechaToKey(fechaRaw);
            return key == null ? 0 : key;
        }
        return [...filteredItems].sort((a, b) => {
            const ak = getFechaKeyFromBoleta(a as any);
            const bk = getFechaKeyFromBoleta(b as any);
            return sortDesc ? (bk - ak) : (ak - bk);
        });
    }, [filteredItems, sortDesc]);

    const [page, setPage] = useState(1);
    const PAGE_SIZE = 25;
    const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = startIndex + PAGE_SIZE;
    const pageItems = sortedItems.slice(startIndex, endIndex);
    useEffect(() => { setPage(1); }, [search, fechaDesde, fechaHasta]);

    function clearFilters() {
        setFechaDesde('');
        setFechaHasta('');
        setSearch('');
        try {
            localStorage.removeItem('boletas_no_facturadas_fecha_desde');
            localStorage.removeItem('boletas_no_facturadas_fecha_hasta');
        } catch { /* noop */ }
        setPage(1);
        reload();
    }



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
        if (!token) { showError('No autenticado'); return; }
        const ids = Object.keys(selectedIds).filter(k => selectedIds[k]);
        if (ids.length === 0) { showWarning('No hay boletas seleccionadas'); return; }

        // Validar límite de 5 boletas
        if (ids.length > 5) {
            showError(`Límite excedido: Seleccionaste ${ids.length} boletas. El máximo permitido es 5 por operación.`);
            return;
        }

        // Confirmar acción
        if (!confirm(`¿Facturar ${ids.length} boleta(s) seleccionada(s)?`)) return;

        // Marcar todas como en proceso
        setProcessingIds(new Set(ids));
        setIsProcessing(true);

        try {
            // Sin confirm: acción directa
            const selectedRaw = ids
                .map(id => items.find((b, i) => getStableId(b, i) === id))
                .filter(Boolean)
                .filter(b => {
                    const id = getStableId(b as BoletaRecord, 0);
                    return !facturadasSet.has(id);
                });
            const { valid, invalid } = buildValidItems(selectedRaw as any[]);
            if (valid.length === 0) {
                showWarning('No hay boletas válidas para facturar (todas con total <= 0 o sin ID)');
                return;
            }
            if (invalid.length > 0) {
                console.warn('[facturarSeleccionadas] Saltando boletas inválidas:', invalid);
            }

            // Cargar conceptos para cada boleta válida
            console.log(`📦 Cargando conceptos para ${valid.length} boletas...`);
            const itemsConConceptos = await Promise.all(
                valid.map(async (item: any) => {
                    const ventaId = String(item.id || '');
                    let next = item;
                    if (ventaId) {
                        const conceptos = await getVentaConceptos(ventaId, token);
                        if (conceptos.length > 0) {
                            next = { ...next, conceptos };
                        }
                    }
                    return next;
                })
            );

            const result = await facturarItems(itemsConConceptos as any, token);
            if (!result.ok) {
                showError(result.error || 'Error al facturar');
                return;
            }
            const data = result.data;

            console.log('📦 Respuesta múltiple de facturación:', JSON.stringify(data, null, 2));

            // Si tuvo éxito, limpiar de la selección los IDs procesados
            setSelectedIds(prev => {
                const next = { ...prev };
                ids.forEach(id => delete next[id]);
                return next;
            });

            let successMsg = 'Facturación procesada';
            if (Array.isArray(data)) {
                const okCount = data.filter((r: any) => r && typeof r === 'object' && r.ok !== false && r.status === 'SUCCESS').length;
                successMsg = `Facturación procesada: ${okCount} / ${data.length}`;

                // ⭐ Descargar PDFs automáticamente para facturas exitosas
                const exitosas = data.filter((r: any) => {
                    if (!r || r.status !== 'SUCCESS') return false;
                    // Buscar factura_id en ambas ubicaciones posibles
                    return r.factura_id || (r.result && r.result.factura_id);
                });

                if (exitosas.length > 0) {
                    console.log(`📄 Descargando ${exitosas.length} comprobantes...`);

                    for (const item of exitosas) {
                        const facturaId = item.factura_id || item.result?.factura_id;
                        if (!facturaId) continue;

                        console.log(`📥 Descargando comprobante #${facturaId}...`);

                        try {
                            const pdfRes = await fetch(`/api/comprobantes/${facturaId}/pdf`, {
                                headers: { Authorization: `Bearer ${token}` }
                            });

                            if (pdfRes.ok) {
                                const blob = await pdfRes.blob();
                                console.log(`✅ PDF #${facturaId} descargado (${blob.size} bytes)`);

                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `comprobante_${facturaId}.pdf`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                                // Pequeña pausa entre descargas
                                await new Promise(resolve => setTimeout(resolve, 500));
                            } else {
                                const errorText = await pdfRes.text();
                                console.error(`❌ Error PDF #${facturaId}:`, pdfRes.status, errorText);
                            }
                        } catch (pdfError) {
                            console.error(`❌ Excepción descargando PDF #${facturaId}:`, pdfError);
                        }
                    }
                    console.log('✅ Proceso de descarga completado');
                }

                // ✅ El sistema ya marca automáticamente en Sheets durante la facturación
                // Ver: sheets_update_status en la respuesta del backend
            }
            if (invalid.length > 0) successMsg += ` (Saltadas ${invalid.length})`;
            showSuccess(successMsg);
            // Recarga manual solicitada: delegar al store
            reload();
        } catch (error) {
            console.error('❌ Error en facturación múltiple:', error);
            showError('Error durante la facturación múltiple');
        } finally {
            // Limpiar todos los IDs de procesamiento
            setProcessingIds(new Set());
            setIsProcessing(false);
        }
    }

    // Test imágenes eliminado del flujo

    return (
        <div className="p-4 md:p-6 space-y-4">
            {/* Toast notifications container */}
            <ToastContainer toasts={toasts} onRemove={removeToast} />

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
                        <button className="px-3 py-2 border rounded text-sm hover:bg-gray-50" onClick={clearFilters}>Borrar</button>
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
                            className={`px-3 py-2 rounded text-xs transition-colors flex items-center gap-2 ${isProcessing
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                                }`}
                            onClick={facturarSeleccionadas}
                            disabled={isProcessing}
                        >
                            {isProcessing && (
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            )}
                            {isProcessing ? 'Procesando...' : 'Facturar seleccionadas'}
                        </button>
                        <button className="px-3 py-2 bg-blue-500 text-white rounded text-xs" onClick={() => reload()}>Refrescar</button>
                        <button className="px-3 py-2 border rounded text-xs" onClick={clearFilters}>Borrar filtros</button>
                        <div className="flex items-center gap-2">
                            <label htmlFor="orden-lista" className="text-[12px] text-gray-600">Orden</label>
                            <select
                                id="orden-lista"
                                aria-label="Orden de lista"
                                className="border rounded px-2 py-1 text-xs"
                                value={sortDesc ? 'desc' : 'asc'}
                                onChange={(e) => setSortDesc(e.target.value === 'desc')}
                            >
                                <option value="desc">Recientes primero</option>
                                <option value="asc">Antiguas primero</option>
                            </select>
                        </div>
                        <span className="ml-auto text-[11px] text-gray-500">Página {currentPage} de {totalPages} · Mostrando {pageItems.length} de {sortedItems.length}</span>
                    </div>
                    {/* Mobile list */}
                    <div className="md:hidden divide-y">
                        {pageItems.map((b, i) => {
                            const rawTotal = b.total || b.INGRESOS || '';
                            const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                            const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                            const razonSocial = b.cliente || b.nombre || b['Razon Social'] || '';
                            const id = getStableId(b, i);
                            const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
                            const ya = facturadasSet.has(id);
                            return (
                                <div key={`${id}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                                    <input aria-label={`Seleccionar boleta ${id}`} type="checkbox" checked={!!selectedIds[id]} onChange={(e) => setSelectedIds(s => ({ ...s, [id]: e.target.checked }))} />
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{razonSocial || '— Sin razón social —'}</div>
                                        <div className="text-[11px] text-gray-600">Repartidor: {repartidor || '-'}</div>
                                        {ya && <div className="text-[11px] text-red-600">Ya facturada</div>}
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
                                                className={`text-xs px-2 py-1 rounded transition-colors ${processingIds.has(id) || ya
                                                    ? 'bg-gray-400 cursor-not-allowed'
                                                    : 'bg-green-600 hover:bg-green-700 text-white'
                                                    }`}
                                                onClick={() => facturarBoleta(b)}
                                                disabled={processingIds.has(id) || isProcessing || ya}
                                            >
                                                {processingIds.has(id) ? (
                                                    <span className="flex items-center gap-1">
                                                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Procesando...
                                                    </span>
                                                ) : 'Facturar'}
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
                                    <th className="p-2"><input aria-label="Seleccionar todas" type="checkbox" onChange={(e) => { const v = e.target.checked; const m: Record<string, boolean> = {}; pageItems.forEach((b, i) => { const id = getStableId(b, i); if (id && !facturadasSet.has(id)) m[id] = v; }); setSelectedIds(s => ({ ...s, ...m })); }} /></th>
                                    <th className="p-2">Repartidor</th>
                                    <th className="p-2">Razón Social</th>
                                    <th className="p-2">Fecha</th>
                                    <th className="p-2">Total</th>
                                    <th className="p-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map((b, i) => {
                                    const rawTotal = b.total || b.INGRESOS || '';
                                    const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
                                    const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
                                    const razonSocial = b.cliente || b.nombre || b['Razon Social'] || '';
                                    const id = getStableId(b, i);
                                    const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
                                    const fecha = String((b as Record<string, unknown>)['Fecha'] || (b as Record<string, unknown>)['fecha'] || '');
                                    const ya = facturadasSet.has(id);
                                    return (
                                        <tr key={`${id}-${i}`} className="border-t">
                                            <td className="p-2"><input aria-label={`Seleccionar boleta ${id}`} type="checkbox" checked={!!selectedIds[id]} onChange={(e) => setSelectedIds(s => ({ ...s, [id]: e.target.checked }))} /></td>
                                            <td className="p-2">{repartidor}</td>
                                            <td className="p-2">{razonSocial}</td>
                                            <td className="p-2">{fecha}</td>
                                            <td className="p-2">{total}</td>
                                            <td className="p-2 flex gap-2">
                                                {!(b['Nro Comprobante']) && (
                                                    <button
                                                        className={`px-2 py-1 rounded transition ${processingIds.has(id) || ya
                                                            ? 'bg-gray-400 cursor-not-allowed'
                                                            : 'bg-green-500 hover:bg-green-600 text-white'
                                                            }`}
                                                        onClick={() => facturarBoleta(b)}
                                                        disabled={processingIds.has(id) || isProcessing || ya}
                                                    >
                                                        {processingIds.has(id) ? (
                                                            <span className="flex items-center gap-1">
                                                                <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                </svg>
                                                                Procesando...
                                                            </span>
                                                        ) : 'Facturar'}
                                                    </button>
                                                )}
                                                {ya && <span className="text-xs text-red-600">Ya facturada</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between p-2 border-t gap-3">
                        <div className="text-[11px] text-gray-500">Página {currentPage} de {totalPages} · Mostrando {pageItems.length} de {filteredItems.length}</div>
                        <div className="flex items-center gap-2">
                            <button
                                aria-label="Página anterior"
                                className={`px-3 py-2 rounded text-sm border ${currentPage <= 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                            >Anterior</button>
                            <button
                                aria-label="Página siguiente"
                                className={`px-3 py-2 rounded text-sm border ${currentPage >= totalPages ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                            >Siguiente</button>
                        </div>
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
