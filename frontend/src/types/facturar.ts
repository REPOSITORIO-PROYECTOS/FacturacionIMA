// Tipos alineados con el backend (backend/app/blueprints/facturador.py)
// El endpoint /facturador/facturar-por-cantidad recibe UNA LISTA de InvoiceItemPayload
// y devuelve una LISTA de resultados (uno por ítem) con status SUCCESS / FAILED.

export interface ClienteDataPayload {
  cuit_o_dni: string; // '0' para Consumidor Final
  nombre_razon_social?: string | null;
  domicilio?: string | null;
  condicion_iva: string; // Ej: CONSUMIDOR_FINAL, RESPONSABLE_INSCRIPTO, MONOTRIBUTO
}

export interface InvoiceItemPayload {
  id?: string;                  // Identificador interno de la boleta / ingreso
  total: number;                // Monto total > 0
  cliente_data: ClienteDataPayload; // Datos del receptor
  emisor_cuit?: string;         // Override opcional del CUIT emisor
  tipo_forzado?: number;        // 1=A, 6=B, 11=C (override tipo comprobante)
}

// Petición: lista de invoices
export type FacturarRequest = InvoiceItemPayload[];

// Resultado individual devuelto por el backend; es flexible, por eso index signature
export interface FacturarItemResult {
  id?: string;
  status: 'SUCCESS' | 'FAILED';
  result?: any;     // Datos AFIP cuando SUCCESS
  error?: string;   // Mensaje de error cuando FAILED
  [k: string]: any; // Campos adicionales (qr_code, tipo_mismatch, etc.)
}

// Respuesta total = array de resultados
export type FacturarResponse = FacturarItemResult[];

// --- Compatibilidad retro (DEPRECADO) ---
// Se mantiene la vieja interfaz para evitar romper imports existentes.
// NO USAR en nuevo código.
export interface FacturarPayloadDeprecated {
  cantidad: number;
  fecha: string;
  boleta_ids: number[];
  usuario_id: number;
}
