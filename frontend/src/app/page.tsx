
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
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    // Traer boletas
    fetch("/api/boletas", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then((data: Boleta[]) => {
  if (Array.isArray(data)) setBoletas(data);
  else if (typeof data === 'object' && data !== null && 'detail' in data) setError((data as ErrorResponse).detail || "Error al cargar boletas");
  else setError("Error al cargar boletas");
      })
  .catch(() => setError("Error de conexión"));
    // Traer tablas
    fetch("/api/tablas", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then((data: Tabla[]) => {
        if (Array.isArray(data)) setTablas(data);
      })
  .catch(() => setError("Error al cargar tablas"));
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

  return (
    <div>
      <h2>Facturación - Boletas</h2>
      {error && <p className="error-message">{error}</p>}
      <div className="filtros-facturacion">
        <label htmlFor="tabla-select">Filtrar por tabla: </label>
        <select
          id="tabla-select"
          title="Seleccionar tabla"
          value={tablaSeleccionada}
          onChange={e => setTablaSeleccionada(e.target.value)}
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
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>
      <table className="tabla-facturacion">
        <thead>
          <tr>
            {boletasFiltradas.length > 0 && Object.keys(boletasFiltradas[0]).map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {boletasFiltradas.map((b) => (
            <tr key={b.id}>
              {Object.keys(b).map((k) => (
                <td key={k}>{String(b[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
