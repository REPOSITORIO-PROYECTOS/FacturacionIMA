"use client";
import { BoletasProvider } from "@/context/BoletasStore";
import NavbarVisible from "@/app/components/NavbarVisible";
import React from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <BoletasProvider>
            <div className="flex min-h-screen">
                <NavbarVisible />
                <main className="flex-1 p-4">{children}</main>
            </div>
        </BoletasProvider>
    );
}
