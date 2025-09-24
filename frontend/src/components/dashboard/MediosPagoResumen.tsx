"use client";
import React, { useMemo, useCallback } from "react";
import type { Boleta } from "@/types/boleta";

export function MediosPagoResumen({
    boletasFacturadas,
    boletasNoFacturadas,
    parseMonto,
    formatSinCentavos,
}: {
    boletasFacturadas: Boleta[];
    boletasNoFacturadas: Boleta[];
    parseMonto: (m: string | number | undefined) => number;
    formatSinCentavos: (m: string | number | undefined) => string;
}) {
    const normalizarMedio = (b: Boleta) => String(b["Tipo Pago"] ?? b["tipo_pago"] ?? "Otro");
    const acumular = useCallback((arr: Boleta[]) => {
        const map = new Map<string, { count: number; sum: number }>();
        for (const b of arr) {
            const medio = normalizarMedio(b) || "Otro";
            const sumPrev = map.get(medio)?.sum || 0;
            const cntPrev = map.get(medio)?.count || 0;
            const monto = parseMonto(b.total ?? b["INGRESOS"]);
            map.set(medio, { count: cntPrev + 1, sum: sumPrev + monto });
        }
        return map;
    }, [parseMonto]);
    const mapF = useMemo(() => acumular(boletasFacturadas), [acumular, boletasFacturadas]);
    const mapNF = useMemo(() => acumular(boletasNoFacturadas), [acumular, boletasNoFacturadas]);
    const medios = useMemo(() => Array.from(new Set([...mapF.keys(), ...mapNF.keys()])).sort(), [mapF, mapNF]);

    if (medios.length === 0) return null;

    return (
        <div className="bg-white rounded border overflow-hidden">
            <div className="p-3 font-semibold border-b flex items-center justify-between">
                <span>Resumen por medio de pago</span>
                <span className="text-xs text-gray-500">Comparativo Facturadas vs No Facturadas</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-blue-50">
                        <tr>
                            <th className="p-2 text-left">Medio</th>
                            <th className="p-2 text-right">No Facturadas (cant)</th>
                            <th className="p-2 text-right">No Facturadas (monto)</th>
                            <th className="p-2 text-right">Facturadas (cant)</th>
                            <th className="p-2 text-right">Facturadas (monto)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {medios.map((m) => {
                            const nf = mapNF.get(m) || { count: 0, sum: 0 };
                            const f = mapF.get(m) || { count: 0, sum: 0 };
                            return (
                                <tr key={m} className="border-t">
                                    <td className="p-2">{m}</td>
                                    <td className="p-2 text-right">{nf.count}</td>
                                    <td className="p-2 text-right">$ {formatSinCentavos(nf.sum)}</td>
                                    <td className="p-2 text-right">{f.count}</td>
                                    <td className="p-2 text-right">$ {formatSinCentavos(f.sum)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
