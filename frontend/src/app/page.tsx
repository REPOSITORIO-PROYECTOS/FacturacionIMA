
"use client";
type ErrorResponse = {
  detail: string;
};


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Boleta = {
  id: number;
  tabla: string;
  [key: string]: string | number | boolean | null;
};

type Tabla = {
  id: number | string;
  nombre: string;
};

export default function HomePage() {
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [error, setError] = useState("");
  const [tablaSeleccionada, setTablaSeleccionada] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(1);
  const porPagina = 20;
  const router = useRouter();

  useEffect(() => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    Promise.all([
      fetch("/api/boletas", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(res => res.json()),
      fetch("/api/tablas", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(res => res.json()),
    ])
      .then(([boletasData, tablasData]) => {
        if (Array.isArray(boletasData)) setBoletas(boletasData);
        else if (typeof boletasData === 'object' && boletasData !== null && 'detail' in boletasData) setError((boletasData as ErrorResponse).detail || "Error al cargar boletas");
        else setError("Error al cargar boletas");
        if (Array.isArray(tablasData)) setTablas(tablasData);
      })
      .catch(() => setError("Error de conexión"))
      .finally(() => setLoading(false));
  }, [router]);

  // Filtrar boletas por tabla y búsqueda
  const boletasFiltradas = boletas.filter(b => {
    const coincideTabla = tablaSeleccionada ? b.tabla === tablaSeleccionada : true;
    const coincideBusqueda = busqueda
      ? Object.values(b).some(v =>
          v && v.toString().toLowerCase().includes(busqueda.toLowerCase())
        )
      : true;
    return coincideTabla && coincideBusqueda;
  });

  // Paginación
  const totalPaginas = Math.ceil(boletasFiltradas.length / porPagina);
  const boletasPagina = boletasFiltradas.slice((pagina - 1) * porPagina, pagina * porPagina);

  return (
    <div className="facturacion-contenedor">
      <h2 className="facturacion-titulo">Facturación - Boletas</h2>
      <p className="facturacion-contexto">
        Aquí puedes visualizar, filtrar y buscar las boletas disponibles para facturación. Utiliza los filtros para encontrar boletas por tabla o por cualquier campo relevante (ejemplo: fecha, monto, cliente, etc).<br />
        <b>Total boletas mostradas:</b> {boletasFiltradas.length}
      </p>
      {error && <p className="error-message">{error}</p>}
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
        <input
          type="text"
          className="busqueda-facturacion"
          placeholder="Buscar por campo, fecha, etc."
          value={busqueda}
          onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
        />
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
                  {boletasPagina.length > 0 && Object.keys(boletasPagina[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boletasPagina.map((b) => (
                  <tr key={b.id}>
                    {Object.keys(b).map((k) => (
                      <td key={k}>{String(b[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
