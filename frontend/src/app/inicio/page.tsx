"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InicioPage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.replace('/login');
            return;
        }
        setReady(true);
    }, [router]);

    if (!ready) return <div className="p-6">Cargando...</div>;

    const cards = [
        { href: '/boletas/mobile', label: 'Boletas (Móvil)', desc: 'Vista rápida', icon: '📱' },
        { href: '/boletas/no-facturadas', label: 'No Facturadas', desc: 'Pendientes', icon: '🧾' },
        { href: '/boletas/facturadas', label: 'Facturadas', desc: 'Histórico', icon: '📑' },
        { href: '/dashboard?accion=facturar', label: 'Facturar Selección', desc: 'Acceso rápido', icon: '⚡' },
        { href: '/usuarios', label: 'Usuarios', desc: 'Gestión', icon: '👥' },
        { href: '/perfil', label: 'Perfil / AFIP', desc: 'Configurar datos', icon: '⚙️' },
    ];

    return (
        <div className="w-full p-4 md:p-8 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-purple-700">Inicio</h1>
                <p className="text-sm text-gray-500 mt-1">Accesos rápidos</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {cards.map(c => (
                    <Link key={c.href} href={c.href} className="group rounded-lg shadow bg-white p-4 flex flex-col items-start gap-2 border border-gray-200 hover:border-purple-400 hover:shadow-md transition-colors">
                        <span className="text-2xl" aria-hidden>{c.icon}</span>
                        <span className="text-sm font-semibold text-gray-800 group-hover:text-purple-700">{c.label}</span>
                        <span className="text-xs text-gray-500">{c.desc}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
