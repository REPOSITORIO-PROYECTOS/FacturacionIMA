
"use client";
import Link from "next/link";
import "../globals.css";

import { useEffect, useState } from "react";

export default function Navbar() {
  const [userName, setUserName] = useState<string>("");
  // Al cargar, aplicar el tema guardado
  useEffect(() => {
    const backendUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_BACKEND_URL : undefined;
    const isRemote = Boolean(backendUrl && !backendUrl.includes('localhost') && !backendUrl.includes('127.0.0.1'));

    if (isRemote) {
      // Si apuntamos a un backend remoto, forzamos el tema fijo para mantener la UI consistente
      document.body.classList.remove("dark-theme");
      document.body.classList.add("fixed-theme");
      return;
    }

    const tema = localStorage.getItem("tema");
    if (tema === "oscuro") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }

    const saved = localStorage.getItem("user_name") || localStorage.getItem("remember_user") || "";
    setUserName(saved);
  }, []);

  function cambiarTema() {
    const esOscuro = document.body.classList.toggle("dark-theme");
    localStorage.setItem("tema", esOscuro ? "oscuro" : "claro");
  }

  const backendUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_BACKEND_URL : undefined;
  const isRemote = Boolean(backendUrl && !backendUrl.includes('localhost') && !backendUrl.includes('127.0.0.1'));

  return (
    <aside className="w-64 bg-white shadow-lg min-h-screen border-r border-gray-200 relative flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="font-bold text-purple-700 text-xl">FacturacionIMA</h1>
        <p className="text-sm text-gray-500 mt-1">Sistema de Gestión</p>
      </div>
      
      <nav className="flex-1 mt-4">
        <ul className="space-y-1 px-3">
          <li>
            <Link href="/dashboard" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors">
              <span className="ml-3">📊 Dashboard</span>
            </Link>
          </li>
          <li>
            <Link href="/" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors">
              <span className="ml-3">📄 Boletas</span>
            </Link>
          </li>
          <li>
            <Link href="/usuarios" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors">
              <span className="ml-3">👥 Usuarios</span>
            </Link>
          </li>
          <li>
            <Link href="/perfil" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors">
              <span className="ml-3">⚙️ Perfil</span>
            </Link>
          </li>
        </ul>
      </nav>

      {/* Sección del usuario en la parte inferior */}
      <div className="p-4 border-t border-gray-200 bg-white mt-auto">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm font-bold">
            {(userName || 'U').toString().slice(0,1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{userName || 'Usuario'}</div>
            <div className="text-xs text-gray-500">En línea</div>
          </div>
        </div>

        {/* Enlaces de configuración */}
        <div className="space-y-1">
          <Link href="/perfil" className="flex items-center px-2 py-1 text-xs text-gray-600 hover:text-purple-600 rounded">
            🔧 AFIP Config
          </Link>
          <Link href="/login" className="flex items-center px-2 py-1 text-xs text-gray-600 hover:text-red-600 rounded">
            🚪 Cerrar Sesión
          </Link>
        </div>

        {/* Información del backend */}
        {typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500 truncate" title={process.env.NEXT_PUBLIC_BACKEND_URL}>
            Backend: {process.env.NEXT_PUBLIC_BACKEND_URL.includes('localhost') ? 'Local' : 'Producción'}
          </div>
        )}

        {/* Botón tema solo en desarrollo */}
        {!isRemote && (
          <button 
            className="mt-2 w-full px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors" 
            onClick={cambiarTema}
          >
            🌙 Cambiar Tema
          </button>
        )}
      </div>
    </aside>
  );
}
