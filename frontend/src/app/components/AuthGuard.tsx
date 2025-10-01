"use client";
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        // When pathname is not yet available, wait
        if (!pathname) return;

        // Allow public routes
        const publicPrefixes = ['/login', '/api', '/_next', '/public'];
        if (publicPrefixes.some(p => pathname.startsWith(p))) {
            setChecked(true);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                router.replace(`/login?from=${encodeURIComponent(pathname)}`);
                return;
            }
            // Si falta user_info intentar recuperarlo vía /api/me (usa cookie HttpOnly)
            const existingInfo = localStorage.getItem('user_info');
            if (!existingInfo) {
                (async () => {
                    try {
                        const meRes = await fetch('/api/me', { cache: 'no-store' });
                        if (meRes.ok) {
                            const meData = await meRes.json().catch(() => null);
                            if (meData) {
                                const baseInfo: any = {
                                    username: meData.username || meData.user || meData.email || 'usuario',
                                    role: meData.role || meData.rol || 'Desconocido'
                                };
                                if (meData.empresa_nombre || meData.empresa) baseInfo.empresa_nombre = meData.empresa_nombre || meData.empresa;
                                if (meData.empresa_cuit) baseInfo.empresa_cuit = meData.empresa_cuit;
                                if (meData.empresa_id) baseInfo.empresa_id = meData.empresa_id;
                                localStorage.setItem('user_info', JSON.stringify(baseInfo));
                                try { window.dispatchEvent(new Event('user_info_changed')); } catch { }
                            }
                        }
                    } catch { /* silent */ }
                    setChecked(true);
                })();
            } else {
                setChecked(true);
            }
        } catch {
            router.replace(`/login?from=${encodeURIComponent(pathname ?? '/')}`);
        }
    }, [pathname, router]);

    // While we haven't validated auth, render nothing (prevents flicker)
    if (!checked) return null;
    return <>{children}</>;
}
