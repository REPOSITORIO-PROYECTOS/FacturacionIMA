"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UsuariosPage() {
  // --- Estado para modal de edición/creación ---
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUsuario, setModalUsuario] = useState<Usuario | null>(null);
  const [modalRol, setModalRol] = useState("");
  const [modalMode, setModalMode] = useState<'edit' | 'create'>("edit");

  function openEditModal(u: Usuario) {
    setModalUsuario(u);
    setModalRol(u.rol_nombre || u.rol || "Cajero");
    setModalMode("edit");
    setModalOpen(true);
  }
  function openCreateModal() {
    setModalUsuario(null);
    setModalRol("");
    setModalMode("create");
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setModalUsuario(null);
    setModalRol("");
  }
  function handleModalSave() {
    const token = localStorage.getItem("token");
    if (modalMode === "edit" && modalUsuario) {
      fetch(`/api/usuarios/${modalUsuario.nombre_usuario || modalUsuario.nombre}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rol_nombre: modalRol })
      })
        .then(res => res.ok ? res.json() : Promise.reject(res))
        .then(() => {
          alert("Usuario actualizado");
          window.location.reload();
        })
        .catch(() => alert("Error al actualizar usuario"));
    } else if (modalMode === "create") {
      const token = localStorage.getItem("token");
      const nombre_usuario = prompt("Nombre de usuario para el nuevo perfil:");
      if (!nombre_usuario) return alert("Debes ingresar un nombre de usuario");
      fetch(`/api/setup?action=create-user`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ nombre_usuario, password: "cambiame123", rol_nombre: modalRol || "Cajero" })
      })
        .then(res => res.ok ? res.json() : Promise.reject(res))
        .then(() => {
          alert("Usuario creado exitosamente. La contraseña inicial es 'cambiame123'.");
          window.location.reload();
        })
        .catch(() => alert("Error al crear usuario"));
      closeModal();
    }
  }
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
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition mb-4"
        onClick={openCreateModal}
      >Registrar nuevo usuario</button>
      {loading ? (
        <p>Cargando...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border border-blue-300 rounded-lg overflow-hidden shadow">
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
                  <td className="px-4 py-2 border-t border-blue-200 flex gap-2">
                    <button
                      className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition"
                      onClick={() => openEditModal(u)}
                    >Editar</button>
                    <button
                      className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition"
                      onClick={() => handleDeactivate(u)}
                    >Desactivar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Modal para editar/crear usuario */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">{modalMode === "edit" ? "Editar usuario" : "Crear usuario"}</h3>
            {modalUsuario && (
              <div className="mb-2 text-sm text-gray-700">Usuario: <span className="font-semibold">{modalUsuario.nombre_usuario || modalUsuario.nombre}</span></div>
            )}
            <div className="mb-4">
              <label className="block text-gray-700 mb-1">Rol</label>
              <input
                type="text"
                className="border px-3 py-2 rounded w-full"
                value={modalRol}
                onChange={e => setModalRol(e.target.value)}
                placeholder="Rol (Admin, Cajero, etc)"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                className="bg-gray-300 px-4 py-2 rounded hover:bg-gray-400"
                onClick={closeModal}
              >Cancelar</button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                onClick={handleModalSave}
              >Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
