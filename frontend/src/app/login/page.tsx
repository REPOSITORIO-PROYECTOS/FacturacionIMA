"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  // Aplicar tema guardado al cargar
  useEffect(() => {
    const tema = localStorage.getItem("tema");
    if (tema === "oscuro") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const formData = new URLSearchParams();
      formData.append("username", username);
      formData.append("password", password);
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem("token", data.access_token);
        router.push("/");
      } else {
        setError(data.detail || "Credenciales incorrectas");
      }
    } catch {
      setError("Error de conexión");
    }
  }

  return (
    <div className="login-bg">
      <div className="login-container">
        <h2 className="login-title">Iniciar sesión</h2>
        <form className="login-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Usuario"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="login-input"
            aria-label="Usuario"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="login-input"
            aria-label="Contraseña"
          />
          <button type="submit" className="login-btn">Entrar</button>
        </form>
        <button className="login-theme-btn" onClick={() => {
          const esOscuro = document.body.classList.toggle("dark-theme");
          localStorage.setItem("tema", esOscuro ? "oscuro" : "claro");
        }}>Cambiar tema</button>
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}
