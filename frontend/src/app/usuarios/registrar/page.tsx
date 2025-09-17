"use client";
import { useState } from "react";

export default function RegistrarUsuarioPage() {
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensaje("");
    // Aquí deberías llamar al endpoint real de registro
    setTimeout(() => {
      setMensaje("Usuario registrado correctamente (simulado)");
      setNombre("");
      setPassword("");
      setRol("");
    }, 1000);
  }

  return (
    <div className="facturacion-contenedor">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">Registrar nuevo usuario</h2>
      <form onSubmit={handleSubmit} className="bg-blue-50 p-6 rounded-lg shadow space-y-4">
        <input type="text" placeholder="Nombre de usuario" value={nombre} onChange={e => setNombre(e.target.value)} required className="w-full px-3 py-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-3 py-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <select value={rol} onChange={e => setRol(e.target.value)} required title="Seleccionar rol" className="w-full px-3 py-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Seleccionar rol</option>
          <option value="Admin">Admin</option>
          <option value="Cajero">Cajero</option>
          <option value="Gerente">Gerente</option>
          <option value="Soporte">Soporte</option>
        </select>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors">Registrar</button>
      </form>
      {mensaje && <p className="text-blue-700 mt-4">{mensaje}</p>}
    </div>
  );
}
