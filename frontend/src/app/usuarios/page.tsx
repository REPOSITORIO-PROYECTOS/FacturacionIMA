"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UsuariosPage() {
  // --- Funciones para editar y desactivar ---
  function handleEdit(u: Usuario) {
    const nuevoRol = prompt(`Nuevo rol para ${u.nombre_usuario || u.nombre}:`, u.rol_nombre || u.rol || "Cajero");
    if (!nuevoRol) return;
    const token = localStorage.getItem("token");
    fetch(`/api/usuarios/${u.nombre_usuario || u.nombre}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ rol_nombre: nuevoRol })
    })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(() => {
        alert("Usuario actualizado");
        window.location.reload();
      })
      .catch(() => alert("Error al actualizar usuario"));
  }

  function handleDeactivate(u: Usuario) {
    if (!window.confirm(`¿Desactivar usuario ${u.nombre_usuario || u.nombre}?`)) return;
    const token = localStorage.getItem("token");
    fetch(`/api/usuarios/${u.nombre_usuario || u.nombre}/desactivar`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(() => {
        alert("Usuario desactivado");
        window.location.reload();
      })
      .catch(() => alert("Error al desactivar usuario"));
  }
  const router = useRouter();
  type Usuario = {
    id: number | string;
    nombre_usuario?: string;
    nombre?: string;
    rol_nombre?: string;
    rol?: string;
  };
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/dashboard");
      return;
    }
    // Obtener rol del usuario autenticado
    const userInfo = JSON.parse(localStorage.getItem("user_info") || "{}");
    if (userInfo.role !== "Admin") {
      setIsAdmin(false);
      router.replace("/dashboard");
      return;
    }
    setIsAdmin(true);
    setLoading(true);
    fetch("/api/usuarios", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(data => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => setError("No se pudo cargar la lista de usuarios"))
      .finally(() => setLoading(false));
  }, [router]);

  if (!isAdmin) return null;

  return (
    <div className="facturacion-contenedor">
      <h2 className="text-2xl font-bold text-blue-700 mb-4">Usuarios registrados</h2>
      <a href="/usuarios/registrar" className="text-blue-600 hover:underline mb-4 block">Registrar nuevo usuario</a>
      {loading ? (
        <p>Cargando...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <table className="w-full border border-blue-300 rounded-lg overflow-hidden shadow">
          <thead className="bg-blue-100">
            <tr>
              <th className="px-4 py-2 text-blue-700">ID</th>
              <th className="px-4 py-2 text-blue-700">Nombre</th>
              <th className="px-4 py-2 text-blue-700">Rol</th>
              <th className="px-4 py-2 text-blue-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u: Usuario) => (
              <tr key={u.id} className="hover:bg-blue-50">
                <td className="px-4 py-2 border-t border-blue-200">{u.id}</td>
                <td className="px-4 py-2 border-t border-blue-200">{u.nombre_usuario || u.nombre}</td>
                <td className="px-4 py-2 border-t border-blue-200">{u.rol_nombre || u.rol}</td>
                <td className="px-4 py-2 border-t border-blue-200">
                  <button
                    className="text-blue-600 hover:underline mr-2"
                    onClick={() => handleEdit(u)}
                  >Editar</button>
                  <button
                    className="text-red-600 hover:underline"
                    onClick={() => handleDeactivate(u)}
                  >Desactivar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
