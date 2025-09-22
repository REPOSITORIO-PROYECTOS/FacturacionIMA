"use client";
import { useState } from "react";

export default function UsuariosPage() {
  // Simulación de usuarios
  const [usuarios] = useState([
    { id: 1, nombre: "admin", rol: "Admin" },
    { id: 2, nombre: "cajero1", rol: "Cajero" },
  ]);

  return (
    <div className="facturacion-contenedor">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">Usuarios registrados</h2>
      <a href="/usuarios/registrar" className="text-blue-600 hover:underline mb-4 block">Registrar nuevo usuario</a>
      <table className="w-full border border-blue-300 rounded-lg overflow-hidden shadow">
        <thead className="bg-blue-100">
          <tr>
            <th className="px-4 py-2 text-blue-700">ID</th>
            <th className="px-4 py-2 text-blue-700">Nombre</th>
            <th className="px-4 py-2 text-blue-700">Rol</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map(u => (
            <tr key={u.id} className="hover:bg-blue-50">
              <td className="px-4 py-2 border-t border-blue-200">{u.id}</td>
              <td className="px-4 py-2 border-t border-blue-200">{u.nombre}</td>
              <td className="px-4 py-2 border-t border-blue-200">{u.rol}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
