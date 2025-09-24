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
    onFacturar: () => void;
    onImprimir: () => void;
    formatSinCentavos: (m: string | number | undefined) => string;
}) {
    const razon = boleta.cliente || boleta.nombre || boleta["Razon Social"] || "Sin nombre";
    const ident = boleta.cuit || boleta.CUIT || boleta.dni || "";
    const total = boleta.total ?? boleta["INGRESOS"];
    const fecha = (boleta["Fecha"] as string) || (boleta["fecha"] as string) || "";
    const domicilio = (boleta["Domicilio"] as string) || (boleta["domicilio"] as string) || "";
    const condIva = (boleta["condicion-iva"] as string) || (boleta["condicion_iva"] as string) || "";
    const tipoPago = (boleta["Tipo Pago"] as string) || (boleta["tipo_pago"] as string) || "";
    const nroComp = (boleta["Nro Comprobante"] as string) || (boleta["nro_comprobante"] as string) || "";
    const estado = (boleta["Estado"] as string) || (boleta["estado"] as string) || (nroComp ? "Facturado" : "No facturado");
    const repartidor = (boleta["Repartidor"] as string) || (boleta["repartidor"] as string) || (boleta["Nombre de Repartidor"] as string) || (boleta["nombre_repartidor"] as string) || "";
    const registradoPor = (boleta["Registrado por"] as string)
        || (boleta["Registrado Por"] as string)
        || (boleta["registrado por"] as string)
        || (boleta["registrado_por"] as string)
        || (boleta["Usuario"] as string)
        || (boleta["usuario"] as string)
        || (boleta["Operador"] as string)
        || (boleta["operador"] as string)
        || (boleta["Cajero"] as string)
        || (boleta["cajero"] as string)
        || "";

    const entries = Object.entries(boleta);

    return (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6 relative" onClick={(e) => e.stopPropagation()}>
                <button className="absolute top-2 right-3 text-gray-500 hover:text-red-600 text-2xl" onClick={onClose}>&times;</button>
                <div className="mb-4">
                    <div className="text-sm text-gray-500">Detalle de boleta</div>
                    <div className="text-xl font-bold text-blue-700">{String(razon)}</div>
                    <div className="text-xs text-gray-500 flex gap-3 mt-1 flex-wrap">
                        {fecha && <span>Fecha: {String(fecha)}</span>}
                        {ident && <span>CUIT/DNI: {String(ident)}</span>}
                        {tipoPago && <span>Pago: {String(tipoPago)}</span>}
                        {estado && <span>Estado: {String(estado)}</span>}
                        {repartidor && <span>Repartidor: {String(repartidor)}</span>}
                        {registradoPor && <span>Registrado por: {String(registradoPor)}</span>}
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
                    <div className="p-3 bg-blue-50 rounded">
                        <div className="text-gray-500 text-xs">Total</div>
                        <div className="font-bold text-blue-700">$ {formatSinCentavos(total)}</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded">
                        <div className="text-gray-500 text-xs">Condición IVA</div>
                        <div className="font-semibold">{String(condIva || "-")}</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded">
                        <div className="text-gray-500 text-xs">Domicilio</div>
                        <div className="font-semibold truncate" title={String(domicilio)}>{String(domicilio || "-")}</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded">
                        <div className="text-gray-500 text-xs">Nro Comprobante</div>
                        <div className="font-semibold">{String(nroComp || "-")}</div>
                    </div>
                </div>
                <div className="mb-4">
                    <div className="text-sm font-semibold mb-2">Campos</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[40vh] overflow-auto">
                        {entries.map(([k, v]) => (
                            <div key={k} className="border rounded p-2 text-xs bg-gray-50">
                                <div className="text-gray-500">{k}</div>
                                <div className="font-mono break-all">{String(v ?? "")}</div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <button className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded" onClick={onClose}>Cerrar</button>
                    <button className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white" onClick={onImprimir}>Imprimir</button>
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white" onClick={onFacturar}>Facturar</button>
                </div>
            </div>
        </div>
    );
}
