"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type Boleta = {
  id: number;
  tabla: string;
  total?: number;
  cuit?: string;
  dni?: string;
  cliente?: string;
  nombre?: string;
  domicilio?: string;
  condicion_iva?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

type Tabla = {
  id: number | string;
  nombre: string;
};

export default function HomePage() {
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [tablas, setTablas] = useState<Tabla[]>([]);
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set());

  const [tablaSeleccionada, setTablaSeleccionada] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const router = useRouter();
  const porPagina = 20;

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const fetchDatos = async () => {
      setLoading(true);
      setError("");
      try {
        const skip = (pagina - 1) * porPagina;
        const authHeaders = { Authorization: `Bearer ${token}` };

        const [boletasRes] = await Promise.all([
          fetch(`https://facturador-ima.sistemataup.online/api/boletas/obtener-todas?skip=${skip}&limit=${porPagina}`, { headers: authHeaders }),
        ]);

        if (!boletasRes.ok) throw new Error('Error al cargar boletas');
        const boletasData = await boletasRes.json();
        setBoletas(Array.isArray(boletasData) ? boletasData : []);

      
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    fetchDatos();
  }, [router, pagina]);

  const boletasFiltradas = useMemo(() => {
    return boletas.filter(b => {
      const coincideTabla = !tablaSeleccionada || b.tabla === tablaSeleccionada;
      const coincideBusqueda = !busqueda ||
        Object.values(b).some(v => v?.toString().toLowerCase().includes(busqueda.toLowerCase()));
      return coincideTabla && coincideBusqueda;
    });
  }, [boletas, tablaSeleccionada, busqueda]);

  const handleSeleccionChange = (boletaId: number) => {
    setSeleccionadas(prev => {
      const nuevasSeleccionadas = new Set(prev);
      if (nuevasSeleccionadas.has(boletaId)) {
        nuevasSeleccionadas.delete(boletaId);
      } else {
        nuevasSeleccionadas.add(boletaId);
      }
      return nuevasSeleccionadas;
    });
  };

  const handleFacturar = async (boleta: Boleta) => {
    const token = localStorage.getItem("token");
    if (!token) return alert("No hay token");
    const payload = {
      id: boleta.id,
      total: boleta.total || 0,
      cliente_data: {
        cuit_o_dni: boleta.cuit || boleta.dni || "",
        nombre_razon_social: boleta.cliente || boleta.nombre || "",
        domicilio: boleta.domicilio || "",
        condicion_iva: boleta.condicion_iva || ""
      }
    };
    const res = await fetch("https://facturador-ima.sistemataup.online/api/facturar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      alert("Facturación exitosa");
    } else {
      alert(data.detail || "Error al facturar");
    }
  };
  
  const handleFacturarLote = async () => {
    const token = localStorage.getItem("token");
    if (!token) return alert("No hay token");
    const payloads = boletas.filter(b => seleccionadas.has(b.id)).map(b => ({
      id: b.id,
      total: b.total || 0,
      cliente_data: {
        cuit_o_dni: b.cuit || b.dni || "",
        nombre_razon_social: b.cliente || b.nombre || "",
        domicilio: b.domicilio || "",
        condicion_iva: b.condicion_iva || ""
      }
    }));
    const res = await fetch("https://facturador-ima.sistemataup.online/api/facturar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ boletas: payloads })
    });
    const data = await res.json();
    if (res.ok) {
      alert("Facturación en lote exitosa");
      setSeleccionadas(new Set());
    } else {
      alert(data.detail || "Error al facturar en lote");
    }
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
  const tableHeaders = boletasFiltradas.length > 0 ? Object.keys(boletasFiltradas[0]) : [];

  return (
    <div className="facturacion-contenedor">
      <h2 className="facturacion-titulo">Facturación - Boletas</h2>
      <p className="facturacion-contexto">
        Aquí puedes visualizar, filtrar y buscar las boletas disponibles para facturación. 
        <b> Total boletas mostradas:</b> {boletasFiltradas.length}
      </p>

      <div className="filtros-facturacion filtros-facturacion-mb">
        <select value={tablaSeleccionada} onChange={e => setTablaSeleccionada(e.target.value)}>
          <option value="">Todas las tablas</option>
          {tablas.map((t) => <option key={t.id} value={t.nombre}>{t.nombre}</option>)}
        </select>
        <input
          type="text"
          className="busqueda-facturacion"
          placeholder="Buscar por campo, fecha, etc."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      <div className="tabla-facturacion-wrap">
        <table className="tabla-facturacion tabla-facturacion-min">
          <thead>
            <tr>
              <th><input type="checkbox" title="Seleccionar todo" disabled /></th>
              {tableHeaders.map(key => <th key={key}>{key}</th>)}
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {boletasFiltradas.map((boleta) => (
              <tr key={boleta.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(boleta.id)}
                    onChange={() => handleSeleccionChange(boleta.id)}
                  />
                </td>
                {tableHeaders.map(key => <td key={key}>{String(boleta[key])}</td>)}
                <td>
                  <button className="btn-facturar" onClick={() => handleFacturar(boleta)}>
                    Facturar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {seleccionadas.size > 0 && (
        <button className="btn-facturar-lote" onClick={handleFacturarLote}>
          Facturar {seleccionadas.size} seleccionadas
        </button>
      )}

      {totalPaginas > 1 && (
        <div className="paginacion-facturacion">
          <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>Anterior</button>
          <span>Página {pagina} de {totalPaginas}</span>
          <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>Siguiente</button>
        </div>
      )}
    </div>
  );
}