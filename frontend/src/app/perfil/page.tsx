"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function PerfilPage() {
  const [nombre, setNombre] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [activeTab, setActiveTab] = useState("perfil");
  const [cuit, setCuit] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [certificadoPem, setCertificadoPem] = useState("");
  const [loadingAfip, setLoadingAfip] = useState(false);
  // Define a type for estadoAfip
  type EstadoAfip = {
    estado?: string;
    mensaje?: string;
  };
  const [estadoAfip, setEstadoAfip] = useState<EstadoAfip | null>(null);

  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("user_name") || localStorage.getItem("remember_user") || "";
    setNombre(saved);
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    localStorage.setItem("user_name", nombre);
    setMensaje("Nombre actualizado");
    setTimeout(() => router.push("/dashboard"), 800);
  }


  const verificarEstadoAfip = useCallback(async () => {
    if (!cuit) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/afip?cuit=${cuit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setEstadoAfip(data);
      }
    } catch {
      // Silenciar error de red
    }
  }, [cuit]);

  const generarCSR = useCallback(async () => {
    if (!cuit || !razonSocial) {
      setMensaje("Complete CUIT y Razón Social");
      return;
    }

    setLoadingAfip(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/afip?action=generar-csr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cuit_empresa: cuit,
          razon_social: razonSocial,
        }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `csr_${cuit}.pem`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        setMensaje("CSR generado y descargado. Ahora puede subirlo a AFIP para obtener el certificado.");
        verificarEstadoAfip();
      } else {
        const errData = await response.json().catch(() => ({ detail: 'Error desconocido' }));
        setMensaje(`Error: ${errData.detail}`);
      }
    } catch {
      setMensaje("Error de conexión");
    } finally {
      setLoadingAfip(false);
    }
  }, [cuit, razonSocial, verificarEstadoAfip]);

  const subirCertificado = useCallback(async () => {
    if (!cuit || !certificadoPem) {
      setMensaje("Complete CUIT y pegue el certificado");
      return;
    }

    setLoadingAfip(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/afip?action=subir-certificado", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cuit: cuit,
          certificado_pem: certificadoPem,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMensaje("Certificado guardado exitosamente");
        setCertificadoPem("");
        verificarEstadoAfip();
      } else {
        setMensaje(`Error: ${data.detail}`);
      }
    } catch {
      setMensaje("Error de conexión");
    } finally {
      setLoadingAfip(false);
    }
  }, [cuit, certificadoPem, verificarEstadoAfip]);

  useEffect(() => {
    if (cuit && activeTab === "afip") {
      verificarEstadoAfip();
    }
  }, [cuit, activeTab, verificarEstadoAfip]);

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Configuración</h2>

          {/* Tabs */}
          <div className="flex border-b mb-4">
            <button
              className={`px-4 py-2 ${activeTab === "perfil" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-600"}`}
              onClick={() => setActiveTab("perfil")}
            >
              Perfil
            </button>
            <button
              className={`px-4 py-2 ${activeTab === "afip" ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-600"}`}
              onClick={() => setActiveTab("afip")}
            >
              Certificados AFIP
            </button>
          </div>

          {activeTab === "perfil" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1" htmlFor="nombre">Nombre de usuario</label>
                <input
                  id="nombre"
                  className="w-full border rounded px-3 py-2"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  required
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" className="px-4 py-2 rounded border" onClick={() => router.back()}>Cancelar</button>
                <button type="submit" className="px-4 py-2 rounded bg-blue-600 text-white">Guardar</button>
              </div>
            </form>
          )}

          {activeTab === "afip" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">CUIT Empresa</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={cuit}
                    onChange={(e) => setCuit(e.target.value)}
                    placeholder="20-12345678-9"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Razón Social</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    placeholder="Mi Empresa SRL"
                  />
                </div>
              </div>

              {estadoAfip && (
                <div className={`p-3 rounded ${estadoAfip.estado === 'completo' ? 'bg-green-100 border-green-300' :
                  estadoAfip.estado === 'pendiente' ? 'bg-yellow-100 border-yellow-300' :
                    'bg-gray-100 border-gray-300'
                  }`}>
                  <p className="font-medium">Estado: {estadoAfip.estado}</p>
                  <p className="text-sm">{estadoAfip.mensaje}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="font-medium mb-2">1. Generar CSR (Certificate Signing Request)</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Genere un CSR para solicitar el certificado a AFIP. Complete los datos y descargue el archivo.
                  </p>
                  <button
                    type="button"
                    onClick={generarCSR}
                    disabled={loadingAfip || !cuit || !razonSocial}
                    className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
                  >
                    {loadingAfip ? "Generando..." : "Generar y Descargar CSR"}
                  </button>
                </div>

                <div>
                  <h3 className="font-medium mb-2">2. Subir Certificado Firmado</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Después de obtener el certificado firmado desde AFIP, péguelo aquí para guardarlo.
                  </p>
                  <textarea
                    className="w-full border rounded px-3 py-2 h-32"
                    value={certificadoPem}
                    onChange={(e) => setCertificadoPem(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----
MIIDXTCCAkW...
-----END CERTIFICATE-----"
                  />
                  <button
                    type="button"
                    onClick={subirCertificado}
                    disabled={loadingAfip || !cuit || !certificadoPem}
                    className="mt-2 px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-400"
                  >
                    {loadingAfip ? "Guardando..." : "Guardar Certificado"}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" className="px-4 py-2 rounded border" onClick={() => router.back()}>Cerrar</button>
              </div>
            </div>
          )}

          {mensaje && <p className={`text-sm mt-3 ${mensaje.includes("Error") ? "text-red-700" : "text-green-700"}`}>{mensaje}</p>}
        </div>
      </div>
    </div>
  );
}
