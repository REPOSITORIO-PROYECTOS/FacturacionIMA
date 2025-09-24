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
    const bx = boleta as Record<string, string | number | boolean | undefined>;
    const totalRaw = boleta.total ?? boleta["INGRESOS"];
    const s = (v: unknown) => String(v ?? "-");
    const get = (key: string) => s(bx[key]);
    const totalFmt = formatSinCentavos ? formatSinCentavos(totalRaw) : String(totalRaw ?? "-");

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
                            <div className="font-medium">{get('Fecha') || get('fecha')}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Registrado por</div>
                            <div className="font-medium truncate">{get('registrado por') || get('usuario') || get('operador') || get('cajero')}</div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[11px] text-gray-500">Razón Social / Cliente</div>
                            <div className="font-medium break-words">{get('cliente') || get('nombre') || get('Razon Social') || '— Sin razón social —'}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Repartidor</div>
                            <div className="font-medium">{get('Repartidor') || get('repartidor')}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Medio de pago</div>
                            <div className="font-medium">{get('medio') || get('Medio de pago') || get('tipo_pago')}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Total</div>
                            <div className="font-medium">{totalFmt}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-gray-500">Condición IVA</div>
                            <div className="font-medium">{get('Condicion IVA') || get('condicion_iva')}</div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[11px] text-gray-500">Domicilio</div>
                            <div className="font-medium break-words">{get('Domicilio') || get('domicilio')}</div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[11px] text-gray-500">Nro Comprobante</div>
                            <div className="font-medium">{get('Nro Comprobante')}</div>
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
