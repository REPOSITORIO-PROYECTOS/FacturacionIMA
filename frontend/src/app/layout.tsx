// 1. Importaciones agrupadas por tipo
import type { Metadata } from "next";
import { clsx } from "clsx"; // Utilidad para clases
import { geistMono, geistSans } from "./lib/fonts"; // Centralizamos las fuentes
import NavbarVisible from "./components/NavbarVisible";
import MainContent from "./components/MainContent";
import React from 'react';
import "./globals.css";
import { ToastProvider } from "./components/ToastProvider";

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
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
      </head>
      <body className={clsx(geistSans.variable, geistMono.variable, "antialiased")}>
        <ToastProvider>
          <div className="flex min-h-screen">
            <NavbarVisible />
            <MainContent>{children}</MainContent>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}