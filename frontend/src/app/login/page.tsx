"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginPageInner() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("username") || "");
  const [password, setPassword] = useState(() => searchParams.get("password") || "");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const tema = localStorage.getItem("tema");
    if (tema === "oscuro") document.body.classList.add("dark-theme");
    else document.body.classList.remove("dark-theme");
    // Si ya hay token, redirigir automáticamente (evitar volver al login)
    const existing = localStorage.getItem('token');
    if (existing) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      router.replace(isMobile ? '/inicio' : '/dashboard');
    }
  }, [router]);

  // Si aterriza con query params (ej: ?username=admin&password=123), los mantenemos sincronizados sólo en primer render.
  useEffect(() => {
    const qUser = searchParams.get("username");
    const qPass = searchParams.get("password");
    if (qUser && !email) setEmail(qUser);
    if (qPass && !password) setPassword(qPass);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });
      let data: { access_token?: string; token_type?: string; detail?: string; user_info?: { username: string; role: string } } | null = null;
      try {
        data = await res.json();
      } catch {
        // no-op: allow fallback to text
      }

      if (!res.ok) {
        // Prefer structured message, fallback to plain text or generic
        const text = data?.detail || (typeof data === 'string' ? data : null) || (await res.text().catch(() => null));
        if (text && text.toLowerCase().includes('inactivo')) {
          setError('El usuario está inactivo. Contacte al administrador.');
        } else {
          setError(String(text || 'Credenciales incorrectas'));
        }
        return;
      }

      if (data && data.access_token) {
        // Guardar token inmediatamente
        localStorage.setItem("token", data.access_token);
        // Establecer cookie (si falla seguimos)
        try {
          document.cookie = `session_token=${encodeURIComponent(data.access_token)}; Path=/; Max-Age=28800; SameSite=Lax`;
        } catch { }

        // Obtener user_info enriquecido desde /api/me (incluye empresa y rol si backend lo expone)
        try {
          const meRes = await fetch('/api/me', { headers: { 'Cache-Control': 'no-store' } });
          if (meRes.ok) {
            const meData = await meRes.json().catch(() => null);
            if (meData) {
              // Normalizamos estructura mínima esperada
              const baseInfo: any = {
                username: meData.username || meData.user || meData.email || email,
                role: meData.role || meData.rol || data.user_info?.role || 'Desconocido',
              };
              if (meData.empresa_nombre || meData.empresa || meData.company_name) baseInfo.empresa_nombre = meData.empresa_nombre || meData.empresa || meData.company_name;
              if (meData.empresa_cuit || meData.cuit_empresa) baseInfo.empresa_cuit = meData.empresa_cuit || meData.cuit_empresa;
              if (meData.empresa_id) baseInfo.empresa_id = meData.empresa_id;
              localStorage.setItem('user_info', JSON.stringify(baseInfo));
              try { window.dispatchEvent(new Event('user_info_changed')); } catch { }
            }
          } else if (data.user_info) {
            // Fallback: usar user_info provisto en /auth/token si existe
            localStorage.setItem('user_info', JSON.stringify(data.user_info));
          }
        } catch {
          // Fallback a user_info del login si existe
          if (data.user_info) localStorage.setItem('user_info', JSON.stringify(data.user_info));
        }
        if (remember) localStorage.setItem("remember_user", email);

        // Redirección: si veníamos de ?from= y no es /login, usarla
        const from = searchParams.get('from');
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const fallback = isMobile ? '/inicio' : '/dashboard';
        const target = (from && from.startsWith('/') && !from.startsWith('/login')) ? from : fallback;
        // Pequeño delay para asegurar persistencia de user_info antes de navegar
        setTimeout(() => router.replace(target), 50);
      } else {
        // Mostrar un resumen del body recibido para facilitar diagnóstico en desarrollo
        const preview = data
          ? (typeof data === 'object' ? JSON.stringify(data) : String(data))
          : '';
        setError(`Respuesta inválida del servidor${preview ? ': ' + preview : ''}`);
      }
    } catch {
      setError("Error de conexión");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900">FacturacionIMA</h2>
          <p className="mt-2 text-sm text-gray-600">Inicie sesión en su cuenta</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Usuario
            </label>
            <input
              id="email"
              name="username"
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ingrese su usuario"
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ingrese su contraseña"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember"
                name="remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="remember" className="ml-2 block text-sm text-gray-900">
                Recordarme
              </label>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-md border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Iniciar Sesión
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 mt-2">
            ¿Olvidó su contraseña? Contacte con el administrador o soporte.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Cargando...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}