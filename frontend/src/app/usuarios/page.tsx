"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UsuariosPage() {
  // --- Estado para modal de edición/creación ---
  const [modalOpen, setModalOpen] = useState(false);
  const [modalUsuario, setModalUsuario] = useState<Usuario | null>(null);
  const [modalRol, setModalRol] = useState("");
  const [modalNombre, setModalNombre] = useState("");
  const [modalPassword, setModalPassword] = useState("");
  const [modalMode, setModalMode] = useState<'edit' | 'create'>("edit");
  const rolesDisponibles = ["Admin", "Cajero", "Gerente", "Soporte"]; // Se podría cargar dinámico en futuro

  function openEditModal(u: Usuario) {
    setModalUsuario(u);
    setModalRol(u.rol_nombre || u.rol || "Cajero");
    setModalNombre(u.nombre_usuario || u.nombre || "");
    setModalPassword("");
    setModalMode("edit");
    setModalOpen(true);
  }
  function openCreateModal() {
    setModalUsuario(null);
    setModalRol("Cajero");
    setModalNombre("");
    setModalPassword("");
    setModalMode("create");
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setModalUsuario(null);
    setModalRol("");
    setModalNombre("");
    setModalPassword("");
  }
  type UpdateUsuarioPayload = { rol_nombre?: string; password?: string; activo?: boolean };
  function handleModalSave() {
    const token = localStorage.getItem("token");
    if (modalMode === "edit" && modalUsuario) {
      const username = modalUsuario.nombre_usuario || modalUsuario.nombre;
      const body: UpdateUsuarioPayload = { rol_nombre: modalRol };
      if (modalPassword) body.password = modalPassword; // si desea resetear contraseña
      fetch(`/api/usuarios/${username}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      })
        .then(res => res.ok ? res.json() : Promise.reject(res))
        .then(() => {
          alert("Usuario actualizado");
          window.location.reload();
        })
        .catch(() => alert("Error al actualizar usuario"));
    } else if (modalMode === "create") {
      const token = localStorage.getItem("token");
      const nombre_usuario = (modalNombre || "").trim();
      if (!nombre_usuario) { alert("Debes ingresar un nombre de usuario"); return; }
      const password = (modalPassword || "").trim();
      if (!password) { alert("Debes ingresar una contraseña"); return; }
      if (!modalRol) { alert("Selecciona un rol"); return; }
      fetch(`/api/usuarios`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username: nombre_usuario, password, rol: modalRol })
      })
        .then(res => res.ok ? res.json() : res.json().then(j => Promise.reject(j)))
        .then(() => {
          alert("Usuario creado exitosamente.");
          window.location.reload();
        })
        .catch((err) => alert("Error al crear usuario: " + (err?.detail || "")));
    }
  }
  // --- Funciones para desactivar ---

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
  function handleReactivate(u: Usuario) {
    if (!window.confirm(`¿Reactivar usuario ${u.nombre_usuario || u.nombre}?`)) return;
    const token = localStorage.getItem("token");
    fetch(`/api/usuarios/${u.nombre_usuario || u.nombre}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ activo: true })
    })
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(() => {
        alert("Usuario reactivado");
        window.location.reload();
      })
      .catch(() => alert("Error al reactivar usuario"));
  }
  const router = useRouter();
  type Usuario = {
    id: number | string;
    nombre_usuario?: string;
    nombre?: string;
    rol_nombre?: string;
    rol?: string;
    activo?: boolean | number;
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
      >Crear usuario</button>
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
                <th className="px-4 py-2 text-blue-700">Usuario</th>
                <th className="px-4 py-2 text-blue-700">Rol</th>
                <th className="px-4 py-2 text-blue-700">Estado</th>
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
                    {(u.activo ? 1 : 0) === 1 ? (
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Activo</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 border-t border-blue-200 flex gap-2">
                    <button
                      className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition"
                      onClick={() => openEditModal(u)}
                    >Editar</button>
                    {(u.activo ? 1 : 0) === 1 ? (
                      <button
                        className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition"
                        onClick={() => handleDeactivate(u)}
                      >Desactivar</button>
                    ) : (
                      <button
                        className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition"
                        onClick={() => handleReactivate(u)}
                      >Reactivar</button>
                    )}
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
            <div className="space-y-3">
              <div>
                <label className="block text-gray-700 mb-1">Nombre de usuario</label>
                <label className="block text-gray-700 mb-1">Nombre de usuario *</label>
                <label className="block text-gray-700 mb-1">Contrase f1a {modalMode === 'edit' ? "(opcional)" : "*"}</label>
                <input
                  type="text"
                  className="border px-3 py-2 rounded w-full"
                  value={modalNombre}
                  onChange={e => setModalNombre(e.target.value)}
                  placeholder="usuario"
                  disabled={modalMode === 'edit'}
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Contraseña {modalMode === 'edit' ? "(opcional)" : ""}</label>
                <input
                  type="password"
                  className="border px-3 py-2 rounded w-full"
                  value={modalPassword}
                  onChange={e => setModalPassword(e.target.value)}
                  placeholder={modalMode === 'edit' ? "Dejar vacío para no cambiar" : "Contraseña inicial"}
                />
              </div>
              <div>
                <label htmlFor="modalRolSelect" className="block text-gray-700 mb-1">Rol</label>
                <label htmlFor="modalRolSelect" className="block text-gray-700 mb-1">Rol *</label>
                <select
                  id="modalRolSelect"
                  className="border px-3 py-2 rounded w-full"
                  value={modalRol}
                  onChange={e => setModalRol(e.target.value)}
                >
                  <option value="" disabled>Selecciona un rol…</option>
                  {rolesDisponibles.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
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
