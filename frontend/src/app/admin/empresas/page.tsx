
"use client";

import { useEffect, useState } from "react";
import Link from 'next/link';

type EmpresaAdminInfo = {
  id: number;
  nombre_legal: string;
  cuit: string;
  activa: boolean;
  afip_configurada: boolean;
  condicion_iva: string | null;
  punto_venta: number | null;
};

export default function EmpresasAdminPage() {
  const [empresas, setEmpresas] = useState<EmpresaAdminInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setError("No se encontró el token de autenticación. Por favor, inicie sesión de nuevo.");
      setLoading(false);
      return;
    }

    fetch("/api/admin/empresas", {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ detail: 'Error desconocido' }));
          throw new Error(errorData.detail || `Error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setEmpresas(data);
        } else {
          setError("La respuesta no es una lista de empresas válida.");
        }
      })
      .catch((err) => setError(err.message || "Error al cargar los datos"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-center">Cargando empresas...</div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Administración de Empresas</h1>
        {/* Botón para crear nueva empresa (lo implementaremos después) */}
        <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
          + Crear Nueva Empresa
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border bg-white">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-4 py-2">ID</th>
              <th className="border px-4 py-2">Nombre Legal</th>
              <th className="border px-4 py-2">CUIT</th>
              <th className="border px-4 py-2">Activa</th>
              <th className="border px-4 py-2">Credenciales AFIP</th>
              <th className="border px-4 py-2">Condición IVA</th>
              <th className="border px-4 py-2">Punto Venta</th>
              <th className="border px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {empresas.length > 0 ? (
              empresas.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="border px-4 py-2 text-center">{e.id}</td>
                  <td className="border px-4 py-2">{e.nombre_legal}</td>
                  <td className="border px-4 py-2 text-center">{e.cuit}</td>
                  <td className="border px-4 py-2 text-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${e.activa ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                      {e.activa ? "Sí" : "No"}
                    </span>
                  </td>
                  <td className="border px-4 py-2 text-center">
                    <span className={`px-2 py-1 text-xs rounded-full ${e.afip_configurada ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                      {e.afip_configurada ? "Configuradas" : "Pendiente"}
                    </span>
                  </td>
                  <td className="border px-4 py-2">{e.condicion_iva || 'N/A'}</td>
                  <td className="border px-4 py-2 text-center">{e.punto_venta || 'N/A'}</td>
                  <td className="border px-4 py-2 text-center">
                    <Link href={`/admin/empresas/${e.id}`} className="text-blue-600 hover:underline">
                      Ver/Editar
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-4">
                  No se encontraron empresas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
