"use client";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";

interface CertificadoEstado {
    cuit: string;
    estado: 'sin_generar' | 'pendiente' | 'completo';
    mensaje: string;
    tiene_clave?: boolean;
}

interface ConfiguracionEmisor {
    cuit_empresa: string;
    razon_social: string;
    nombre_fantasia?: string;
    condicion_iva: string;
    punto_venta: number;
    direccion?: string;
    telefono?: string;
    email?: string;
    existe?: boolean;
}

interface CondicionIVA {
    id: number;
    nombre: string;
    descripcion: string;
}

export default function AFIPPage() {
    const [cuit, setCuit] = useState("");
    const [razonSocial, setRazonSocial] = useState("");
    const [certificadoPem, setCertificadoPem] = useState("");
    const [archivoCompleto, setArchivoCompleto] = useState<File | null>(null);
    const [certificados, setCertificados] = useState<CertificadoEstado[]>([]);
    const [loading, setLoading] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const [tipoOperacion, setTipoOperacion] = useState<"generar" | "subir" | "archivo" | "configurar">("configurar");

    // Estados para configuración de emisor
    const [configuracionEmisor, setConfiguracionEmisor] = useState<ConfiguracionEmisor>({
        cuit_empresa: "",
        razon_social: "",
        nombre_fantasia: "",
        condicion_iva: "RESPONSABLE_INSCRIPTO",
        punto_venta: 1,
        direccion: "",
        telefono: "",
        email: ""
    });
    const [condicionesIVA, setCondicionesIVA] = useState<CondicionIVA[]>([]);

    useEffect(() => {
        cargarCertificados();
        cargarCondicionesIVA();
    }, []);

    const cargarCondicionesIVA = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch("/api/afip?action=condiciones-iva", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCondicionesIVA(data.condiciones || []);
            }
        } catch (error) {
            console.error("Error cargando condiciones IVA:", error);
        }
    };

    const cargarConfiguracionEmisor = async (cuitEmisor: string) => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`/api/afip?action=configuracion-emisor&cuit=${cuitEmisor}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setConfiguracionEmisor(data);
            }
        } catch (error) {
            console.error("Error cargando configuración emisor:", error);
        }
    };

    const guardarConfiguracionEmisor = async () => {
        if (!configuracionEmisor.cuit_empresa || !configuracionEmisor.razon_social) {
            setMensaje("❌ Complete CUIT y Razón Social del emisor");
            return;
        }

        setLoading(true);
        setMensaje("");

        try {
            const token = localStorage.getItem("token");
            const res = await fetch("/api/afip?action=configurar-emisor", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(configuracionEmisor)
            });

            const data = await res.json();
            if (res.ok) {
                setMensaje(`✅ ${data.message}`);
            } else {
                setMensaje(`❌ Error: ${data.detail}`);
            }
        } catch (error) {
            setMensaje("❌ Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const cargarCertificados = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch("/api/afip", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCertificados(data.certificados || []);
            }
        } catch (error) {
            console.error("Error cargando certificados:", error);
        }
    };

    const generarCSR = async () => {
        if (!cuit || !razonSocial) {
            setMensaje("❌ Complete CUIT y Razón Social");
            return;
        }

        setLoading(true);
        setMensaje("");

        try {
            const token = localStorage.getItem("token");
            const res = await fetch("/api/afip?action=generar-csr", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    cuit_empresa: cuit,
                    razon_social: razonSocial
                })
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `csr_${cuit}.pem`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                setMensaje("✅ CSR generado y descargado. Ahora ve a AFIP para obtener el certificado.");
                cargarCertificados();
            } else {
                const error = await res.json();
                setMensaje(`❌ Error: ${error.detail}`);
            }
        } catch (error) {
            setMensaje("❌ Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const subirCertificado = async () => {
        if (!cuit || !certificadoPem) {
            setMensaje("❌ Complete CUIT y certificado PEM");
            return;
        }

        setLoading(true);
        setMensaje("");

        try {
            const token = localStorage.getItem("token");
            const res = await fetch("/api/afip?action=subir-certificado", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    cuit: cuit,
                    certificado_pem: certificadoPem
                })
            });

            const data = await res.json();
            if (res.ok) {
                setMensaje(`✅ ${data.message}`);
                setCertificadoPem("");
                cargarCertificados();
            } else {
                setMensaje(`❌ Error: ${data.detail}`);
            }
        } catch (error) {
            setMensaje("❌ Error de conexión");
        } finally {
            setLoading(false);
        }
    };

    const procesarArchivoCompleto = async () => {
        if (!cuit || !archivoCompleto) {
            setMensaje("❌ Complete CUIT y seleccione un archivo");
            return;
        }

        setLoading(true);
        setMensaje("");

        try {
            const contenido = await archivoCompleto.text();
            const token = localStorage.getItem("token");

            const res = await fetch("/api/afip?action=procesar-archivo-completo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    cuit: cuit,
                    archivo_contenido: contenido,
                    nombre_archivo: archivoCompleto.name
                })
            });

            const data = await res.json();
            if (res.ok) {
                setMensaje(`✅ ${data.message}`);
                setArchivoCompleto(null);
                cargarCertificados();
            } else {
                setMensaje(`❌ Error: ${data.detail}`);
            }
        } catch (error) {
            setMensaje("❌ Error procesando archivo");
        } finally {
            setLoading(false);
        }
    };

    const verificarEstado = async (cuitConsulta: string) => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`/api/afip?cuit=${cuitConsulta}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMensaje(`📋 ${data.mensaje}`);
            }
        } catch (error) {
            setMensaje("❌ Error verificando estado");
        }
    };

    return (
        <div className="flex">
            <Navbar />
            <main className="flex-1 md:ml-64 p-6">
                <div className="max-w-4xl mx-auto">
                    <h1 className="text-2xl font-bold text-blue-700 mb-6">🏛️ Gestión Certificados AFIP</h1>

                    {mensaje && (
                        <div className={`p-4 rounded-lg mb-6 ${mensaje.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                            {mensaje}
                        </div>
                    )}

                    {/* Selector de operación */}
                    <div className="bg-white rounded-lg shadow p-6 mb-6">
                        <h2 className="text-lg font-semibold mb-4">Seleccionar operación</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                            <button
                                onClick={() => setTipoOperacion("configurar")}
                                className={`px-3 py-2 rounded text-sm ${tipoOperacion === "configurar" ? "bg-purple-600 text-white" : "bg-gray-200"}`}
                            >
                                ⚙️ Configurar Emisor
                            </button>
                            <button
                                onClick={() => setTipoOperacion("generar")}
                                className={`px-3 py-2 rounded text-sm ${tipoOperacion === "generar" ? "bg-blue-600 text-white" : "bg-gray-200"}`}
                            >
                                1️⃣ Generar CSR
                            </button>
                            <button
                                onClick={() => setTipoOperacion("archivo")}
                                className={`px-3 py-2 rounded text-sm ${tipoOperacion === "archivo" ? "bg-green-600 text-white" : "bg-gray-200"}`}
                            >
                                2️⃣ Archivo completo ⭐
                            </button>
                            <button
                                onClick={() => setTipoOperacion("subir")}
                                className={`px-3 py-2 rounded text-sm ${tipoOperacion === "subir" ? "bg-orange-600 text-white" : "bg-gray-200"}`}
                            >
                                🔧 Manual
                            </button>
                        </div>
                    </div>

                    {/* Campos comunes - Solo para operaciones de certificados */}
                    {tipoOperacion !== "configurar" && (
                        <div className="bg-white rounded-lg shadow p-6 mb-6">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">CUIT (sin guiones)</label>
                                    <input
                                        type="text"
                                        value={cuit}
                                        onChange={(e) => setCuit(e.target.value)}
                                        placeholder="20123456789"
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                                {tipoOperacion === "generar" && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Razón Social</label>
                                        <input
                                            type="text"
                                            value={razonSocial}
                                            onChange={(e) => setRazonSocial(e.target.value)}
                                            placeholder="Nombre de la empresa"
                                            className="w-full p-2 border rounded"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Operaciones específicas */}
                    {tipoOperacion === "configurar" && (
                        <div className="bg-white rounded-lg shadow p-6 mb-6">
                            <h3 className="text-lg font-semibold mb-4">⚙️ Configuración del Emisor</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Configure los datos de su empresa para la facturación electrónica. Esta información se usará como emisor en todas las facturas.
                            </p>

                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">CUIT Empresa *</label>
                                    <input
                                        type="text"
                                        value={configuracionEmisor.cuit_empresa}
                                        onChange={(e) => {
                                            const newValue = e.target.value;
                                            setConfiguracionEmisor({ ...configuracionEmisor, cuit_empresa: newValue });
                                            if (newValue && newValue.length === 11) {
                                                cargarConfiguracionEmisor(newValue);
                                            }
                                        }}
                                        placeholder="20123456789"
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Razón Social *</label>
                                    <input
                                        type="text"
                                        value={configuracionEmisor.razon_social}
                                        onChange={(e) => setConfiguracionEmisor({ ...configuracionEmisor, razon_social: e.target.value })}
                                        placeholder="Empresa S.A."
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Nombre Fantasía</label>
                                    <input
                                        type="text"
                                        value={configuracionEmisor.nombre_fantasia || ""}
                                        onChange={(e) => setConfiguracionEmisor({ ...configuracionEmisor, nombre_fantasia: e.target.value })}
                                        placeholder="Nombre comercial"
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Condición IVA *</label>
                                    <select
                                        value={configuracionEmisor.condicion_iva}
                                        onChange={(e) => setConfiguracionEmisor({ ...configuracionEmisor, condicion_iva: e.target.value })}
                                        className="w-full p-2 border rounded"
                                    >
                                        {condicionesIVA.map((condicion) => (
                                            <option key={condicion.nombre} value={condicion.nombre}>
                                                {condicion.descripcion}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Punto de Venta</label>
                                    <input
                                        type="number"
                                        value={configuracionEmisor.punto_venta}
                                        onChange={(e) => setConfiguracionEmisor({ ...configuracionEmisor, punto_venta: parseInt(e.target.value) || 1 })}
                                        min="1"
                                        max="9999"
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Email</label>
                                    <input
                                        type="email"
                                        value={configuracionEmisor.email || ""}
                                        onChange={(e) => setConfiguracionEmisor({ ...configuracionEmisor, email: e.target.value })}
                                        placeholder="empresa@ejemplo.com"
                                        className="w-full p-2 border rounded"
                                    />
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Dirección</label>
                                <input
                                    type="text"
                                    value={configuracionEmisor.direccion || ""}
                                    onChange={(e) => setConfiguracionEmisor({ ...configuracionEmisor, direccion: e.target.value })}
                                    placeholder="Calle 123, Ciudad, Provincia"
                                    className="w-full p-2 border rounded"
                                />
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Teléfono</label>
                                <input
                                    type="text"
                                    value={configuracionEmisor.telefono || ""}
                                    onChange={(e) => setConfiguracionEmisor({ ...configuracionEmisor, telefono: e.target.value })}
                                    placeholder="+54 11 1234-5678"
                                    className="w-full p-2 border rounded"
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={guardarConfiguracionEmisor}
                                    disabled={loading}
                                    className="bg-purple-600 text-white px-6 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
                                >
                                    {loading ? "Guardando..." : "Guardar Configuración"}
                                </button>
                                {configuracionEmisor.existe && (
                                    <span className="text-sm text-green-600 self-center">✅ Configuración existente cargada</span>
                                )}
                            </div>
                        </div>
                    )}

                    {tipoOperacion === "generar" && (
                        <div className="bg-white rounded-lg shadow p-6 mb-6">
                            <h3 className="text-lg font-semibold mb-4">1️⃣ Generar CSR</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Genera un Certificate Signing Request para enviar a AFIP. El sistema guardará la clave privada automáticamente.
                            </p>
                            <button
                                onClick={generarCSR}
                                disabled={loading}
                                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                                {loading ? "Generando..." : "Generar y descargar CSR"}
                            </button>
                        </div>
                    )}

                    {tipoOperacion === "archivo" && (
                        <div className="bg-white rounded-lg shadow p-6 mb-6">
                            <h3 className="text-lg font-semibold mb-4">2️⃣ Subir archivo completo ⭐ (Recomendado)</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Sube directamente el archivo descargado de AFIP. El sistema automáticamente extraerá el certificado y la clave.
                            </p>
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Archivo de certificado</label>
                                <input
                                    type="file"
                                    accept=".crt,.pem,.p7b,.cer"
                                    onChange={(e) => setArchivoCompleto(e.target.files?.[0] || null)}
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <button
                                onClick={procesarArchivoCompleto}
                                disabled={loading}
                                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
                            >
                                {loading ? "Procesando..." : "Procesar archivo completo"}
                            </button>
                        </div>
                    )}

                    {tipoOperacion === "subir" && (
                        <div className="bg-white rounded-lg shadow p-6 mb-6">
                            <h3 className="text-lg font-semibold mb-4">🔧 Subir certificado manual</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Copia y pega el contenido del certificado PEM descargado de AFIP.
                            </p>
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Certificado PEM</label>
                                <textarea
                                    value={certificadoPem}
                                    onChange={(e) => setCertificadoPem(e.target.value)}
                                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                                    rows={8}
                                    className="w-full p-2 border rounded font-mono text-sm"
                                />
                            </div>
                            <button
                                onClick={subirCertificado}
                                disabled={loading}
                                className="bg-orange-600 text-white px-6 py-2 rounded hover:bg-orange-700 disabled:opacity-50"
                            >
                                {loading ? "Guardando..." : "Guardar certificado"}
                            </button>
                        </div>
                    )}

                    {/* Lista de certificados */}
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">📋 Certificados existentes</h3>
                            <button
                                onClick={cargarCertificados}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                                🔄 Actualizar
                            </button>
                        </div>

                        {certificados.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">No hay certificados configurados</p>
                        ) : (
                            <div className="space-y-3">
                                {certificados.map((cert, idx) => (
                                    <div key={idx} className="border rounded p-4 flex justify-between items-center">
                                        <div>
                                            <div className="font-medium">CUIT: {cert.cuit}</div>
                                            <div className="text-sm text-gray-600">{cert.mensaje}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${cert.estado === 'completo' ? 'bg-green-100 text-green-800' :
                                                cert.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                {cert.estado === 'completo' ? '✅ Completo' :
                                                    cert.estado === 'pendiente' ? '⏳ Pendiente' :
                                                        '❌ Sin generar'}
                                            </span>
                                            <button
                                                onClick={() => verificarEstado(cert.cuit)}
                                                className="text-blue-600 hover:text-blue-800 text-sm"
                                            >
                                                🔍 Verificar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}