"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { useRouter, useParams } from "next/navigation";

type Empresa = {
  id: number;
  nombre_legal: string;
  nombre_fantasia: string | null;
  cuit: string;
  activa: boolean;
  google_sheet_id?: string;
  afip_certificado?: string;
  afip_clave_privada?: string;
  aplicar_desglose_77?: boolean;
  detalle_empresa_text?: string | null;
};

export default function EmpresaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id;

  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('token');
    fetch(`/api/admin/empresas/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.detail) throw new Error(data.detail);
        setEmpresa(data);
      })
      .catch(() => setError("Error al cargar los datos de la empresa"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!empresa) return;
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setEmpresa({
      ...empresa,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  const handleSave = async () => {
    if (!empresa) return;
    setSaving(true);
    setError("");
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/admin/empresas/${empresa.id}`, {
        method: "PUT",
        headers: {
          'Authorization': `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(empresa),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al guardar los cambios");
      alert("Cambios guardados exitosamente.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!empresa) return;
    setSavingConfig(true);
    setError("");
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`/api/admin/empresas/${empresa.id}/configuracion`, {
        method: "PUT",
        headers: {
          'Authorization': `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id_empresa: empresa.id,
          cuit: empresa.cuit,
          aplicar_desglose_77: !!empresa.aplicar_desglose_77,
          detalle_empresa_text: empresa.detalle_empresa_text || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Error al guardar configuración");
      alert("Detalle de empresa guardado.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) return <div className="p-6 text-center">Cargando datos de la empresa...</div>;
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>;
  if (!empresa) return <div className="p-6 text-center">Empresa no encontrada.</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white rounded-lg shadow">
      <h1 className="text-3xl font-bold mb-6 border-b pb-2">Editar Empresa #{empresa.id}</h1>

      <div className="space-y-4">
        <div>
          <label htmlFor="nombre_legal" className="block text-sm font-medium text-gray-700">Nombre Legal</label>
          <input
            type="text"
            id="nombre_legal"
            name="nombre_legal"
            value={empresa.nombre_legal}
            onChange={handleInputChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>
        <div>
          <label htmlFor="nombre_fantasia" className="block text-sm font-medium text-gray-700">Nombre de Fantasía</label>
          <input
            type="text"
            id="nombre_fantasia"
            name="nombre_fantasia"
            value={empresa.nombre_fantasia || ''}
            onChange={handleInputChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>
        <div>
          <label htmlFor="cuit" className="block text-sm font-medium text-gray-700">CUIT</label>
          <input
            type="text"
            id="cuit"
            name="cuit"
            value={empresa.cuit}
            onChange={handleInputChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          />
        </div>
        <div className="flex items-center">
          <input
            type="checkbox"
            id="activa"
            name="activa"
            checked={empresa.activa}
            onChange={handleInputChange}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <label htmlFor="activa" className="ml-2 block text-sm text-gray-900">Activa</label>
        </div>
      </div>

      <div className="mt-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4">Configuración de Google Sheets</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">ID del Google Sheet</label>
            <input
              type="text"
              name="google_sheet_id"
              value={empresa.google_sheet_id || ''}
              onChange={handleInputChange}
              placeholder="Ej: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
            />
            <p className="text-xs text-gray-500 mt-1">ID del Google Sheet donde se almacenan las boletas de esta empresa</p>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4">Credenciales AFIP</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Certificado AFIP (.crt)</label>
            <textarea
              name="afip_certificado"
              value={empresa.afip_certificado || ''}
              onChange={handleInputChange}
              rows={4}
              placeholder="Pegar contenido del archivo .crt"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Clave Privada AFIP (.key)</label>
            <textarea
              name="afip_clave_privada"
              value={empresa.afip_clave_privada || ''}
              onChange={handleInputChange}
              rows={4}
              placeholder="Pegar contenido del archivo .key"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 border-t pt-6">
        <h2 className="text-xl font-semibold mb-4">Detalle de Empresa</h2>
        <div className="space-y-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="aplicar_desglose_77"
              name="aplicar_desglose_77"
              checked={!!empresa.aplicar_desglose_77}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="aplicar_desglose_77" className="ml-2 block text-sm text-gray-900">Usar desglose 77% + IVA 21% en el PDF</label>
          </div>
        
        <div>
          <label htmlFor="detalle_empresa_text" className="block text-sm font-medium text-gray-700">Texto de detalle (ejemplo de producto)</label>
          <input
            type="text"
            id="detalle_empresa_text"
            name="detalle_empresa_text"
            value={empresa.detalle_empresa_text || ''}
            onChange={handleInputChange}
            placeholder="Ej: Cigarrillos"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
          />
            <p className="text-xs text-gray-500 mt-1">Se usa en el bloque centrado del DETALLE cuando está activado.</p>
          </div>
          <div className="flex justify-end">
            <button
              className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300"
              onClick={handleSaveConfig}
              disabled={savingConfig}
            >
              {savingConfig ? "Guardando..." : "Guardar Detalle Empresa"}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mt-4 text-red-600 text-sm">{error}</div>}

      <div className="mt-6 flex justify-end space-x-3">
        <button
          className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
          onClick={() => router.back()}
        >
          Volver
        </button>
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar Cambios"}
        </button>
      </div>
    </div>
  );
}
