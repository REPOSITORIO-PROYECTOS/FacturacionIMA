"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";

type Boleta = Record<string, string | number | boolean | undefined> & {
  "ID Ingresos"?: string | number;
  "INGRESOS"?: string | number;
  tabla?: string;
  total?: number | string;
  CUIT?: string | number;
  dni?: string | number;
  cuit?: string | number;
  cliente?: string;
  nombre?: string;
  "Razon Social"?: string;
  "Domicilio"?: string;
  condicion_iva?: string;
  "condicion-iva"?: string;
};

// type Tabla = { id: number | string; nombre: string }; // Eliminado temporalmente

export default function DashboardPage() {
  // const [tablas, setTablas] = useState<Tabla[]>([]); // (Removido: no se usa actualmente)
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [boletasFacturadas, setBoletasFacturadas] = useState<Boleta[]>([]);
  const [boletasNoFacturadas, setBoletasNoFacturadas] = useState<Boleta[]>([]);
  // Tabla seleccionada removida (no se usa panel de tablas)
  // tablaSeleccionada eliminada
  const [soloFacturables, setSoloFacturables] = useState<boolean>(true);
  const [busqueda, setBusqueda] = useState<string>("");
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tipoBoleta, setTipoBoleta] = useState<'todas' | 'no-facturadas' | 'facturadas'>('no-facturadas');

  const parseMonto = (monto: string | number | undefined): number => {
    if (typeof monto === "number") return monto;
    if (!monto || typeof monto !== "string") return 0;
    const numeroLimpio = monto.replace(/\$|\s/g, "").replace(/\./g, "").replace(",", ".");
    return parseFloat(numeroLimpio) || 0;
  };

  const formatSinCentavos = (monto: string | number | undefined): string => {
    const n = parseMonto(monto);
    const entero = Math.round(n); // quitar centavos
    return entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const getId = (b: Boleta) => String(b["id"] ?? b["ID Ingresos"] ?? b["ID Ingreso"] ?? b["ID"] ?? "");

  const isFacturable = useCallback((b: Boleta) => {
    const total = parseMonto(b.total ?? b["INGRESOS"] ?? 0);
    const nombre = b.cliente || b.nombre || b["Razon Social"];
    const ident = b.cuit || b.CUIT || b.dni;
    return total > 0 && Boolean(nombre) && Boolean(ident);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No autenticado. Inicie sesión.");
        setLoading(false);
        return;
      }
      // Construir endpoint unificado
      const params = new URLSearchParams({ tipo: tipoBoleta, skip: '0', limit: '200' });
      const endpoint = `/api/boletas?${params.toString()}`;
      try {
        const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) setError(String(err?.detail || 'Error al cargar boletas'));
        } else {
          const data = await res.json().catch(() => []);
          if (!cancelled && Array.isArray(data)) setBoletas(data);
        }
      } catch {
        if (!cancelled) setError('Error de conexión al cargar boletas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tipoBoleta]);

  // Cargar listas separadas para resumen (limit reducido para performance)
  useEffect(() => {
    let cancel = false;
    async function cargarResumen(tipo: 'facturadas' | 'no-facturadas') {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await fetch(`/api/boletas?tipo=${tipo}&skip=0&limit=50`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json().catch(() => []);
        if (!cancel && Array.isArray(data)) {
          if (tipo === 'facturadas') setBoletasFacturadas(data);
          else setBoletasNoFacturadas(data);
        }
      } catch { /* silent */ }
    }
    cargarResumen('facturadas');
    cargarResumen('no-facturadas');
    return () => { cancel = true; };
  }, []);

  const totalFacturadas = boletasFacturadas.length;
  const totalNoFacturadas = boletasNoFacturadas.length;
  const totalGlobal = totalFacturadas + totalNoFacturadas;
  const porcentajeFacturadas = totalGlobal === 0 ? 0 : Math.round((totalFacturadas / totalGlobal) * 100);

  const boletasFiltradas = useMemo(() => {
    return boletas.filter((b) => {
      const coincideBusqueda = !busqueda || Object.values(b).some((v) => v?.toString().toLowerCase().includes(busqueda.toLowerCase()));
      const pasaFacturable = !soloFacturables || isFacturable(b);
      return coincideBusqueda && pasaFacturable;
    });
  }, [boletas, busqueda, soloFacturables, isFacturable]);

  async function facturarBoleta(b: Boleta) {
    const token = localStorage.getItem("token");
    if (!token) return alert("No autenticado");
    if (!isFacturable(b)) return alert("Esta boleta no es facturable (faltan datos o total)");
    const payload = {
      id: getId(b),
      total: b.total || parseMonto(String(b.INGRESOS || b.total || 0)),
      cliente_data: {
        cuit_o_dni: b.cuit || b.dni || String(b.CUIT || ""),
        nombre_razon_social: b.cliente || b.nombre || b["Razon Social"] || "",
        domicilio: b.domicilio || b["Domicilio"] || "",
        condicion_iva: b.condicion_iva || b["condicion-iva"] || "",
      },
    };
    try {
      const res = await fetch("/api/facturar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) alert("Facturación exitosa");
      else alert(String(data?.detail || "Error al facturar"));
    } catch {
      alert("Error de conexión al facturar");
    }
  }

  async function facturarSeleccionadas() {
    const token = localStorage.getItem("token");
    if (!token) return alert("No autenticado");
    const seleccion = boletasFiltradas.filter((b) => seleccionadas.has(getId(b)) && isFacturable(b));
    if (seleccion.length === 0) return alert("No hay boletas facturables seleccionadas");
    const payloads = seleccion.map((b) => ({
      id: getId(b),
      total: b.total || parseMonto(String(b.INGRESOS || b.total || 0)),
      cliente_data: {
        cuit_o_dni: b.cuit || b.dni || String(b.CUIT || ""),
        nombre_razon_social: b.cliente || b.nombre || b["Razon Social"] || "",
        domicilio: b.domicilio || b["Domicilio"] || "",
        condicion_iva: b.condicion_iva || b["condicion-iva"] || "",
      },
    }));
    try {
      const res = await fetch("/api/facturar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payloads),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("Facturación en lote exitosa");
        setSeleccionadas(new Set());
      } else {
        alert(String(data?.detail || "Error al facturar en lote"));
      }
    } catch {
      alert("Error de conexión al facturar en lote");
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-700">Dashboard</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link className="text-blue-600" href="/usuarios">Ir a Usuarios</Link>
            <Link className="text-blue-600" href="/perfil">Perfil</Link>
          </div>
        </header>

        <main className="p-4 md:p-6 space-y-6">
          {/* KPIs */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
            <div className="p-4 rounded border bg-white">
              <div className="text-xs text-gray-500">Total Boletas</div>
              <div className="text-2xl font-bold text-blue-700">{totalGlobal}</div>
            </div>
            <div className="p-4 rounded border bg-white">
              <div className="text-xs text-gray-500">Facturadas</div>
              <div className="text-2xl font-bold text-blue-700">{totalFacturadas}</div>
            </div>
            <div className="p-4 rounded border bg-white">
              <div className="text-xs text-gray-500">No Facturadas</div>
              <div className="text-2xl font-bold text-blue-700">{totalNoFacturadas}</div>
            </div>
            <div className="p-4 rounded border bg-white">
              <div className="text-xs text-gray-500">% Facturadas</div>
              <div className="text-2xl font-bold text-blue-700">{porcentajeFacturadas}%</div>
            </div>
          </div>

          {/* Listas resumen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded border overflow-hidden">
              <div className="p-3 font-semibold border-b flex justify-between items-center">
                <span>Facturadas (últimas {boletasFacturadas.length})</span>
                <Link href="/boletas/facturadas" className="text-blue-600 text-sm">Ver todas →</Link>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-blue-50">
                  <tr><th className="p-1">ID</th><th className="p-1">Cliente</th><th className="p-1">Total</th></tr>
                </thead>
                <tbody>
                  {boletasFacturadas.slice(0, 10).map((b, i) => {
                    const id = String(b['ID Ingresos'] || b['id'] || i);
                    const cliente = b.cliente || b.nombre || b['Razon Social'] || '';
                    const total = b.total || b['INGRESOS'] || '';
                    return <tr key={id} className="border-t"><td className="p-1">{id}</td><td className="p-1 truncate max-w-[140px]">{String(cliente)}</td><td className="p-1">{String(total)}</td></tr>;
                  })}
                  {boletasFacturadas.length === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">Sin datos</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded border overflow-hidden">
              <div className="p-3 font-semibold border-b flex justify-between items-center">
                <span>No Facturadas (últimas {boletasNoFacturadas.length})</span>
                <Link href="/boletas/no-facturadas" className="text-blue-600 text-sm">Ver todas →</Link>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-blue-50">
                  <tr><th className="p-1">ID</th><th className="p-1">Cliente</th><th className="p-1">Total</th></tr>
                </thead>
                <tbody>
                  {boletasNoFacturadas.slice(0, 10).map((b, i) => {
                    const id = String(b['ID Ingresos'] || b['id'] || i);
                    const cliente = b.cliente || b.nombre || b['Razon Social'] || '';
                    const total = b.total || b['INGRESOS'] || '';
                    return <tr key={id} className="border-t"><td className="p-1">{id}</td><td className="p-1 truncate max-w-[140px]">{String(cliente)}</td><td className="p-1">{String(total)}</td></tr>;
                  })}
                  {boletasNoFacturadas.length === 0 && <tr><td colSpan={3} className="p-2 text-center text-gray-500">Sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {/* Controles */}
          <div className="bg-white rounded-lg shadow p-4 flex flex-col md:flex-row gap-3 md:items-end">
            {/* Selector de tabla eliminado temporalmente (no hay fuente de tablas) */}
            <div>
              <label className="block text-sm text-gray-600">Búsqueda</label>
              <input
                className="border rounded px-3 py-2"
                placeholder="Cliente, CUIT, etc."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={soloFacturables} onChange={(e) => setSoloFacturables(e.target.checked)} />
              <span>Solo facturables</span>
            </label>
            <div>
              <label className="block text-sm text-gray-600">Ver:</label>
              <select
                aria-label="Tipo de boleta"
                title="Seleccionar tipo de boleta"
                className="w-full border rounded px-3 py-2"
                value={tipoBoleta}
                onChange={(e) => setTipoBoleta(e.target.value as 'todas' | 'no-facturadas' | 'facturadas')}
              >
                <option value="no-facturadas">No facturadas</option>
                <option value="facturadas">Facturadas</option>
                <option value="todas">Todas</option>
              </select>
            </div>
          </div>

          {/* Panel de Tablas removido */}

          {/* Tabla de Boletas */}
          <div className="bg-white rounded-lg shadow overflow-auto">
            <div className="p-4 border-b font-semibold text-blue-700 flex justify-between items-center">
              <div>
                <span>Boletas {soloFacturables ? "(facturables)" : "(todas)"}</span>
                <span className="ml-2 text-sm text-gray-500">({boletasFiltradas.length} resultados)</span>
              </div>
              {seleccionadas.size > 0 && (
                <button
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow transition-colors"
                  onClick={facturarSeleccionadas}
                >
                  Facturar {seleccionadas.size} seleccionadas
                </button>
              )}
            </div>
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-500">Cargando boletas...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center text-red-600">
                <div className="text-4xl mb-2">⚠️</div>
                <p className="font-semibold">Error de conexión</p>
                <p className="text-sm">{error}</p>
              </div>
            ) : boletasFiltradas.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-2">📋</div>
                <p>No hay boletas que coincidan con los filtros</p>
                <p className="text-sm">Intenta cambiar los criterios de búsqueda</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-purple-50">
                  <tr>
                    <th className="p-2">Sel</th>
                    {boletasFiltradas.length > 0 && (() => {
                      // Queremos asegurar columnas explícitas y mantener el resto tal cual
                      const keys = Object.keys(boletasFiltradas[0]);
                      // Asegurar que 'Repartidor' y 'Nro Comprobante' estén visibles y en orden razonable
                      const ensure = ["Repartidor", "Nro Comprobante"];
                      const combined = Array.from(new Set([...keys, ...ensure]));
                      return combined.map((k) => (
                        <th key={k} className="p-2">{k}</th>
                      ));
                    })()}
                    <th className="p-2">Estado</th>
                    <th className="p-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {boletasFiltradas.map((b) => {
                    const id = getId(b);
                    const fact = isFacturable(b);
                    return (
                      <tr key={id} className="border-t">
                        <td className="p-2">
                          <input
                            aria-label="Seleccionar boleta"
                            title="Seleccionar boleta"
                            type="checkbox"
                            disabled={!fact}
                            checked={seleccionadas.has(id)}
                            onChange={(e) => {
                              setSeleccionadas((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(id); else next.delete(id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        {Object.keys(b).map((k) => {
                          // Formatear montos conocidos sin centavos
                          const lower = String(k).toLowerCase();
                          if (["ingresos", "efectivo", "tarjetas", "mercado pago", "bancos", "total a pagar"].includes(lower)) {
                            const val = b[k] as string | number | undefined;
                            return <td key={k} className="p-2">{formatSinCentavos(val)}</td>;
                          }
                          // Mostrar resto tal cual
                          return <td key={k} className="p-2">{String(b[k] ?? "")}</td>;
                        })}
                        {/* Si la fila no contiene 'Repartidor' o 'Nro Comprobante', agregarlos vacíos */}
                        {!("Repartidor" in b) && <td className="p-2">{""}</td>}
                        {!("Nro Comprobante" in b) && <td className="p-2">{""}</td>}
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${fact ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                            }`}>
                            {fact ? "✓ Facturable" : "✗ No facturable"}
                          </span>
                        </td>
                        <td className="p-2">
                          <button
                            className={`px-3 py-1 rounded-lg text-sm transition-colors ${fact
                              ? "bg-blue-600 hover:bg-blue-700 text-white"
                              : "bg-gray-300 text-gray-600 cursor-not-allowed"
                              }`}
                            disabled={!fact}
                            onClick={() => facturarBoleta(b)}
                          >
                            Facturar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
