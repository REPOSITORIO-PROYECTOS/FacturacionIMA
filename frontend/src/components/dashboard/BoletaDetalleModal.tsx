"use client";
import React from "react";
import type { Boleta } from "@/types/boleta";

export function BoletaDetalleModal({
    boleta,
    onClose,
    onFacturar,
    onImprimir,
    formatSinCentavos,
}: {
    boleta: Boleta;
    onClose: () => void;
    onFacturar?: () => void;
    onImprimir?: () => void;
    formatSinCentavos?: (monto: string | number | undefined) => string;
}) {
    const bx = boleta as Record<string, unknown>;
    const totalRaw = (bx['total'] ?? bx['INGRESOS'] ?? bx['Total a Pagar'] ?? bx['Total']) as unknown;
    const getAny = (...keys: string[]) => {
        for (const k of keys) {
            if (k in bx) {
                const v = bx[k];
                if (v !== undefined && v !== null && String(v) !== '') return String(v);
            }
            const lower = Object.keys(bx).find(existing => existing.toLowerCase() === k.toLowerCase());
            if (lower) {
                const v = bx[lower];
                if (v !== undefined && v !== null && String(v) !== '') return String(v);
            }
        }
        return null;
    };
    const totalFmt = formatSinCentavos ? formatSinCentavos(totalRaw as string | number | undefined) : (totalRaw !== undefined ? String(totalRaw) : 'No disponible');

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl mx-3">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                    <h3 className="text-lg md:text-xl font-semibold">Detalle de boleta</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-black">✕</button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <div className="text-[11px] text-gray-500">Fecha</div>
                            <div className="font-medium">{getAny('Fecha', 'fecha') ?? 'No disponible'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Registrado por</div>
                            <div className="font-medium truncate">{getAny('registrado por', 'usuario', 'operador', 'cajero') ?? 'No disponible'}</div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[11px] text-gray-500">Razón Social / Cliente</div>
                            <div className="font-medium break-words">{getAny('cliente', 'nombre', 'Razon Social') ?? '— Sin razón social —'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Repartidor</div>
                            <div className="font-medium">{getAny('Repartidor', 'repartidor') ?? 'No disponible'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Medio de pago</div>
                            <div className="font-medium">{getAny('medio', 'Medio de pago', 'tipo_pago') ?? 'No disponible'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Total</div>
                            <div className="font-medium">{totalFmt}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Condición IVA</div>
                            <div className="font-medium">{getAny('Condicion IVA', 'condicion_iva') ?? 'No disponible'}</div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[11px] text-gray-500">Domicilio</div>
                            <div className="font-medium break-words">{getAny('Domicilio', 'domicilio') ?? 'No disponible'}</div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[11px] text-gray-500">Nro Comprobante</div>
                            <div className="font-medium">{getAny('Nro Comprobante', 'numero_comprobante') ?? 'No disponible'}</div>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2">
                        <button className="px-3 py-2 rounded border hover:bg-gray-50" onClick={onClose}>Cerrar</button>
                        {onImprimir && (
                            <button className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700" onClick={onImprimir}>Imprimir</button>
                        )}
                        {onFacturar && (
                            <button className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={onFacturar}>Facturar</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
