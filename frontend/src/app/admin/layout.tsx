"use client";
import NavbarVisible from "@/app/components/NavbarVisible";
import React from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen">
            <NavbarVisible />
            <main className="flex-1 p-4">{children}</main>
        </div>
    );
}
