"use client";
import { useEffect, useState, useMemo } from 'react';
import { useBoletas } from '@/context/BoletasStore';

type Tipo = 'facturadas' | 'no-facturadas';

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
    factura_id?: string | number;
    ingreso_id?: string | number;
    importe_total?: string | number;
    numero_comprobante?: string | number;
    [key: string]: unknown;
}

import Navbar from '../../components/Navbar';

export default function BoletasMobilePage() {
    const [tipo, setTipo] = useState<Tipo>('no-facturadas');
    const { boletasFacturadas, boletasNoFacturadas, loading: storeLoading, error: storeError, reload, lastUpdated } = useBoletas();
    const [items, setItems] = useState<BoletaRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Mirror store lists into local items depending on selected tipo
        setLoading(storeLoading);
        setError(storeError ?? '');
        if (tipo === 'no-facturadas') setItems(boletasNoFacturadas as BoletaRecord[]);
        else setItems(boletasFacturadas as BoletaRecord[]);
        // Keep in sync if store updates
    }, [tipo, boletasFacturadas, boletasNoFacturadas, storeLoading, storeError]);

    const resumidos = useMemo(() => items.map((b, i) => {
        const rawTotal = b.importe_total || b.total || b.INGRESOS || '';
        const totalNum = typeof rawTotal === 'number' ? rawTotal : parseFloat(String(rawTotal).replace(/,/g, ''));
        const total = isNaN(totalNum) ? rawTotal : Math.round(totalNum).toString();
        const cliente = b.cliente || b.nombre || b['Razon Social'] || '';
        // Priorizar IDs consistentes: factura_id para facturadas, ingreso_id para pendientes
        const id = b.factura_id || b.ingreso_id || b.id || b['ID Ingresos'] || `temp-${i}`;
        const repartidor = (b.Repartidor ?? (b as Record<string, unknown>)['repartidor'] ?? '') as string;
        const nroComp = (b.numero_comprobante ?? b['Nro Comprobante'] ?? (b as Record<string, unknown>)['nroComprobante'] ?? '') as string | number;
        return { id, cliente, total, repartidor, nroComp };
    }), [items]);

    return (
        <div className="flex">
            <Navbar />
            <main className="flex-1 md:ml-64 p-3 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-lg font-bold text-purple-700">Boletas {tipo === 'no-facturadas' ? 'Pendientes' : 'Facturadas'}</h1>
                        {lastUpdated && <div className="text-xs text-gray-500">Última actualización: {new Date(lastUpdated).toLocaleString()}</div>}
                    </div>
                    <div className="flex gap-2 items-center">
                        <div className="flex gap-2">
                            <button onClick={() => setTipo('no-facturadas')} className={`px-3 py-1 rounded text-sm font-medium border ${tipo === 'no-facturadas' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-600 border-purple-300'}`}>Pendientes</button>
                            <button onClick={() => setTipo('facturadas')} className={`px-3 py-1 rounded text-sm font-medium border ${tipo === 'facturadas' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-purple-600 border-purple-300'}`}>Facturadas</button>
                        </div>
                        <button onClick={() => reload()} className="px-3 py-1 rounded text-sm bg-gray-100 border">Actualizar</button>
                    </div>
                </div>

                {loading && <p className="text-sm">Cargando...</p>}
                {error && !loading && <p className="text-sm text-red-600">{error}</p>}

                <ul className="divide-y rounded border bg-white overflow-hidden">
                    {resumidos.map(r => (
                        <li key={r.id} className="p-3 flex flex-col gap-1">
                            <div className="flex justify-between text-xs text-gray-500">
                                <span>ID: {r.id}</span>
                                {r.nroComp && <span>Comp: {r.nroComp}</span>}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-800 truncate pr-3">{r.cliente}</span>
                                <span className="text-sm font-semibold text-purple-700">{r.total}</span>
                            </div>
                            <div className="text-xs text-gray-500 flex justify-between">
                                <span>Rep: {r.repartidor || '-'}</span>
                                <span>{tipo === 'facturadas' ? '✓' : '⏳'}</span>
                            </div>
                        </li>
                    ))}
                    {(!loading && resumidos.length === 0) && <li className="p-4 text-center text-sm text-gray-500">Sin boletas</li>}
                </ul>
            </main>
        </div>
    );
}
