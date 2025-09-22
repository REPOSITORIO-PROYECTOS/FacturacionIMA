import React from "react";


export interface ComprobanteProps {
  tipo: string;
  numero: string;
  fecha: string;
  cliente: string;
  monto: number;
  cae: string;
  datosExtra?: Record<string, string | number>;
}

const ComprobantePrint: React.FC<ComprobanteProps> = ({ tipo, numero, fecha, cliente, monto, cae, datosExtra }) => {
  // Preparado para futura integración de QR (evita warning de variable no usada)
  const qrValue = `CAE:${cae}|Nro:${numero}|Tipo:${tipo}|Monto:${monto}`;
  return (
    <div className="comprobante-print" data-qr={qrValue}>
      <h2 className="comprobante-titulo">Comprobante {tipo}</h2>
      <div className="comprobante-datos">
        <p><b>Número:</b> {numero}</p>
        <p><b>Fecha:</b> {fecha}</p>
        <p><b>Cliente:</b> {cliente}</p>
        <p><b>Monto:</b> ${monto.toFixed(2)}</p>
        <p><b>CAE:</b> {cae}</p>
        {datosExtra && Object.entries(datosExtra).map(([k, v]) => (
          <p key={k}><b>{k}:</b> {v}</p>
        ))}
      </div>
      <div className="comprobante-qr">
        <p className="comprobante-qr-label">Escanee para validar el comprobante</p>
      </div>
      <button className="comprobante-print-btn" onClick={() => window.print()}>Imprimir</button>
    </div>
  );
};

export default ComprobantePrint;
