
"use client";
import Link from "next/link";
import "../globals.css";

import { useEffect } from "react";

export default function Navbar() {
  // Al cargar, aplicar el tema guardado
  useEffect(() => {
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

  return (
    <nav className="navbar-facturacion">
      <ul>
        <li><Link href="/">Inicio</Link></li>
        <li><Link href="/login">Login</Link></li>
        <li><Link href="/usuarios">Usuarios</Link></li>
        <li><Link href="/perfil">Perfil</Link></li>
        <li>
          <button
            className="navbar-theme-btn navbar-theme-btn-margin"
            onClick={cambiarTema}
          >Cambiar tema</button>
        </li>
      </ul>
    </nav>
  );
}
