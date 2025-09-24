"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import type { Boleta } from "@/types/boleta";
import { MediosPagoResumen } from "@/components/dashboard/MediosPagoResumen";
import { BoletaDetalleModal } from "@/components/dashboard/BoletaDetalleModal";

export default function DashboardPage() {
  // Estados y funciones
  // Estados de detalle (no usados actualmente)
  const [mediosPago] = useState([
    'Efectivo',
    'Tarjeta de Débito',
    'Tarjeta de Crédito',
    'Transferencia',
    'Mercado Pago',
    'Otro'
  ]);
  const [userInfo, setUserInfo] = useState<{ username: string; role: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // ...existing code...

  useEffect(() => {
    const syncAuth = () => {
      const t = localStorage.getItem("token");
      const info = localStorage.getItem("user_info");
      setToken(t);
      if (info) {
        try {
          setUserInfo(JSON.parse(info));
        } catch {
          setUserInfo(null);
        }
      } else {
        setUserInfo(null);
      }
    };
    syncAuth();
    window.addEventListener("storage", syncAuth);
    return () => window.removeEventListener("storage", syncAuth);
  }, []);

  const parseMonto = (monto: string | number | undefined): number => {
    if (typeof monto === "number") return monto;
    if (!monto || typeof monto !== "string") return 0;
    const numeroLimpio = monto.replace(/\$|\s/g, "").replace(/\./g, "").replace(",", ".");
    return parseFloat(numeroLimpio) || 0;
  };

  const formatSinCentavos = (monto: string | number | undefined): string => {
    const n = parseMonto(monto);
    const entero = Math.round(n);
    return entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const getId = (b: Boleta) => String(b["id"] ?? b["ID Ingresos"] ?? b["ID Ingreso"] ?? b["ID"] ?? "");

  const isFacturable = useCallback((b: Boleta) => {
    const total = parseMonto(b.total ?? b["INGRESOS"] ?? 0);
    const nombre = b.cliente || b.nombre || b["Razon Social"];
    const ident = b.cuit || b.CUIT || b.dni;
    return total > 0 && Boolean(nombre) && Boolean(ident);
  }, []);

  const imprimirBoleta = (boleta: Boleta) => {
    alert(`Imprimir boleta: ${getId(boleta)}`);
  };

  async function facturarBoleta(b: Boleta, medioOverride?: string) {
    if (!token) return alert("No autenticado");
    if (!isFacturable(b)) return alert("Esta boleta no es facturable (faltan datos o total)");

    // Seleccionar medio de pago
    let medio = medioOverride;
    if (!medio) {
      const medioSeleccionado = prompt(
        `Seleccionar medio de pago:\n\n` +
        mediosPago.map((m, idx) => `${idx + 1}. ${m}`).join('\n') +
        '\n\nIngrese el número del medio de pago (1-' + mediosPago.length + '):',
        '1'
      );
      if (!medioSeleccionado) return;
      const indice = parseInt(medioSeleccionado) - 1;
      if (indice < 0 || indice >= mediosPago.length) {
        alert('Opción inválida');
        return;
      }
      medio = mediosPago[indice];
    }
    const payload = {
      id: getId(b),
      total: b.total || parseMonto(String(b.INGRESOS || b.total || 0)),
      medio_pago: medio,
      cliente_data: {
        cuit_o_dni: b.cuit || b.dni || String(b.CUIT || ""),
        nombre_razon_social: b.cliente || b.nombre || b["Razon Social"] || "",
        domicilio: b["Domicilio"] || "",
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
      if (res.ok) alert(`Facturación exitosa con ${medio}`);
      else alert(String(data?.detail || "Error al facturar"));
    } catch {
      alert("Error de conexión al facturar");
    }
  }

  // Eliminado: facturarSeleccionadas no usado

  // Columnas visibles para el modal
  const columnasVisibles: string[] = [
    "Fecha",
    "Razon Social",
    "CUIT",
    "Repartidor",
    "Tipo Pago",
    "INGRESOS",
    "condicion-iva",
    "facturacion",
  ];

  // Más estados para filtros y agrupación
  const [soloFacturables, setSoloFacturables] = useState(true);
  const [fechasInicializadas, _setFechasInicializadas] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalGroup, setModalGroup] = useState<{ key: string; boletas: Boleta[]; groupType: string; facturado: boolean } | null>(null);
  // Estado de selección en el modal
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  // Filtrado de listas de resumen
  // ...existing code...
  // Filtros y estados de búsqueda
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroRazonSocial, setFiltroRazonSocial] = useState("");
  const [tipoBoleta, setTipoBoleta] = useState<'todas' | 'no-facturadas' | 'facturadas'>('no-facturadas');
  const [busqueda, setBusqueda] = useState("");
  // Filtrado de listas de resumen
  const [filtroFacturadas, setFiltroFacturadas] = useState("");
  const [filtroNoFacturadas, setFiltroNoFacturadas] = useState("");
  const [boletasFacturadas, _setBoletasFacturadas] = useState<Boleta[]>([]);
  const [boletasNoFacturadas, _setBoletasNoFacturadas] = useState<Boleta[]>([]);
  // Modal de detalle de boleta
  const [boletaDetalle, setBoletaDetalle] = useState<Boleta | null>(null);
  const boletasFacturadasFiltradas = useMemo(() => {
    if (!filtroFacturadas) return boletasFacturadas;
    return boletasFacturadas.filter((b) => {
      const razonSocial = (b.cliente || b.nombre || b["Razon Social"] || "").toString().toLowerCase();
      return razonSocial.includes(filtroFacturadas.toLowerCase()) ||
        Object.values(b).some((v) => v?.toString().toLowerCase().includes(filtroFacturadas.toLowerCase()));
    });
  }, [boletasFacturadas, filtroFacturadas]);
  const boletasNoFacturadasFiltradas = useMemo(() => {
    if (!filtroNoFacturadas) return boletasNoFacturadas;
    return boletasNoFacturadas.filter((b) => {
      const razonSocial = (b.cliente || b.nombre || b["Razon Social"] || "").toString().toLowerCase();
      return razonSocial.includes(filtroNoFacturadas.toLowerCase()) ||
        Object.values(b).some((v) => v?.toString().toLowerCase().includes(filtroNoFacturadas.toLowerCase()));
    });
  }, [boletasNoFacturadas, filtroNoFacturadas]);
  const totalFacturadas = boletasFacturadas.length;
  const totalNoFacturadas = boletasNoFacturadas.length;
  const totalGlobal = totalFacturadas + totalNoFacturadas;
  const porcentajeFacturadas = totalGlobal === 0 ? 0 : Math.round((totalFacturadas / totalGlobal) * 100);

  // Totales monetarios
  const sumaFacturadas = useMemo(() => boletasFacturadas.reduce((acc, b) => acc + parseMonto(b.total ?? b["INGRESOS"]), 0), [boletasFacturadas]);
  const sumaNoFacturadas = useMemo(() => boletasNoFacturadas.reduce((acc, b) => acc + parseMonto(b.total ?? b["INGRESOS"]), 0), [boletasNoFacturadas]);

  // Carga de datos para Admin (y para cualquier usuario con token válido)
  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;
    const cargar = async () => {
      try {
        const [nfRes, fRes] = await Promise.all([
          fetch(`/api/boletas?tipo=no-facturadas&limit=200`, { headers }),
          fetch(`/api/boletas?tipo=facturadas&limit=200`, { headers })
        ]);
        const [nfData, fData] = await Promise.all([
          nfRes.json().catch(() => ([])),
          fRes.json().catch(() => ([]))
        ]);
        if (cancelado) return;
        // Aceptar tanto forma de array directo como {items: []}
        const arrNF = Array.isArray(nfData) ? nfData : (Array.isArray(nfData?.items) ? nfData.items : []);
        const arrF = Array.isArray(fData) ? fData : (Array.isArray(fData?.items) ? fData.items : []);
        _setBoletasNoFacturadas(arrNF as Boleta[]);
        _setBoletasFacturadas(arrF as Boleta[]);
      } catch {
        // Silencio: la tarjeta ya avisa si no hay data
      }
    };
    cargar();
    return () => { cancelado = true; };
  }, [token]);
  // Agrupación (se declara después de calcular las listas filtradas)
  const agrupadas = useMemo(() => {
    const grupos: Record<string, { key: string; boletas: Boleta[]; groupType: string; facturado: boolean }> = {};
    for (const b of boletasFacturadasFiltradas.concat(boletasNoFacturadasFiltradas)) {
      const facturacion = String(b["facturacion"] ?? "");
      const tipoPago = String(b["Tipo Pago"] ?? b["tipo_pago"] ?? "");
      const repartidor = String(b["Repartidor"] ?? b["repartidor"] ?? "");
      const key = `${facturacion}|${tipoPago}|${repartidor}`;
      const facturado = String(b["Estado"] ?? b["estado"] ?? "").toLowerCase().includes("factur") || String(b["Nro Comprobante"] ?? "").length > 0;
      if (!grupos[key]) grupos[key] = { key, boletas: [], groupType: `${facturacion} / ${tipoPago} / ${repartidor}`, facturado };
      grupos[key].boletas.push(b);
    }
    return Object.values(grupos);
  }, [boletasFacturadasFiltradas, boletasNoFacturadasFiltradas]);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b p-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-700">Dashboard</h1>
          <div className="flex flex-col items-end gap-2 text-sm">
            {/* Advertencia si falta token o user_info */}
            {(!token || !userInfo) && (
              <div className="bg-red-100 text-red-700 px-3 py-1 rounded text-xs font-semibold">
                ⚠️ No se detecta token o user_info en localStorage. Revisa el login.
              </div>
            )}
            {/* Mostrar solo si el usuario es admin, y mostrar mensaje si no hay userInfo */}
            {userInfo?.role === "Admin" ? (
              <Link className="text-blue-600 font-semibold" href="/usuarios">Ir a Usuarios</Link>
            ) : (
              <span className="text-gray-400 text-xs">No eres admin</span>
            )}
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

          {/* Comparador de montos y conteos */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <div className="p-4 rounded border bg-white">
              <div className="text-xs text-gray-500">Importe Facturadas</div>
              <div className="text-2xl font-bold text-green-700">$ {formatSinCentavos(sumaFacturadas)}</div>
            </div>
            <div className="p-4 rounded border bg-white">
              <div className="text-xs text-gray-500">Importe No Facturadas</div>
              <div className="text-2xl font-bold text-red-700">$ {formatSinCentavos(sumaNoFacturadas)}</div>
            </div>
            <div className="p-4 rounded border bg-white">
              <div className="text-xs text-gray-500">Diferencia (Fact - No Fact)</div>
              <div className="text-2xl font-bold text-blue-700">$ {formatSinCentavos(sumaFacturadas - sumaNoFacturadas)}</div>
            </div>
          </div>

          {/* Listas resumen */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tarjeta: Facturadas */}
            <div className="bg-white rounded border overflow-hidden">
              <div className="p-3 font-semibold border-b">
                <div className="flex justify-between items-center mb-2">
                  <span>Facturadas (mostrando {boletasFacturadasFiltradas.length} de {boletasFacturadas.length})</span>
                  <Link href="/boletas/facturadas" className="text-blue-600 text-sm">Ver todas →</Link>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded px-2 py-1 text-xs"
                    placeholder="Filtrar facturadas..."
                    value={filtroFacturadas}
                    onChange={(e) => setFiltroFacturadas(e.target.value)}
                    title="Filtrar boletas facturadas"
                  />
                  {filtroFacturadas && (
                    <button
                      className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
                      onClick={() => setFiltroFacturadas("")}
                      title="Limpiar filtro"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-blue-50">
                  <tr><th className="p-1">Razón Social</th><th className="p-1">Total</th></tr>
                </thead>
                <tbody>
                  {boletasFacturadasFiltradas.slice(0, 10).map((b) => {
                    const id = String(b['ID Ingresos'] || b['id'] || '');
                    const razonSocial = b['cliente'] || b['nombre'] || b['Razon Social'] || '';
                    const total = b['total'] || b['INGRESOS'] || '';
                    return (
                      <tr key={id} className="border-t">
                        <td className="p-1 truncate max-w-[180px]">{String(razonSocial)}</td>
                        <td className="p-1">{String(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Tarjeta: No facturadas */}
            <div className="bg-white rounded border overflow-hidden">
              <div className="p-3 font-semibold border-b">
                <div className="flex justify-between items-center mb-2">
                  <span>No facturadas (mostrando {boletasNoFacturadasFiltradas.length} de {boletasNoFacturadas.length})</span>
                  <Link href="/boletas/no-facturadas" className="text-blue-600 text-sm">Ver todas →</Link>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 border rounded px-2 py-1 text-xs"
                    placeholder="Filtrar no facturadas..."
                    value={filtroNoFacturadas}
                    onChange={(e) => setFiltroNoFacturadas(e.target.value)}
                    title="Filtrar boletas no facturadas"
                  />
                  {filtroNoFacturadas && (
                    <button
                      className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-xs"
                      onClick={() => setFiltroNoFacturadas("")}
                      title="Limpiar filtro"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-blue-50">
                  <tr><th className="p-1">Razón Social</th><th className="p-1">Total</th></tr>
                </thead>
                <tbody>
                  {boletasNoFacturadasFiltradas.slice(0, 10).map((b) => {
                    const id = String(b['ID Ingresos'] || b['id'] || '');
                    const razonSocial = b['cliente'] || b['nombre'] || b['Razon Social'] || '';
                    const total = b['total'] || b['INGRESOS'] || '';
                    return (
                      <tr key={id} className="border-t">
                        <td className="p-1 truncate max-w-[180px]">{String(razonSocial)}</td>
                        <td className="p-1">{String(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumen por medio de pago (conteos y montos) */}
          <MediosPagoResumen
            boletasFacturadas={boletasFacturadas}
            boletasNoFacturadas={boletasNoFacturadas}
            parseMonto={parseMonto}
            formatSinCentavos={formatSinCentavos}
          />

          {/* Primera fila de filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Fecha desde</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                title="Seleccionar fecha desde"
                placeholder="Fecha desde"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Fecha hasta</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                title="Seleccionar fecha hasta"
                placeholder="Fecha hasta"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Razón Social</label>
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="Filtrar por razón social..."
                value={filtroRazonSocial}
                onChange={(e) => setFiltroRazonSocial(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Ver:</label>
              <select
                aria-label="Tipo de boleta"
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

          {/* Segunda fila de filtros */}
          <div className="flex flex-col md:flex-row gap-4 md:items-end">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Búsqueda general</label>
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="Cliente, CUIT, repartidor, etc."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={soloFacturables} onChange={(e) => setSoloFacturables(e.target.checked)} />
              <span className="text-sm">Solo facturables</span>
            </label>
            <button
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
              onClick={() => {
                setBusqueda("");
                setFiltroRazonSocial("");
                setFiltroFacturadas("");
                setFiltroNoFacturadas("");
                // Solo actualizar fechas si ya están inicializadas
                if (fechasInicializadas) {
                  const today = new Date().toISOString().split('T')[0];
                  setFechaDesde(today);
                  setFechaHasta(today);
                }
                setSoloFacturables(true);
              }}
            >
              Limpiar todos los filtros
            </button>
          </div>

          {/* Tarjetas agrupadas por facturación, tipo de pago y repartidor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agrupadas.map((grupo) => (
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
                          // Construir payload de facturación por cantidad
                          const invoices = seleccion.map((b) => ({
                            id: getId(b),
                            total: Number(b.total ?? b["INGRESOS"] ?? 0),
                            cliente_data: {
                              cuit_o_dni: String(b.cuit || b.CUIT || b.dni || ""),
                              nombre_razon_social: String(b.cliente || b.nombre || b["Razon Social"] || ""),
                              domicilio: String(b["Domicilio"] || ""),
                              condicion_iva: String(b.condicion_iva || b["condicion-iva"] || "CONSUMIDOR_FINAL"),
                            },
                          }));
                          (async () => {
                            try {
                              if (!token) { alert('No autenticado'); return; }
                              const res = await fetch(`/api/facturador/facturar-por-cantidad?max_parallel_workers=5`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify(invoices),
                              });
                              type LoteResultado = { ok?: boolean } | Record<string, unknown>;
                              const dataText = await res.text();
                              const isJson = dataText.trim().startsWith("{") || dataText.trim().startsWith("[");
                              const data: unknown = isJson ? JSON.parse(dataText) : dataText;
                              if (!res.ok) {
                                const detail = typeof data === 'object' && data && !Array.isArray(data) ? (data as { detail?: string }).detail : undefined;
                                alert(String(detail || 'Error al facturar en lote'));
                                return;
                              }
                              // Mostrar resumen simple
                              const okCount = Array.isArray(data) ? data.filter((r) => (r as { ok?: boolean }).ok !== false).length : 0;
                              alert(`Lote procesado. Éxitos: ${okCount} / ${seleccion.length}`);
                              // Refrescar datos
                              window.location.reload();
                            } catch {
                              alert('Error de conexión al facturar en lote');
                            }
                          })();
                        }}
                      >Facturar grupo</button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {grupo.boletas.slice(0, 3).map((b) => (
                    <div key={getId(b)} className="bg-blue-50 rounded px-2 py-1 text-xs">
                      {b["Repartidor"] || b["repartidor"] || b["Nombre de Repartidor"] || b["nombre_repartidor"] || "Sin repartidor"}
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
                      {modalGroup.boletas.map((b) => {
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
                                onClick={() => setBoletaDetalle(b)}
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

          {/* Modal de detalle de boleta */}
          {boletaDetalle && (
            <BoletaDetalleModal
              boleta={boletaDetalle}
              onClose={() => setBoletaDetalle(null)}
              onFacturar={() => { facturarBoleta(boletaDetalle); }}
              onImprimir={() => { imprimirBoleta(boletaDetalle); }}
              formatSinCentavos={formatSinCentavos}
            />
          )}
        </main>
      </div >
    </div >
  );
}

// ----- Componentes auxiliares -----