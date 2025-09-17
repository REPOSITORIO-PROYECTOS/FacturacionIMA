// 1. Importaciones agrupadas por tipo
import type { Metadata } from "next";
import { clsx } from "clsx"; // Utilidad para clases
import { geistMono, geistSans } from "./lib/fonts"; // Centralizamos las fuentes
import NavbarVisible from "./components/NavbarVisible";
import "./globals.css";

// 2. Metadatos significativos y específicos del proyecto
export const metadata: Metadata = {
  title: "Facturador IMA",
  description: "Sistema de gestión y facturación para la empresa IMA.",
};

// 3. Tipos de props más limpios
type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      {/* 4. Gestión de clases más limpia y escalable con clsx */}
      <body
        className={clsx(
          geistSans.variable,
          geistMono.variable,
          "antialiased"
        )}
      >
        <div className="flex min-h-screen">
          <NavbarVisible />
          <main className="flex-1 bg-gray-50">{children}</main>
        </div>
      </body>
    </html>
  );
}