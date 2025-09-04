"use client";
import { useState } from "react";

export default function UsuariosPage() {
  // Simulación de usuarios
  const [usuarios, setUsuarios] = useState([
    { id: 1, nombre: "admin", rol: "Admin" },
    { id: 2, nombre: "cajero1", rol: "Cajero" },
  ]);

  return (
    <div className="facturacion-contenedor">
  <h2>Usuarios registrados</h2>
  <a href="/usuarios/registrar" className="enlace-registrar-usuario">Registrar nuevo usuario</a>
      <table className="tabla-facturacion tabla-facturacion-min">
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Rol</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.nombre}</td>
              <td>{u.rol}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
