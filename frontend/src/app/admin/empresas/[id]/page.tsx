"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

type Empresa = {
  id: number;
  nombre_legal: string;
  cuit: string;
  activa: boolean;
};

export default function EmpresaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/admin/empresas/${id}`)
      .then((res) => res.json())
      .then((data) => setEmpresa(data))
      .catch(() => setError("Error al cargar empresa"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleToggleActiva = async () => {
    if (!empresa) return;
    setSaving(true);
    const res = await fetch(`/admin/empresas/${empresa.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...empresa, activa: !empresa.activa }),
    });
    if (res.ok) {
      setEmpresa({ ...empresa, activa: !empresa.activa });
    }
    setSaving(false);
  };

  if (loading) return <div>Cargando empresa...</div>;
  if (error) return <div>{error}</div>;
  if (!empresa) return <div>No encontrada</div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Empresa #{empresa.id}</h1>
      <div className="mb-2">Nombre Legal: <b>{empresa.nombre_legal}</b></div>
      <div className="mb-2">CUIT: <b>{empresa.cuit}</b></div>
      <div className="mb-2">Activa: <b>{empresa.activa ? "Sí" : "No"}</b></div>
      <button
        className={`px-4 py-2 rounded ${empresa.activa ? "bg-red-600" : "bg-green-600"} text-white`}
        onClick={handleToggleActiva}
        disabled={saving}
      >
        {empresa.activa ? "Desactivar" : "Activar"}
      </button>
      <button
        className="ml-4 px-4 py-2 rounded bg-gray-300"
        onClick={() => router.back()}
      >Volver</button>
    </div>
  );
}
