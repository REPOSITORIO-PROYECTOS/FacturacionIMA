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
      <h2>Registrar nuevo usuario</h2>
  <form onSubmit={handleSubmit} className="form-facturacion">
        <input type="text" placeholder="Nombre de usuario" value={nombre} onChange={e => setNombre(e.target.value)} required />
        <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} required />
  <select value={rol} onChange={e => setRol(e.target.value)} required title="Seleccionar rol">
          <option value="">Seleccionar rol</option>
          <option value="Admin">Admin</option>
          <option value="Cajero">Cajero</option>
          <option value="Gerente">Gerente</option>
          <option value="Soporte">Soporte</option>
        </select>
        <button type="submit">Registrar</button>
      </form>
      {mensaje && <p className="error-message">{mensaje}</p>}
    </div>
  );
}
