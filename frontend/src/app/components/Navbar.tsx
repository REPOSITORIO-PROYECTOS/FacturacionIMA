
"use client";
import Link from "next/link";
import "../globals.css";

import { useEffect } from "react";

export default function Navbar() {
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
  }, []);

  function cambiarTema() {
    const esOscuro = document.body.classList.toggle("dark-theme");
    localStorage.setItem("tema", esOscuro ? "oscuro" : "claro");
  }

  const backendUrl = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_BACKEND_URL : undefined;
  const isRemote = Boolean(backendUrl && !backendUrl.includes('localhost') && !backendUrl.includes('127.0.0.1'));

  return (
    <nav className="navbar-facturacion">
      <div className="navbar-inner">
        <ul className="navbar-nav">
          <li><Link href="/">Inicio</Link></li>
          <li><Link href="/dashboard">Dashboard</Link></li>
          <li><Link href="/usuarios">Usuarios</Link></li>
          <li><Link href="/perfil">Perfil</Link></li>
        </ul>
        <div className="navbar-actions">
          {typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL && (
            <span className="env-badge">{process.env.NEXT_PUBLIC_BACKEND_URL}</span>
          )}
          <Link href="/login">Login</Link>
          {!isRemote && (
            <button
              className="navbar-theme-btn navbar-theme-btn-margin"
              onClick={cambiarTema}
            >Cambiar tema</button>
          )}
        </div>
      </div>
    </nav>
  );
}
