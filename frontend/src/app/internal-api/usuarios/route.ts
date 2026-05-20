// Lista de usuarios con fallback multi-base y detección de HTML erróneo
import { getBackendServerBases, joinBackendUrl } from "@/lib/backendUrl";

const basesUsuarios = getBackendServerBases();

function join(base: string, path: string): string {
  return base.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
}

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const endpoints = basesUsuarios.flatMap((base) => [join(base, "usuarios/"), join(base, "api/usuarios/")]);
  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i];
    try {
      const res = await fetch(endpoint, { headers: { Authorization: auth } });
      const text = await res.text().catch(() => "");
      const trimmed = text.trim();
      if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
        if (i < endpoints.length - 1) continue;
        return new Response(JSON.stringify({ detail: "Respuesta HTML inesperada", endpoint }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      let parsed: unknown = [];
      try {
        parsed = text ? JSON.parse(text) : [];
      } catch {
        parsed = [];
      }
      if (res.ok && !Array.isArray(parsed)) {
        if (i < endpoints.length - 1) continue;
        return new Response(JSON.stringify({ detail: "Respuesta no es array", endpoint, tipo: typeof parsed }), {
          status: 206,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(parsed), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ detail: "Error de conexión usuarios" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const usernameRaw = body.username ?? body.nombre_usuario ?? "";
  const username = String(usernameRaw).trim();
  const password = String(body.password ?? body.pass ?? "");
  const rol = String(body.rol ?? body.rol_nombre ?? "Cajero");
  if (!username || !password) {
    return new Response(JSON.stringify({ detail: "username y password requeridos" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = { username, password, rol };
  const endpoints = basesUsuarios.flatMap((base) => [join(base, "usuarios/"), join(base, "api/usuarios/")]);
  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text().catch(() => "");
      const trimmed = text.trim();
      if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
        if (i < endpoints.length - 1) continue;
        return new Response(JSON.stringify({ detail: "Respuesta HTML inesperada", endpoint }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      let parsed: unknown = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { raw: text };
      }
      if (!res.ok && res.status === 404 && i < endpoints.length - 1) continue;
      return new Response(JSON.stringify(parsed), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ detail: "Error de conexión creando usuario" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
