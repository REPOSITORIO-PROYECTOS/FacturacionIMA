"use client";
import { useState } from "react";

export default function PerfilPage() {
  // Simulación de datos de usuario actual
  const [nombre, setNombre] = useState("admin");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMensaje("Datos actualizados correctamente (simulado)");
  }

  return (
    <div className="facturacion-contenedor">
      <h2>Mi perfil</h2>
  <form onSubmit={handleSubmit} className="form-facturacion">
        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre de usuario" required />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nueva contraseña" />
        <button type="submit">Actualizar datos</button>
      </form>
      {mensaje && <p className="error-message">{mensaje}</p>}
    </div>
  );
}
