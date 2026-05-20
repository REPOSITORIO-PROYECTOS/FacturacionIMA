import { getBackendServerBases } from "@/lib/backendUrl";

const basesUsrD = getBackendServerBases();

function buildTargets(username: string): string[] {
  const suffix = `usuarios/${username}/desactivar`;
  return basesUsrD.flatMap((baseUrl) => {
    const base = baseUrl.replace(/\/+$/, "");
    return [`${base}/${suffix}`, `${base}/api/${suffix}`];
  });
}

export async function POST(request: Request, context: any): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return new Response(JSON.stringify({ detail: "Token requerido" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const username = context?.params?.username ?? "";
  const targets = buildTargets(username);
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    try {
      const res = await fetch(target, { method: "POST", headers: { Authorization: auth } });
      const text = await res.text().catch(() => "");
      const trimmed = text.trim();
      if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
        if (i < targets.length - 1) continue;
        return new Response(JSON.stringify({ detail: "HTML inesperado", endpoint: target }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      let data: unknown = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (!res.ok && res.status === 404 && i < targets.length - 1) continue;
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      continue;
    }
  }

  return new Response(JSON.stringify({ detail: "Error de conexión usuarios (desactivar)" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
