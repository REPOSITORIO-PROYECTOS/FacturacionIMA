// Tipos para las variables usadas en facturación

export interface FacturarPayload {
  cantidad: number;
  fecha: string;
  boleta_ids: number[];
  usuario_id: number;
  // Agrega aquí cualquier otra variable que siempre se use en facturación
}

export interface FacturarResponse {
  success: boolean;
  mensaje?: string;
  errores?: string[];
  // Puedes agregar más campos según la respuesta del backend
}
