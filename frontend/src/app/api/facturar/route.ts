// Proxy robusto para facturación batch alineado con backend.
// Acepta una LISTA de InvoiceItemPayload y la reenvía a /facturador/facturar-por-cantidad.
// Implementa estrategia multi-base + detección de HTML (misconfiguración) y evita recursión.

import type { FacturarRequest, FacturarResponse, InvoiceItemPayload } from "../../types/facturar";

const envBase = process.env.NEXT_PUBLIC_BACKEND_URL || '';
const internalOverride = process.env.BACKEND_INTERNAL_URL || '';
const localFallback = internalOverride || 'http://127.0.0.1:8008';

function sanitizeBase(u: string): string { return u.replace(/\/$/, ''); }

export async function POST(request: Request): Promise<Response> {
  const token = request.headers.get('authorization')?.split(' ')[1];
  if (!token) {
    return new Response(JSON.stringify({ detail: 'Token requerido' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (request.headers.get('x-forwarded-facturar')) {
    return new Response(JSON.stringify({ detail: 'Recursión detectada en proxy /api/facturar' }), { status: 508, headers: { 'Content-Type': 'application/json' } });
  }

  let bodyRaw: unknown;
  try { bodyRaw = await request.json(); } catch { bodyRaw = null; }

  // Normalizar: admitir que el cliente envíe un solo objeto (legacy) y lo convertimos en array.
  let payload: FacturarRequest;
  if (Array.isArray(bodyRaw)) {
    payload = bodyRaw as FacturarRequest;
  } else if (bodyRaw && typeof bodyRaw === 'object') {
    // Intentar detectar si es un payload antiguo (tiene boleta_ids) -> transformar.
    const legacy = bodyRaw as any;
    if (Array.isArray(legacy.boleta_ids)) {
      payload = legacy.boleta_ids.map((id: number | string) => ({
        id: String(id),
        total: typeof legacy.total === 'number' ? legacy.total : (legacy.monto ?? 0),
        cliente_data: legacy.cliente_data || {
          cuit_o_dni: legacy.cuit || legacy.cuit_o_dni || '0',
          nombre_razon_social: legacy.razon_social || legacy.nombre_razon_social || '',
          domicilio: legacy.domicilio || '',
          condicion_iva: legacy.condicion_iva || 'CONSUMIDOR_FINAL'
        }
      })) as FacturarRequest;
    } else {
      payload = [legacy as InvoiceItemPayload];
    }
  } else {
    return new Response(JSON.stringify({ detail: 'JSON inválido o vacío' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Validación mínima local antes de disparar requests
  const invalid = payload.findIndex(p => !p || typeof p.total !== 'number' || !(p.total > 0) || !p.cliente_data || !p.cliente_data.cuit_o_dni || !p.cliente_data.condicion_iva);
  if (invalid >= 0) {
    return new Response(JSON.stringify({ detail: 'Payload inválido', index: invalid }), { status: 422, headers: { 'Content-Type': 'application/json' } });
  }

  const incomingHost = (() => { try { return new URL(request.url).host; } catch { return ''; } })();
  const bases: string[] = [];
  const sanitizedEnv = sanitizeBase(envBase);
  if (sanitizedEnv) bases.push(sanitizedEnv);
  if (!bases.includes(localFallback)) bases.push(localFallback);

  const endpointFor = (base: string) => `${sanitizeBase(base)}/facturador/facturar-por-cantidad`;

  for (let i = 0; i < bases.length; i++) {
    let base = sanitizeBase(bases[i]);
    try {
      const h = new URL(base).host;
      if (h === incomingHost && !internalOverride) {
        console.warn(`[api/facturar] Saltando base ${base} (mismo host ${incomingHost}) para evitar recursión. Configure BACKEND_INTERNAL_URL.`);
        continue;
      }
    } catch { /* ignore */ }
    const endpoint = endpointFor(base);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Forwarded-Facturar': '1' },
        body: JSON.stringify(payload)
      });
      let text = '';
      try { text = await response.text(); } catch { text = ''; }
      const trimmed = text.trim();
      // Detección HTML -> posible recursión / URL mal configurada
      if (/^<!DOCTYPE|<html[\s>]/i.test(trimmed)) {
        console.warn(`[api/facturar] Respuesta HTML inesperada en ${endpoint}. Intento ${i + 1}/${bases.length}.`);
        if (i < bases.length - 1) continue;
        return new Response(JSON.stringify({ detalle: 'Respuesta HTML inesperada', endpoint, hint: 'Revisar NEXT_PUBLIC_BACKEND_URL o definir BACKEND_INTERNAL_URL', preview: trimmed.slice(0, 180) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
      let parsed: unknown;
      try { parsed = trimmed ? JSON.parse(trimmed) : []; } catch { parsed = []; }

      if (response.ok && !Array.isArray(parsed)) {
        // Si el backend devolvió algo que no es array, intentar siguiente base
        if (i < bases.length - 1) {
          console.warn(`[api/facturar] Respuesta no-array en ${endpoint} (se esperaba lista). Probando siguiente base...`);
          continue;
        }
        return new Response(JSON.stringify({ detalle: 'Respuesta no es array', endpoint, tipo: typeof parsed }), { status: 206, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(parsed as FacturarResponse), { status: response.status, headers: { 'Content-Type': 'application/json' } });
    } catch (e: unknown) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as any).message) : String(e);
      console.error(`[api/facturar] Error consultando ${endpoint}: ${msg}`);
      continue;
    }
  }
  return new Response(JSON.stringify({ detail: 'Error de conexión' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
