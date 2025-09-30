
"use client";
import Link from "next/link";
import "../globals.css";

import { useEffect, useState } from "react";

export default function Navbar() {
  const [userName, setUserName] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  // Forzar siempre tema claro y cargar nombre (tema único)
  useEffect(() => {
    document.body.classList.remove('dark-theme');
    document.body.classList.remove('fixed-theme');
    const deriveFromStorage = () => {
      const saved = localStorage.getItem("user_name") || localStorage.getItem("remember_user") || "";
      let name = saved;
      try {
        const info = JSON.parse(localStorage.getItem("user_info") || "{}");
        // prefer explicit saved name, otherwise try common fields from user_info
        if (!name) {
          name = info?.username || info?.nombre || info?.full_name || info?.display_name || info?.name || '';
        }
        let role = info.role || info.rol_nombre || info.rol || "";
        if (role === "Vendedor") role = "Cajero";
        setUserRole(role);
      } catch {
        setUserRole("");
      }
      setUserName(name || '');
    };

    deriveFromStorage();

    // Update when other tabs or login change localStorage
    const onStorage = (ev: StorageEvent) => {
      if (!ev.key) return;
      if (ev.key === 'user_info' || ev.key === 'user_name' || ev.key === 'remember_user' || ev.key === 'token') {
        deriveFromStorage();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Abrir automáticamente en mobile despues de login (cuando hay token)
  useEffect(() => {
    const token = localStorage.getItem('token');
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (token && isMobile) setOpen(true);
  }, []);

  // Ya no se muestra info de backend ni toggle de tema para simplificar UI móvil.

  return (
    <>
      {/* Botón hamburguesa visible sólo en mobile */}
      <button
        aria-label="Menú"
        className="md:hidden fixed top-3 right-3 z-40 bg-purple-600 text-white p-2 rounded shadow focus:outline-none focus:ring-2 focus:ring-purple-400"
        onClick={() => setOpen(o => !o)}
      >
        {open ? '✖' : '☰'}
      </button>
      {/* Aside siempre fixed; el main aplicará md:ml-64 para escritorio */}
      <aside className={`bg-white shadow-lg border-r border-gray-200 fixed inset-y-0 left-0 flex flex-col w-64 z-30 transform transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-gray-200">
          <h1 className="font-bold text-blue-700 text-xl">FacturacionIMA</h1>
          <p className="text-sm text-gray-500 mt-1">Sistema de Gestión</p>
        </div>

        <nav className="flex-1 mt-4">
          <ul className="space-y-1 px-3">
            {/* Home solo visible en mobile */}
            {typeof window !== 'undefined' && window.innerWidth < 768 && (
              <li>
                <Link href="/" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors">
                  <span className="ml-3">🏠 Home</span>
                </Link>
              </li>
            )}
            <li>
              <Link href="/dashboard" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors">
                <span className="ml-3">📊 Dashboard</span>
              </Link>
            </li>
            <li>
              <Link href="/boletas/no-facturadas" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors">
                <span className="ml-3">🧾 No Facturadas</span>
              </Link>
            </li>
            <li>
              <Link href="/boletas/facturadas" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors">
                <span className="ml-3">📑 Facturadas</span>
              </Link>
            </li>
            {/* Solo mostrar Usuarios si el usuario es admin */}
            {typeof window !== 'undefined' && (JSON.parse(localStorage.getItem("user_info") || "{}").role === "Admin") && (
              <li>
                <Link href="/usuarios" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors">
                  <span className="ml-3">👥 Usuarios</span>
                </Link>
              </li>
            )}
            <li>
              <Link href="/afip" className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors">
                <span className="ml-3">🏛️ AFIP</span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* Sección del usuario en la parte inferior */}
        <div className="p-4 border-t border-gray-200 bg-white mt-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {(userName || 'U').toString().slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{userName || 'Usuario'}</div>
              <div className="text-xs text-gray-500">{userRole ? userRole : 'Sin rol'}</div>
            </div>
          </div>

          {/* Enlaces de configuración */}
          <div className="space-y-1">
            <Link href="/afip" className="flex items-center px-2 py-1 text-xs text-gray-600 hover:text-blue-600 rounded">
              🔧 AFIP Config
            </Link>
            <button
              onClick={async () => {
                try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { }
                localStorage.removeItem('token');
                window.location.href = '/login';
              }}
              className="w-full text-left flex items-center px-2 py-1 text-xs text-gray-600 hover:text-red-600 rounded"
            >🚪 Cerrar Sesión</button>
          </div>

          {/* (Se removió info de backend y toggle de tema) */}
        </div>
      </aside>
      {/* Overlay clicable para cerrar en mobile */}
      {open && <div className="fixed inset-0 bg-black/30 md:hidden z-20" onClick={() => setOpen(false)} />}
    </>
  );
}
