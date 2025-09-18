"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Fragment } from "react";
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

export default function DashboardPage() {
  // Estados primero
  const [modalOpen, setModalOpen] = useState(false);
  const [modalGroup, setModalGroup] = useState<{ key: string; boletas: Boleta[]; groupType: string; facturado: boolean } | null>(null);
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [boletasFacturadas, setBoletasFacturadas] = useState<Boleta[]>([]);
  const [boletasNoFacturadas, setBoletasNoFacturadas] = useState<Boleta[]>([]);
  const [soloFacturables, setSoloFacturables] = useState<boolean>(true);
  const [busqueda, setBusqueda] = useState<string>("");
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tipoBoleta, setTipoBoleta] = useState<'todas' | 'no-facturadas' | 'facturadas'>('no-facturadas');

  // Funciones utilitarias
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

  // Función para imprimir boleta
  const imprimirBoleta = (boleta: Boleta) => {
    // Aquí puedes implementar la lógica real de impresión (PDF, ventana, etc)
    alert(`Imprimir boleta: ${getId(boleta)}`);
  };

  // Filtrado de boletas
  const boletasFiltradas = useMemo(() => {
    return boletas.filter((b) => {
      const coincideBusqueda = !busqueda || Object.values(b).some((v) => v?.toString().toLowerCase().includes(busqueda.toLowerCase()));
      const pasaFacturable = !soloFacturables || isFacturable(b);
      return coincideBusqueda && pasaFacturable;
    });
  }, [boletas, busqueda, soloFacturables, isFacturable]);

  // Agrupamiento por facturación, tipo de pago y repartidor
  const agrupadas = useMemo(() => {
    const grupos: Record<string, { key: string; boletas: Boleta[]; groupType: string; facturado: boolean }> = {};
    for (const b of boletasFiltradas) {
      // Clave de agrupación: facturacion + tipo pago + repartidor
      const facturacion = String(b.facturacion ?? b["facturacion"] ?? "");
      const tipoPago = String(b["Tipo Pago"] ?? b["tipo_pago"] ?? "");
      const repartidor = String(b["Repartidor"] ?? b["repartidor"] ?? "");
      const key = `${facturacion}|${tipoPago}|${repartidor}`;
      const facturado = String(b["Estado"] ?? b["estado"] ?? "").toLowerCase().includes("factur") || String(b["Nro Comprobante"] ?? "").length > 0;
      if (!grupos[key]) grupos[key] = { key, boletas: [], groupType: `${facturacion} / ${tipoPago} / ${repartidor}`, facturado };
      grupos[key].boletas.push(b);
    }
    return Object.values(grupos);
  }, [boletasFiltradas]);

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
  
  // ----- INICIO DEL CAMBIO -----
  // Define las columnas que quieres mostrar en el modal
  const columnasVisibles = [
    "INGRESOS",
    "Fecha",
    "ID Ingresos",
    "ID Cliente",
    "Cliente",
    "CUIT",
    "Razon Social",
    "ID Repartidor",
    "Repartidor",
    "ID Pedido",
    "Tipo Pago",
    "condicion-iva",
    "facturacion",
  ];
  // ----- FIN DEL CAMBIO -----

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
                  <tr><th className="p-1">ID</th><th className="p-1">Razon social</th><th className="p-1">Total</th></tr>
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
                  <tr><th className="p-1">ID</th><th className="p-1">Razon social</th><th className="p-1">Total</th></tr>
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

          {/* Tarjetas agrupadas por facturación, tipo de pago y repartidor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agrupadas.map((grupo, idx) => (
              <div key={grupo.key} className="bg-white rounded-lg border shadow p-4 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-blue-700">{grupo.groupType}</div>
                    <div className="text-xs text-gray-500">{grupo.boletas.length} boletas</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-1 rounded text-xs font-semibold ${grupo.facturado ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                      onClick={() => { setModalGroup(grupo); setModalOpen(true); }}
                    >{grupo.facturado ? "Facturado" : "No facturado"}</button>
                    {!grupo.facturado && (
                      <button
                        className="px-3 py-1 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => {
                          const seleccion = grupo.boletas.filter(isFacturable);
                          if (seleccion.length === 0) return alert("No hay boletas facturables en el grupo");
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
                          (async () => {
                            const token = localStorage.getItem("token");
                            if (!token) return alert("No autenticado");
                            try {
                              const res = await fetch("/api/facturar", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                body: JSON.stringify(payloads),
                              });
                              const data = await res.json().catch(() => ({}));
                              if (res.ok) alert("Facturación en grupo exitosa");
                              else alert(String(data?.detail || "Error al facturar grupo"));
                            } catch {
                              alert("Error de conexión al facturar grupo");
                            }
                          })();
                        }}
                      >Facturar grupo</button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {grupo.boletas.slice(0, 3).map((b, i) => (
                    <div key={getId(b)} className="bg-blue-50 rounded px-2 py-1 text-xs">
                      {b["Cliente"] || b["cliente"] || b["nombre"] || b["Razon Social"] || "Sin cliente"}
                    </div>
                  ))}
                  {grupo.boletas.length > 3 && <div className="text-xs text-gray-400">...más</div>}
                </div>
              </div>
            ))}
          </div>

          {/* Modal de detalle de grupo */}
          {modalOpen && modalGroup && (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setModalOpen(false)}>
              <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full p-6 relative" onClick={e => e.stopPropagation()}>
                <button className="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-xl" onClick={() => setModalOpen(false)}>&times;</button>
                <div className="mb-4">
                  <div className="font-bold text-blue-700 text-lg">{modalGroup.groupType}</div>
                  <div className="text-xs text-gray-500">{modalGroup.boletas.length} boletas</div>
                  <div className="mt-2">
                    <span className={`px-3 py-1 rounded text-xs font-semibold ${modalGroup.facturado ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{modalGroup.facturado ? "Facturado" : "No facturado"}</span>
                  </div>
                </div>
                {/* ----- INICIO DEL CAMBIO EN LA TABLA ----- */}
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-xs">
                    <thead className="bg-blue-50">
                      <tr>
                        <th className="p-1">Sel</th>
                        {/* Iterar sobre el array de columnas visibles */}
                        {columnasVisibles.map((col) => (<th key={col} className="p-1">{col}</th>))}
                        <th className="p-1">Estado</th>
                        <th className="p-1">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalGroup.boletas.map((b, i) => {
                        const id = getId(b);
                        const fact = isFacturable(b);
                        return (
                          <tr key={id} className="border-t">
                            <td className="p-1">
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
                            {/* Iterar sobre las columnas visibles para mostrar los datos */}
                            {columnasVisibles.map((col) => {
                              const lower = String(col).toLowerCase();
                              // Mantener el formato para montos
                              if (["ingresos", "total a pagar"].includes(lower)) {
                                const val = b[col] as string | number | undefined;
                                return <td key={col} className="p-1">{formatSinCentavos(val)}</td>;
                              }
                              // Mostrar el resto como texto
                              return <td key={col} className="p-1">{String(b[col] ?? "")}</td>;
                            })}
                            <td className="p-1">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${fact ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{fact ? "✓ Facturable" : "✗ No facturable"}</span>
                            </td>
                            <td className="p-1 flex gap-1">
                              <button
                                className={`px-2 py-1 rounded-lg text-xs transition-colors ${fact ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-300 text-gray-600 cursor-not-allowed"}`}
                                disabled={!fact}
                                onClick={() => facturarBoleta(b)}
                              >Facturar</button>
                              <button
                                className="px-2 py-1 rounded-lg text-xs bg-gray-200 hover:bg-gray-300 text-gray-800"
                                onClick={() => alert(JSON.stringify(b, null, 2))}
                              >Ver boleta</button>
                              <button
                                className="px-2 py-1 rounded-lg text-xs bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => imprimirBoleta(b)}
                              >Imprimir boleta</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* ----- FIN DEL CAMBIO EN LA TABLA ----- */}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}