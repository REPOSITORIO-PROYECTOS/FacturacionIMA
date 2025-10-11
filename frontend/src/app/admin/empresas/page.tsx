
"use client";

import { useEffect, useState } from "react";

type Empresa = {
  id: number;
  nombre_legal: string;
  cuit: string;
  activa: boolean;
};

export default function EmpresasAdminPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/admin/empresas/")
      .then((res) => res.json())
      .then((data) => setEmpresas(data))
      .catch(() => setError("Error al cargar empresas"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Cargando empresas...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Administración de Empresas</h1>
      <table className="min-w-full border">
        <thead>
          <tr>
            <th className="border px-2 py-1">ID</th>
            <th className="border px-2 py-1">Nombre Legal</th>
            <th className="border px-2 py-1">CUIT</th>
            <th className="border px-2 py-1">Activa</th>
            <th className="border px-2 py-1">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((e) => (
            <tr key={e.id}>
              <td className="border px-2 py-1">{e.id}</td>
              <td className="border px-2 py-1">{e.nombre_legal}</td>
              <td className="border px-2 py-1">{e.cuit}</td>
              <td className="border px-2 py-1">{e.activa ? "Sí" : "No"}</td>
              <td className="border px-2 py-1">
                <a href={`/admin/empresas/${e.id}`} className="text-blue-600 underline">Ver/Editar</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
