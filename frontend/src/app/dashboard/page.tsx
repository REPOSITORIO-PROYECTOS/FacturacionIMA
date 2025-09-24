"use client";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import type { Boleta } from "@/types/boleta";
import { MediosPagoResumen } from "@/components/dashboard/MediosPagoResumen";
import { BoletaDetalleModal } from "@/components/dashboard/BoletaDetalleModal";
import { useToast } from "../components/ToastProvider";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function DashboardPage() {
  const toast = useToast();
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

  const parseMonto = (monto: string | number | boolean | undefined): number => {
    if (typeof monto === "number") return monto;
    if (typeof monto === "boolean") return 0;
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
    // Considerar diferentes nombres de campos
    const total = parseMonto(b.total ?? b["INGRESOS"] ?? b["Total"] ?? b["TOTAL"] ?? 0);
    const nombre = b.cliente || b.nombre || b["Razon Social"] || b["razon_social"];
    const ident = b.cuit || b.CUIT || b.dni || b["DNI"];
    return total > 0 && Boolean(nombre) && Boolean(ident);
  }, []);

  const motivoNoFacturable = useCallback((b: Boleta): string => {
    const motivos: string[] = [];
    const total = parseMonto(b.total ?? b["INGRESOS"] ?? b["Total"] ?? b["TOTAL"] ?? 0);
    if (!(total > 0)) motivos.push("Total <= 0");
    const nombre = b.cliente || b.nombre || b["Razon Social"] || b["razon_social"];
    if (!nombre) motivos.push("Falta nombre/razón social");
    const ident = b.cuit || b.CUIT || b.dni || b["DNI"];
    if (!ident) motivos.push("Falta CUIT/DNI");
    return motivos.join(" · ");
  }, []);

  const imprimirBoleta = (boleta: Boleta) => {
    toast.info("Imprimir boleta", `Boleta ${getId(boleta)}`);
  };

  async function facturarBoleta(b: Boleta, medioOverride?: string) {
    if (!token) return toast.error("No autenticado");
    if (!isFacturable(b)) {
      const nombre = b.cliente || b.nombre || b["Razon Social"] || b["razon_social"];
      if (!nombre) {
        toast.warning("Registrar razón social", "La boleta no tiene nombre/razón social. Cárguelo para poder facturar.");
      } else {
        toast.warning("Boleta no facturable", "Faltan datos o total <= 0");
      }
      return;
    }

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
        toast.error('Opción inválida');
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
      if (res.ok) toast.success(`Facturación exitosa`, `Medio: ${medio}`);
      else toast.error(String(data?.detail || "Error al facturar"));
    } catch {
      toast.error("Error de conexión al facturar");
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
  // Estados extra del modal para búsqueda/filtrado rápido
  const [modalSearch, setModalSearch] = useState("");
  const [modalSoloFacturables, setModalSoloFacturables] = useState(false);
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
  const [cargando, setCargando] = useState(false);
  const [mostrarTodasFacturadas, setMostrarTodasFacturadas] = useState(false);
  const [mostrarTodasNoFacturadas, setMostrarTodasNoFacturadas] = useState(false);
  // Modal de detalle de boleta
  const [boletaDetalle, setBoletaDetalle] = useState<Boleta | null>(null);

  // --- Filtros globales (incluye búsqueda por quien registró la operación) ---
  const aplicaFiltrosGlobales = useCallback((b: Boleta): boolean => {
    // Solo facturables
    if (soloFacturables && !isFacturable(b)) return false;

    // Filtro por razón social (si se ingresó)
    if (filtroRazonSocial) {
      const rs = (b["cliente"] || b["nombre"] || b["Razon Social"] || "").toString().toLowerCase();
      if (!rs.includes(filtroRazonSocial.toLowerCase())) return false;
    }

    // Búsqueda general: incluye cliente, CUIT/DNI, repartidor, tipo de pago,
    // número de comprobante y QUIEN REGISTRÓ (operador/usuario/cajero)
    if (busqueda) {
      const v = (key: string) => String((b as Record<string, unknown>)[key] ?? "").toLowerCase();
      const texto = busqueda.toLowerCase();

      const campos: string[] = [
        // Cliente / razón social
        "cliente", "nombre", "Razon Social",
        // Identificación
        "cuit", "CUIT", "dni",
        // Repartidor
        "Repartidor", "repartidor", "Nombre de Repartidor", "nombre_repartidor",
        // Tipo de pago
        "Tipo Pago", "tipo_pago",
        // Comprobante
        "Nro Comprobante", "Comprobante", "NroComp",
        // QUIEN REGISTRÓ / OPERADOR
        "Registrado por", "Registrado Por", "registrado por", "registrado_por",
        "Usuario", "usuario", "Operador", "operador", "Cajero", "cajero",
      ];

      const coincide = campos.some((k) => v(k).includes(texto));
      if (!coincide) return false;
    }

    // Filtro por fecha (si se estableció)
    const normalizaFecha = (texto: string): string | null => {
      if (!texto) return null;
      const t = texto.trim();
      // Quitar hora si existe
      const base = t.split(" ")[0].split("T")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return base; // YYYY-MM-DD
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(base)) {
        const [dd, mm, yyyy] = base.split("/");
        return `${yyyy}-${mm}-${dd}`;
      }
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(base)) {
        const [yyyy, mm, dd] = base.split("/");
        return `${yyyy}-${mm}-${dd}`;
      }
      return null;
    };
    if (fechaDesde || fechaHasta) {
      const fechaRaw = String((b as Record<string, unknown>)["Fecha"] || (b as Record<string, unknown>)["fecha"] || "");
      const f = normalizaFecha(fechaRaw);
      if (!f) return false;
      if (fechaDesde && f < fechaDesde) return false;
      if (fechaHasta && f > fechaHasta) return false;
    }
    return true;
  }, [busqueda, filtroRazonSocial, soloFacturables, isFacturable, fechaDesde, fechaHasta]);

  // Variante para listas rápidas: ignora "solo facturables", pero respeta búsqueda y razón social
  const aplicaFiltrosParaListas = useCallback((b: Boleta): boolean => {
    if (filtroRazonSocial) {
      const rs = (b["cliente"] || b["nombre"] || b["Razon Social"] || "").toString().toLowerCase();
      if (!rs.includes(filtroRazonSocial.toLowerCase())) return false;
    }
    if (busqueda) {
      const v = (key: string) => String((b as Record<string, unknown>)[key] ?? "").toLowerCase();
      const texto = busqueda.toLowerCase();
      const campos: string[] = [
        "cliente", "nombre", "Razon Social",
        "cuit", "CUIT", "dni",
        "Repartidor", "repartidor", "Nombre de Repartidor", "nombre_repartidor",
        "Tipo Pago", "tipo_pago",
        "Nro Comprobante", "Comprobante", "NroComp",
        "Registrado por", "Registrado Por", "registrado por", "registrado_por",
        "Usuario", "usuario", "Operador", "operador", "Cajero", "cajero",
      ];
      const coincide = campos.some((k) => v(k).includes(texto));
      if (!coincide) return false;
    }
    // Aplicar también filtro por fecha a las listas rápidas
    const normalizaFecha = (texto: string): string | null => {
      if (!texto) return null;
      const t = texto.trim();
      const base = t.split(" ")[0].split("T")[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return base;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(base)) {
        const [dd, mm, yyyy] = base.split("/");
        return `${yyyy}-${mm}-${dd}`;
      }
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(base)) {
        const [yyyy, mm, dd] = base.split("/");
        return `${yyyy}-${mm}-${dd}`;
      }
      return null;
    };
    if (fechaDesde || fechaHasta) {
      const fechaRaw = String((b as Record<string, unknown>)["Fecha"] || (b as Record<string, unknown>)["fecha"] || "");
      const f = normalizaFecha(fechaRaw);
      if (!f) return false;
      if (fechaDesde && f < fechaDesde) return false;
      if (fechaHasta && f > fechaHasta) return false;
    }
    return true;
  }, [busqueda, filtroRazonSocial, fechaDesde, fechaHasta]);

  // Aplicar filtros globales previos a los específicos de cada tarjeta
  const boletasFacturadasGlobal = useMemo(
    () => boletasFacturadas.filter(aplicaFiltrosGlobales),
    [boletasFacturadas, aplicaFiltrosGlobales]
  );
  const boletasNoFacturadasGlobal = useMemo(
    () => boletasNoFacturadas.filter(aplicaFiltrosGlobales),
    [boletasNoFacturadas, aplicaFiltrosGlobales]
  );
  const boletasFacturadasListaGlobal = useMemo(
    () => boletasFacturadas.filter(aplicaFiltrosParaListas),
    [boletasFacturadas, aplicaFiltrosParaListas]
  );
  const boletasNoFacturadasListaGlobal = useMemo(
    () => boletasNoFacturadas.filter(aplicaFiltrosParaListas),
    [boletasNoFacturadas, aplicaFiltrosParaListas]
  );
  const boletasFacturadasFiltradas = useMemo(() => {
    if (!filtroFacturadas) return boletasFacturadasGlobal;
    return boletasFacturadasGlobal.filter((b) => {
      const razonSocial = (b.cliente || b.nombre || b["Razon Social"] || "").toString().toLowerCase();
      return razonSocial.includes(filtroFacturadas.toLowerCase()) ||
        Object.values(b).some((v) => v?.toString().toLowerCase().includes(filtroFacturadas.toLowerCase()));
    });
  }, [boletasFacturadasGlobal, filtroFacturadas]);
  const boletasNoFacturadasFiltradas = useMemo(() => {
    if (!filtroNoFacturadas) return boletasNoFacturadasGlobal;
    return boletasNoFacturadasGlobal.filter((b) => {
      const razonSocial = (b.cliente || b.nombre || b["Razon Social"] || "").toString().toLowerCase();
      return razonSocial.includes(filtroNoFacturadas.toLowerCase()) ||
        Object.values(b).some((v) => v?.toString().toLowerCase().includes(filtroNoFacturadas.toLowerCase()));
    });
  }, [boletasNoFacturadasGlobal, filtroNoFacturadas]);

  // Listas para UI rápida (ignoran "solo facturables")
  const boletasFacturadasFiltradasLista = useMemo(() => {
    if (!filtroFacturadas) return boletasFacturadasListaGlobal;
    return boletasFacturadasListaGlobal.filter((b) => {
      const razonSocial = (b.cliente || b.nombre || b["Razon Social"] || "").toString().toLowerCase();
      return razonSocial.includes(filtroFacturadas.toLowerCase()) ||
        Object.values(b).some((v) => v?.toString().toLowerCase().includes(filtroFacturadas.toLowerCase()));
    });
  }, [boletasFacturadasListaGlobal, filtroFacturadas]);
  const boletasNoFacturadasFiltradasLista = useMemo(() => {
    if (!filtroNoFacturadas) return boletasNoFacturadasListaGlobal;
    return boletasNoFacturadasListaGlobal.filter((b) => {
      const razonSocial = (b.cliente || b.nombre || b["Razon Social"] || "").toString().toLowerCase();
      return razonSocial.includes(filtroNoFacturadas.toLowerCase()) ||
        Object.values(b).some((v) => v?.toString().toLowerCase().includes(filtroNoFacturadas.toLowerCase()));
    });
  }, [boletasNoFacturadasListaGlobal, filtroNoFacturadas]);
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
        setCargando(true);
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
      } finally {
        if (!cancelado) setCargando(false);
      }
    };
    cargar();
    return () => { cancelado = true; };
  }, [token]);

  // Restaurar filtros de fecha desde localStorage
  useEffect(() => {
    try {
      const fd = localStorage.getItem("filtro_fecha_desde") || "";
      const fh = localStorage.getItem("filtro_fecha_hasta") || "";
      if (fd || fh) {
        setFechaDesde(fd);
        setFechaHasta(fh);
        _setFechasInicializadas(true);
      }
    } catch { /* noop */ }
  }, []);

  // Persistir filtros de fecha
  useEffect(() => {
    try {
      localStorage.setItem("filtro_fecha_desde", fechaDesde);
      localStorage.setItem("filtro_fecha_hasta", fechaHasta);
    } catch { /* noop */ }
  }, [fechaDesde, fechaHasta]);
  // Agrupación (se declara después de calcular las listas filtradas)
  const agrupadas = useMemo(() => {
    const grupos: Record<string, { key: string; boletas: Boleta[]; groupType: string; facturado: boolean }> = {};
    const fuente: Boleta[] = (
      tipoBoleta === 'facturadas' ? boletasFacturadasFiltradas :
        tipoBoleta === 'no-facturadas' ? boletasNoFacturadasFiltradas :
          boletasFacturadasFiltradas.concat(boletasNoFacturadasFiltradas)
    );
    for (const b of fuente) {
      const facturacion = String(b["facturacion"] ?? "");
      const tipoPago = String(b["Tipo Pago"] ?? b["tipo_pago"] ?? "");
      const repartidor = String(b["Repartidor"] ?? b["repartidor"] ?? "");
      const key = `${facturacion}|${tipoPago}|${repartidor}`;
      const facturado = String(b["Estado"] ?? b["estado"] ?? "").toLowerCase().includes("factur") || String(b["Nro Comprobante"] ?? "").length > 0;
      if (!grupos[key]) grupos[key] = { key, boletas: [], groupType: `${facturacion} / ${tipoPago} / ${repartidor}`, facturado };
      grupos[key].boletas.push(b);
    }
    return Object.values(grupos);
  }, [boletasFacturadasFiltradas, boletasNoFacturadasFiltradas, tipoBoleta]);

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
          {cargando && (
            <div className="fixed inset-0 bg-white/60 backdrop-blur-sm z-40 flex items-center justify-center">
              <LoadingSpinner label="Cargando boletas…" />
            </div>
          )}
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
                  <span>Facturadas (mostrando {boletasFacturadasFiltradasLista.length} de {boletasFacturadas.length})</span>
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
              {/* Mobile list */}
              <div className="md:hidden divide-y">
                {(mostrarTodasFacturadas ? boletasFacturadasFiltradasLista : boletasFacturadasFiltradasLista.slice(0, 10)).map((b) => {
                  const id = String(b['ID Ingresos'] || b['id'] || '');
                  const razonSocial = b['cliente'] || b['nombre'] || b['Razon Social'] || '';
                  const total = b['total'] || b['INGRESOS'] || '';
                  return (
                    <div key={id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <button className="text-blue-700 text-left hover:underline truncate" onClick={() => setBoletaDetalle(b)} title="Ver boleta">
                        {String(razonSocial)}
                      </button>
                      <div className="text-xs">{String(total)}</div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-xs">
                  <thead className="bg-blue-50">
                    <tr><th className="p-1">Razón Social</th><th className="p-1">Total</th></tr>
                  </thead>
                  <tbody>
                    {(mostrarTodasFacturadas ? boletasFacturadasFiltradasLista : boletasFacturadasFiltradasLista.slice(0, 10)).map((b) => {
                      const id = String(b['ID Ingresos'] || b['id'] || '');
                      const razonSocial = b['cliente'] || b['nombre'] || b['Razon Social'] || '';
                      const total = b['total'] || b['INGRESOS'] || '';
                      return (
                        <tr key={id} className="border-t">
                          <td className="p-1 truncate max-w-[180px]">
                            <button className="text-blue-700 hover:underline" onClick={() => setBoletaDetalle(b)} title="Ver boleta">
                              {String(razonSocial)}
                            </button>
                          </td>
                          <td className="p-1">{String(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-2 border-t bg-white/60 flex justify-center">
                {boletasFacturadasFiltradasLista.length > 10 && (
                  <button className="text-xs text-blue-700 hover:underline" onClick={() => setMostrarTodasFacturadas((v) => !v)}>
                    {mostrarTodasFacturadas ? 'Mostrar menos' : 'Mostrar todas'}
                  </button>
                )}
              </div>
            </div>

            {/* Tarjeta: No facturadas */}
            <div className="bg-white rounded border overflow-hidden">
              <div className="p-3 font-semibold border-b">
                <div className="flex justify-between items-center mb-2">
                  <span>No facturadas (mostrando {boletasNoFacturadasFiltradasLista.length} de {boletasNoFacturadas.length})</span>
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
              {/* Mobile list */}
              <div className="md:hidden divide-y">
                {(mostrarTodasNoFacturadas ? boletasNoFacturadasFiltradasLista : boletasNoFacturadasFiltradasLista.slice(0, 10)).map((b) => {
                  const id = String(b['ID Ingresos'] || b['id'] || '');
                  const razonSocial = b['cliente'] || b['nombre'] || b['Razon Social'] || '';
                  const total = b['total'] || b['INGRESOS'] || '';
                  return (
                    <div key={id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <button className="text-blue-700 text-left hover:underline truncate" onClick={() => setBoletaDetalle(b)} title="Ver boleta">
                          {String(razonSocial || '— Sin razón social —')}
                        </button>
                        <div className="text-[11px] text-gray-500">Total: {String(total)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isFacturable(b) ? (
                          <button className="text-xs bg-blue-600 text-white rounded px-2 py-0.5 hover:bg-blue-700" onClick={() => facturarBoleta(b)} title="Facturar">
                            Facturar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 cursor-pointer"
                            title="No facturable"
                            aria-label="No facturable: ver motivo"
                            onClick={() => toast.info("No facturable", motivoNoFacturable(b))}
                          >
                            No facturable
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-xs">
                  <thead className="bg-blue-50">
                    <tr><th className="p-1">Razón Social</th><th className="p-1">Total</th></tr>
                  </thead>
                  <tbody>
                    {(mostrarTodasNoFacturadas ? boletasNoFacturadasFiltradasLista : boletasNoFacturadasFiltradasLista.slice(0, 10)).map((b) => {
                      const id = String(b['ID Ingresos'] || b['id'] || '');
                      const razonSocial = b['cliente'] || b['nombre'] || b['Razon Social'] || '';
                      const total = b['total'] || b['INGRESOS'] || '';
                      return (
                        <tr key={id} className="border-t">
                          <td className="p-1 truncate max-w-[180px]">
                            <div className="flex items-center gap-2">
                              <button className="text-blue-700 hover:underline" onClick={() => setBoletaDetalle(b)} title="Ver boleta">
                                {String(razonSocial || '— Sin razón social —')}
                              </button>
                              {isFacturable(b) ? (
                                <button className="text-xs bg-blue-600 text-white rounded px-2 py-0.5 hover:bg-blue-700" onClick={() => facturarBoleta(b)} title="Facturar">
                                  Facturar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 cursor-pointer"
                                  title="No facturable"
                                  aria-label="No facturable: ver motivo"
                                  onClick={() => toast.info("No facturable", motivoNoFacturable(b))}
                                >
                                  No facturable
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-1">{String(total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-2 border-t bg-white/60 flex justify-center">
                {boletasNoFacturadasFiltradasLista.length > 10 && (
                  <button className="text-xs text-blue-700 hover:underline" onClick={() => setMostrarTodasNoFacturadas((v) => !v)}>
                    {mostrarTodasNoFacturadas ? 'Mostrar menos' : 'Mostrar todas'}
                  </button>
                )}
              </div>
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Rango:</span>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded border hover:bg-gray-50"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  setFechaDesde(today); setFechaHasta(today); _setFechasInicializadas(true);
                }}
                title="Hoy"
              >Hoy</button>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded border hover:bg-gray-50"
                onClick={() => {
                  const d = new Date(); d.setDate(d.getDate() - 1);
                  const y = d.toISOString().split('T')[0];
                  setFechaDesde(y); setFechaHasta(y); _setFechasInicializadas(true);
                }}
                title="Ayer"
              >Ayer</button>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded border hover:bg-gray-50"
                onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
                title="Limpiar fecha"
              >Borrar</button>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">Búsqueda general</label>
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="Cliente, CUIT/DNI, repartidor, operador/usuario, etc."
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
                setFechaDesde(""); setFechaHasta("");
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
                          if (seleccion.length === 0) return toast.warning("No hay boletas facturables en el grupo");
                          // Construir payload de facturación por cantidad
                          const invoices = seleccion.map((b) => ({
                            id: getId(b),
                            total: parseMonto(b.total ?? b["INGRESOS"] ?? b["Total"] ?? b["TOTAL"] ?? 0),
                            cliente_data: {
                              cuit_o_dni: String(b.cuit || b.CUIT || b.dni || ""),
                              nombre_razon_social: String(b.cliente || b.nombre || b["Razon Social"] || ""),
                              domicilio: String(b["Domicilio"] || ""),
                              condicion_iva: String(b.condicion_iva || b["condicion-iva"] || "CONSUMIDOR_FINAL"),
                            },
                          }));
                          (async () => {
                            try {
                              if (!token) { toast.error('No autenticado'); return; }
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
                                toast.error(String(detail || 'Error al facturar en lote'));
                                return;
                              }
                              // Mostrar resumen simple
                              const okCount = Array.isArray(data) ? data.filter((r) => (r as { ok?: boolean }).ok !== false).length : 0;
                              toast.success(`Lote procesado`, `Éxitos: ${okCount} / ${seleccion.length}`);
                              // Refrescar datos
                              window.location.reload();
                            } catch {
                              toast.error('Error de conexión al facturar en lote');
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
              <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full p-4 md:p-6 relative" onClick={e => e.stopPropagation()}>
                <button className="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-xl" onClick={() => setModalOpen(false)}>&times;</button>
                <div className="mb-4">
                  <div className="font-bold text-blue-700 text-lg">{modalGroup.groupType}</div>
                  <div className="text-xs text-gray-500">{modalGroup.boletas.length} boletas</div>
                  <div className="mt-2">
                    <span className={`px-3 py-1 rounded text-xs font-semibold ${modalGroup.facturado ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>{modalGroup.facturado ? "Facturado" : "No facturado"}</span>
                  </div>
                </div>
                {/* Barra de acciones rápidas */}
                <div className="flex flex-col md:flex-row md:items-end gap-2 md:gap-4 mb-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 mb-1">Buscar en el grupo</label>
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      placeholder="Cliente, CUIT/DNI, repartidor, medio..."
                      value={modalSearch}
                      onChange={(e) => setModalSearch(e.target.value)}
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={modalSoloFacturables} onChange={(e) => setModalSoloFacturables(e.target.checked)} />
                    <span>Solo facturables</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                      onClick={() => {
                        // Seleccionar visibles facturables
                        const visibles = (modalGroup?.boletas || []).filter((b) => {
                          const txt = modalSearch.toLowerCase();
                          const v = (k: string) => String((b as Record<string, unknown>)[k] ?? "").toLowerCase();
                          const coincide = !txt || ["cliente", "nombre", "Razon Social", "cuit", "CUIT", "dni", "Repartidor", "repartidor", "Tipo Pago", "tipo_pago", "Nro Comprobante"].some((k) => v(k).includes(txt));
                          return coincide && (!modalSoloFacturables || isFacturable(b));
                        });
                        const ids = new Set(visibles.map((b) => getId(b)));
                        setSeleccionadas(ids);
                      }}
                      title="Seleccionar todas las visibles"
                    >Seleccionar visibles</button>
                    <button
                      className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm"
                      onClick={() => setSeleccionadas(new Set())}
                    >Limpiar selección</button>
                    <button
                      className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
                      onClick={async () => {
                        const seleccion = (modalGroup?.boletas || []).filter((b) => seleccionadas.has(getId(b)) && isFacturable(b));
                        if (seleccion.length === 0) return toast.warning("No hay boletas seleccionadas facturables");
                        try {
                          if (!token) { toast.error('No autenticado'); return; }
                          const invoices = seleccion.map((b) => ({
                            id: getId(b),
                            total: parseMonto(b.total ?? b["INGRESOS"] ?? b["Total"] ?? b["TOTAL"] ?? 0),
                            cliente_data: {
                              cuit_o_dni: String((b as Record<string, unknown>)["cuit"] || (b as Record<string, unknown>)["CUIT"] || (b as Record<string, unknown>)["dni"] || ""),
                              nombre_razon_social: String((b as Record<string, unknown>)["cliente"] || (b as Record<string, unknown>)["nombre"] || (b as Record<string, unknown>)["Razon Social"] || ""),
                              domicilio: String((b as Record<string, unknown>)["Domicilio"] || ""),
                              condicion_iva: String((b as Record<string, unknown>)["condicion_iva"] || (b as Record<string, unknown>)["condicion-iva"] || "CONSUMIDOR_FINAL"),
                            },
                          }));
                          const res = await fetch(`/api/facturador/facturar-por-cantidad?max_parallel_workers=5`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify(invoices),
                          });
                          const dataText = await res.text();
                          const isJson = dataText.trim().startsWith("{") || dataText.trim().startsWith("[");
                          const data: unknown = isJson ? JSON.parse(dataText) : dataText;
                          if (!res.ok) {
                            const detail = typeof data === 'object' && data && !Array.isArray(data) ? (data as { detail?: string }).detail : undefined;
                            toast.error(String(detail || 'Error al facturar seleccionadas'));
                            return;
                          }
                          const okCount = Array.isArray(data) ? data.filter((r) => (r as { ok?: boolean }).ok !== false).length : seleccion.length;
                          toast.success(`Lote procesado`, `Éxitos: ${okCount} / ${seleccion.length}`);
                          window.location.reload();
                        } catch {
                          toast.error('Error de conexión al facturar seleccionadas');
                        }
                      }}
                    >Facturar seleccionadas</button>
                  </div>
                </div>
                {/* ----- INICIO DEL CAMBIO EN LA TABLA ----- */}
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-xs">
                    <thead className="bg-blue-50 sticky top-0 z-10">
                      <tr>
                        <th className="p-1">Sel</th>
                        {/* Iterar sobre el array de columnas visibles */}
                        {columnasVisibles.map((col) => (<th key={col} className="p-1">{col}</th>))}
                        <th className="p-1">Estado</th>
                        <th className="p-1">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(modalGroup.boletas
                        .filter((b) => {
                          const txt = modalSearch.toLowerCase();
                          const v = (k: string) => String((b as Record<string, unknown>)[k] ?? "").toLowerCase();
                          const coincide = !txt || ["cliente", "nombre", "Razon Social", "cuit", "CUIT", "dni", "Repartidor", "repartidor", "Tipo Pago", "tipo_pago", "Nro Comprobante"].some((k) => v(k).includes(txt));
                          return coincide && (!modalSoloFacturables || isFacturable(b));
                        }))
                        .map((b) => {
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
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ${fact ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                                  title={fact ? "Cumple condiciones para facturar" : motivoNoFacturable(b)}
                                >
                                  {fact ? "✓ Facturable" : "✗ No facturable"}
                                </span>
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