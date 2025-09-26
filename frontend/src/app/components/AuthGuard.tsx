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
                // Redirect to login and preserve origin path
                router.replace(`/login?from=${encodeURIComponent(pathname)}`);
                return;
            }
            setChecked(true);
        } catch (err) {
            // If accessing localStorage fails, treat as unauthenticated
            router.replace(`/login?from=${encodeURIComponent(pathname ?? '/')}`);
        }
    }, [pathname, router]);

    // While we haven't validated auth, render nothing (prevents flicker)
    if (!checked) return null;
    return <>{children}</>;
}
