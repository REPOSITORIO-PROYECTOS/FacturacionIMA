import Link from "next/link";
import "../globals.css";

export default function Navbar() {
  return (
    <nav className="navbar-facturacion">
      <ul>
        <li><Link href="/">Inicio</Link></li>
        <li><Link href="/login">Login</Link></li>
        <li><Link href="/usuarios">Usuarios</Link></li>
        <li><Link href="/perfil">Perfil</Link></li>
      </ul>
    </nav>
  );
}
