"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CrearEmpresaPage() {
    const router = useRouter();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const [empresa, setEmpresa] = useState({
        nombre_legal: '',
        nombre_fantasia: '',
        cuit: '',
        google_sheet_id: '',
        afip_certificado: '',
        afip_clave_privada: '',
    });

    const [usuario, setUsuario] = useState({
        nombre_usuario: '',
        password: '',
    });

    const handleEmpresaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setEmpresa({ ...empresa, [e.target.name]: e.target.value });
    };

    const handleUsuarioChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUsuario({ ...usuario, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const token = localStorage.getItem('token');
        if (!token) {
            setError("No autenticado. Por favor, inicie sesión de nuevo.");
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('/api/admin/empresas', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ empresa, usuario }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || 'Error al crear la empresa.');
            }

            alert('Empresa y usuario creados exitosamente.');
            router.push('/admin/empresas');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto bg-white rounded-lg shadow">
            <h1 className="text-3xl font-bold mb-6 border-b pb-2">Crear Nueva Empresa</h1>
            <form onSubmit={handleSubmit} className="space-y-6">

                <div className="p-4 border rounded">
                    <h2 className="text-xl font-semibold mb-2">Datos de la Empresa</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nombre Legal (Razón Social)</label>
                            <input type="text" name="nombre_legal" value={empresa.nombre_legal} onChange={handleEmpresaChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nombre de Fantasía</label>
                            <input type="text" name="nombre_fantasia" value={empresa.nombre_fantasia} onChange={handleEmpresaChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">CUIT</label>
                            <input type="text" name="cuit" value={empresa.cuit} onChange={handleEmpresaChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                    </div>
                </div>

                <div className="p-4 border rounded">
                    <h2 className="text-xl font-semibold mb-2">Configuración de Google Sheets</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">ID del Google Sheet</label>
                            <input type="text" name="google_sheet_id" value={empresa.google_sheet_id} onChange={handleEmpresaChange} placeholder="Ej: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
                            <p className="text-xs text-gray-500 mt-1">ID del Google Sheet donde se almacenan las boletas de esta empresa</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border rounded">
                    <h2 className="text-xl font-semibold mb-2">Credenciales AFIP</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Certificado AFIP (.crt)</label>
                            <textarea name="afip_certificado" value={empresa.afip_certificado} onChange={handleEmpresaChange} rows={4} placeholder="Pegar contenido del archivo .crt" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Clave Privada AFIP (.key)</label>
                            <textarea name="afip_clave_privada" value={empresa.afip_clave_privada} onChange={handleEmpresaChange} rows={4} placeholder="Pegar contenido del archivo .key" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm font-mono text-sm" />
                        </div>
                    </div>
                </div>

                <div className="p-4 border rounded">
                    <h2 className="text-xl font-semibold mb-2">Primer Usuario Administrador</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nombre de Usuario</label>
                            <input type="text" name="nombre_usuario" value={usuario.nombre_usuario} onChange={handleUsuarioChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                            <input type="password" name="password" value={usuario.password} onChange={handleUsuarioChange} required className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" />
                        </div>
                    </div>
                </div>

                {error && <div className="text-red-600 text-sm text-center">{error}</div>}

                <div className="flex justify-end space-x-3">
                    <button type="button" onClick={() => router.back()} className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400">
                        Cancelar
                    </button>
                    <button type="submit" disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300">
                        {loading ? 'Creando...' : 'Crear Empresa y Usuario'}
                    </button>
                </div>
            </form>
        </div>
    );
}
