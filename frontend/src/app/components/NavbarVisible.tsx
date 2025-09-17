"use client";
import { usePathname } from "next/navigation";
import Navbar from "./Navbar";

export default function NavbarVisible() {
    const pathname = usePathname();
    // Ocultar navbar en página de login (y potencialmente futuras variantes /login/*)
    if (pathname === "/login" || pathname.startsWith("/login/")) {
        return null;
    }
    return <Navbar />;
}
