
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
    <aside className="w-64 bg-white shadow-md min-h-screen">
      <div className="p-6 font-bold text-purple-700 text-2xl">Facturación IMA</div>
      <nav className="mt-6">
        <ul className="flex flex-col gap-2">
          <li className="px-4 py-2 hover:bg-purple-50 rounded"><Link href="/dashboard">Dashboard</Link></li>
          <li className="px-4 py-2 hover:bg-purple-50 rounded"><Link href="/">Boletas</Link></li>
          <li className="px-4 py-2 hover:bg-purple-50 rounded"><Link href="/usuarios">Usuarios</Link></li>
          <li className="px-4 py-2 hover:bg-purple-50 rounded"><Link href="/perfil">Perfil</Link></li>
        </ul>
      </nav>

      <div className="p-4 mt-6 border-t">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">{(userName || 'U').toString().slice(0,1).toUpperCase()}</div>
          <div>
            <div className="font-semibold">{userName || 'Usuario'}</div>
            <div className="text-sm text-gray-500">&nbsp;</div>
          </div>
        </div>

        <div className="mt-4">
          {typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL && (
            <div className="env-badge text-xs text-gray-500">{process.env.NEXT_PUBLIC_BACKEND_URL}</div>
          )}
          <div className="mt-3 space-y-2">
            <Link href="/login" className="block text-sm text-blue-600">Login</Link>
            <Link href="/perfil" className="block text-sm text-blue-600">AFIP Config</Link>
          </div>
          {!isRemote && (
            <button className="mt-3 inline-block px-3 py-1 bg-gray-100 rounded" onClick={cambiarTema}>Tema</button>
          )}
        </div>
      </div>
    </aside>
  );
}
