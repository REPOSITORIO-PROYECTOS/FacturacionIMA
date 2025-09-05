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
  [key: string]: any;
};

type Tabla = {
  id: number | string;
  nombre: string;
};

type ClienteDataPayload = {
  cuit_o_dni: string;
  nombre_razon_social: string;
  domicilio: string;
  condicion_iva: string;
};

type InvoiceItemPayload = {
  id: string;
  total: number;
  cliente_data: ClienteDataPayload;
};

// --- CONFIGURACIÓN DE LA TABLA ---

const COLUMNAS_VISIBLES = [
  { key: 'ID Ingresos', header: 'ID Ingreso' },
  { key: 'Fecha', header: 'Fecha' },
  { key: 'INGRESOS', header: 'Ingresos' },
  { key: 'ID Cliente', header: 'ID Cliente' },
  { key: 'Cliente', header: 'Cliente' },
  { key: 'CUIT', header: 'CUIT' },
  { key: 'Razon Social', header: 'Razón Social' },
  { key: 'facturacion', header: 'Estado' },
];

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
  const [loteLoading, setLoteLoading] = useState(false);
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

        const res = await fetch(`https://facturador-ima.sistemataup.online/api/boletas/obtener-todas?skip=${skip}&limit=${porPagina}`, { headers: authHeaders });
        
        if (!res.ok) throw new Error('Error al cargar boletas');
        const boletasData = await res.json();
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

  const handleSeleccionChange = (boletaId: string) => {
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

  const parseMonto = (monto: string): number => {
    if (!monto || typeof monto !== 'string') return 0;
    const numeroLimpio = monto.replace(/\$|\s/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(numeroLimpio) || 0;
  };

  const handleFacturar = async (boleta: Boleta) => {
    const token = localStorage.getItem("token");
    if (!token) return alert("No hay token");
    
    const payload: InvoiceItemPayload = {
      id: boleta["ID Ingresos"],
      total: parseMonto(boleta["INGRESOS"]),
      cliente_data: {
        cuit_o_dni: String(boleta["CUIT"] || ""),
        nombre_razon_social: boleta["Razon Social"] || boleta["Cliente"],
        domicilio: boleta["Domicilio"] || "",
        condicion_iva: boleta["condicion-iva"] || "CONSUMIDOR_FINAL"
      }
    };

    const res = await fetch("https://facturador-ima.sistemataup.online/api/facturador/facturar-por-cantidad", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify([payload])
    });
    
    const data = await res.json();
    if (res.ok) {
      alert("Facturación exitosa");
    } else {
      console.error("Error de validación desde la API:", data);
      alert("Error de validación. Revisa la consola del navegador para más detalles (presiona F12).");
    }
  };
  
  const handleFacturarLote = async () => {
    const token = localStorage.getItem("token");
    if (!token) return alert("No hay token");
    
    const payloads: InvoiceItemPayload[] = boletas
      .filter(b => seleccionadas.has(b["ID Ingresos"]))
      .map(b => ({
        id: b["ID Ingresos"],
        total: parseMonto(b["INGRESOS"]),
        cliente_data: {
          cuit_o_dni: String(b["CUIT"] || ""),
          nombre_razon_social: b["Razon Social"] || b["Cliente"],
          domicilio: b["Domicilio"] || "",
          condicion_iva: b["condicion-iva"] || "CONSUMIDOR_FINAL"
        }
      }));

    if (payloads.length === 0) {
      alert("No hay boletas seleccionadas para facturar.");
      return;
    }

    setLoteLoading(true);
    try {
      const res = await fetch("https://facturador-ima.sistemataup.online/api/facturador/facturar-por-cantidad", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payloads)
      });
      
      const data = await res.json();
      if (res.ok) {
        alert("Facturación en lote procesada.");
        setSeleccionadas(new Set());
      } else {
        console.error("Error de validación desde la API:", data);
        alert("Error de validación. Revisa la consola del navegador para más detalles (presiona F12).");
      }
    } catch (error) {
      alert("Error de conexión al facturar en lote.");
    } finally {
      setLoteLoading(false);
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
        <table className="tabla-facturacion">
          <thead>
            <tr>
              <th className="col-checkbox">
                <input type="checkbox" title="Seleccionar todo" disabled />
              </th>
              {COLUMNAS_VISIBLES.map((col) => (
                <th key={col.key}>{col.header}</th>
              ))}
              <th className="col-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {boletasFiltradas.map((boleta) => (
              <tr key={boleta["ID Ingresos"]}>
                <td className="col-checkbox">
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(boleta["ID Ingresos"])}
                    onChange={() => handleSeleccionChange(boleta["ID Ingresos"])}
                  />
                </td>
                {COLUMNAS_VISIBLES.map((col) => (
                  <td key={col.key}>
                    {String(boleta[col.key] ?? 'N/A')}
                  </td>
                ))}
                <td className="col-acciones">
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
    <button 
      className="btn-facturar-lote" 
      onClick={handleFacturarLote}
      disabled={loteLoading}
    >
      {loteLoading 
        ? 'Procesando...' 
        : `Facturar ${seleccionadas.size} ${seleccionadas.size === 1 ? 'seleccionada' : 'seleccionadas'}`
      }
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