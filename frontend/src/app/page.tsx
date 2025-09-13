"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

// --- TIPOS DE DATOS ---

type Boleta = {
  "ID Ingresos": string;
  "Fecha": string;
  "INGRESOS": string;
  "ID Cliente": number;
  "Cliente": string;
  "CUIT": number;
  "Razon Social": string;
  "facturacion": string;
  "condicion-iva"?: string;
  "Domicilio"?: string;
  // eslint-disable-next-line
  [key: string]: any;
};

type Tabla = {
  id: number | string;
  nombre: string;
};

type ErrorResponse = { detail?: string } | Record<string, unknown>;

type ClienteDataPayload = {
  cuit_o_dni: string;
  nombre_razon_social: string;
  domicilio: string;
  condicion_iva: string;
};


// --- CONFIGURACIÓN DE LA TABLA ---

// (removed unused COLUMNAS_VISIBLES)

// --- COMPONENTE PRINCIPAL ---

export default function HomePage() {
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [tablaSeleccionada, setTablaSeleccionada] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const porPagina = 20;

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      // Endpoint paginado
      const skip = (pagina - 1) * porPagina;
      const limit = porPagina;
      try {
        const resBoletas = await fetch(`/api/boletas?skip=${skip}&limit=${limit}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resBoletas.ok) {
          let err: any = null;
          try { err = await resBoletas.json(); } catch { err = await resBoletas.text().catch(() => null); }
          setError(String(err?.detail || err || "Error al cargar boletas"));
        } else {
          const boletasData = await resBoletas.json();
          if (mounted && Array.isArray(boletasData)) setBoletas(boletasData);
        }
      } catch (e) {
        setError("Error de conexión al cargar boletas");
      }

      try {
        const resTablas = await fetch(`/api/tablas`, { headers: { Authorization: `Bearer ${token}` } });
        if (!resTablas.ok) {
          // ignore tablas failure, but set error so user sees it
          let err: any = null;
          try { err = await resTablas.json(); } catch { err = await resTablas.text().catch(() => null); }
          setError(String(err?.detail || err || "Error al cargar tablas"));
        } else {
          const tablasData = await resTablas.json();
          if (mounted && Array.isArray(tablasData)) setTablas(tablasData);
        }
      } catch (e) {
        setError("Error de conexión al cargar tablas");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [router, pagina]);

  const boletasFiltradas = useMemo(() => {
    return boletas.filter(b => {
      const coincideTabla = !tablaSeleccionada || b.tabla === tablaSeleccionada;
      const coincideBusqueda = !busqueda ||
        Object.values(b).some(v => v?.toString().toLowerCase().includes(busqueda.toLowerCase()));
      return coincideTabla && coincideBusqueda;
    });
  }, [boletas, tablaSeleccionada, busqueda]);

  const parseMonto = (monto: string): number => {
    if (!monto || typeof monto !== 'string') return 0;
    const numeroLimpio = monto.replace(/\$|\s/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(numeroLimpio) || 0;
  };
  
  if (loading) {
    return (
      <div className="facturacion-contenedor">
        <div className="facturacion-loader">
          <span className="loader" />
          <p>Cargando boletas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="facturacion-contenedor">
        <h2 className="facturacion-titulo">Facturación - Boletas</h2>
        <p className="error-message">{error}</p>
      </div>
    );
  }

  const totalBoletas = 1000;
  const totalPaginas = Math.ceil(totalBoletas / porPagina);

  // Página actual de boletas (slice de los boletas filtradas)
  const boletasPagina = boletasFiltradas.slice((pagina - 1) * porPagina, pagina * porPagina);

  // Helper para extraer un id estable de la boleta (soporta varias formas)
  const getId = (b: unknown) => {
    if (b && typeof b === 'object') {
      const obj = b as Record<string, unknown>;
      return String(obj['id'] ?? obj['ID Ingresos'] ?? obj['ID Ingreso'] ?? obj['ID'] ?? '');
    }
    return '';
  };

  return (
    <div className="facturacion-contenedor">
      <h2 className="facturacion-titulo">Facturación - Boletas</h2>
      <p className="facturacion-contexto">
        Aquí puedes visualizar, filtrar y buscar las boletas disponibles para facturación. 
        <b> Total boletas mostradas:</b> {boletasFiltradas.length}
      </p>

      <div className="filtros-facturacion filtros-facturacion-mb">
        <label htmlFor="tabla-select">Filtrar por tabla: </label>
        <select
          id="tabla-select"
          title="Seleccionar tabla"
          value={tablaSeleccionada}
          onChange={e => { setTablaSeleccionada(e.target.value); setPagina(1); }}
        >
          <option value="">Todas</option>
          {tablas.map((t) => (
            <option key={t.id} value={t.nombre}>{t.nombre}</option>
          ))}
        </select>
    <div className="search-wrap">
            <input
              type="text"
              className="busqueda-facturacion"
              placeholder="Buscar por campo, fecha, etc."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
              aria-label="Buscar boletas"
            />
            <button type="button" className="btn-clear-search" onClick={() => { setBusqueda(''); setPagina(1); }}>Limpiar</button>
          </div>
      </div>
      {loading ? (
        <div className="facturacion-loader">
          <span className="loader" />
          <p>Cargando boletas...</p>
        </div>
      ) : (
        <>
          <div className="tabla-facturacion-wrap">
            <table className="tabla-facturacion tabla-facturacion-min">
              <caption className="tabla-facturacion-caption">
                Detalle de boletas obtenidas del endpoint <code>/api/boletas</code> y filtradas por <code>/api/tablas</code>
              </caption>
              <thead>
                <tr>
                  <th>Seleccionar</th>
                  {boletasPagina.length > 0 && Object.keys(boletasPagina[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boletasPagina.map((b) => (
                  <tr key={getId(b)}>
                        <td>
                          <input
                            type="checkbox"
                            checked={seleccionadas.has(getId(b))}
                            title={`Seleccionar boleta ${getId(b)}`}
                            onChange={e => {
                              const id = getId(b);
                              setSeleccionadas(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(id); else next.delete(id);
                                return next;
                              });
                            }}
                          />
                        </td>
                    {Object.keys(b).map((k) => (
                      <td key={k}>{String(b[k])}</td>
                    ))}
                      <td>
                      <button
                        className="btn-facturar"
                        onClick={async () => {
                          const token = localStorage.getItem("token");
                          if (!token) return alert("No hay token");
                          const payload = {
                            id: getId(b),
                            total: b.total || parseMonto(String(b.INGRESOS || b.total || 0)),
                            cliente_data: {
                              cuit_o_dni: b.cuit || b.dni || String(b.CUIT || ""),
                              nombre_razon_social: b.cliente || b.nombre || b["Razon Social"] || "",
                              domicilio: b.domicilio || b["Domicilio"] || "",
                              condicion_iva: b.condicion_iva || b["condicion-iva"] || ""
                            }
                          };
                          try {
                            const res = await fetch("/api/facturar", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`
                              },
                              body: JSON.stringify(payload)
                            });
                            let data: any = null;
                            try { data = await res.json(); } catch { /* ignore */ }
                            if (res.ok) {
                              alert("Facturación exitosa");
                            } else {
                              alert(String(data?.detail || data || "Error al facturar"));
                            }
                          } catch (e) {
                            alert("Error de conexión al facturar");
                          }
                        }}
                      >Facturar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Botón para facturar seleccionadas */}
          {seleccionadas.size > 0 && (
                <button
              className="btn-facturar-lote"
              onClick={async () => {
                const token = localStorage.getItem("token");
                if (!token) return alert("No hay token");
                const payloads = boletasPagina.filter(b => seleccionadas.has(getId(b))).map(b => ({
                  id: getId(b),
                  total: b.total || parseMonto(String(b.INGRESOS || b.total || 0)),
                  cliente_data: {
                    cuit_o_dni: b.cuit || b.dni || String(b.CUIT || ""),
                    nombre_razon_social: b.cliente || b.nombre || b["Razon Social"] || "",
                    domicilio: b.domicilio || b["Domicilio"] || "",
                    condicion_iva: b.condicion_iva || b["condicion-iva"] || ""
                  }
                }));
                try {
                  const res = await fetch("/api/facturar", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ boletas: payloads })
                  });
                  let data: any = null;
                  try { data = await res.json(); } catch { /* ignore */ }
                  if (res.ok) {
                    alert("Facturación en lote exitosa");
                    setSeleccionadas(new Set());
                  } else {
                    alert(String(data?.detail || data || "Error al facturar en lote"));
                  }
                } catch (e) {
                  alert("Error de conexión al facturar en lote");
                }
              }}
            >Facturar seleccionadas</button>
          )}
          {/* Paginación */}
          {totalPaginas > 1 && (
            <div className="paginacion-facturacion">
              <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>Anterior</button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>Siguiente</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}