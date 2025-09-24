export type Boleta = Record<string, string | number | boolean | undefined> & {
    "ID Ingresos"?: string | number;
    "INGRESOS"?: string | number;
    tabla?: string;
    total?: number | string;
    CUIT?: string | number;
    dni?: string | number;
    cuit?: string | number;
    cliente?: string;
    nombre?: string;
    "Razon Social"?: string;
    "Domicilio"?: string;
    condicion_iva?: string;
    "condicion-iva"?: string;
};
