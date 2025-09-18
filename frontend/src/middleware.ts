import { NextResponse, NextRequest } from 'next/server';

// Rutas públicas que no requieren autenticación
const publicPaths: string[] = [
    '/login',
    '/api/auth',
    '/favicon.ico',
    '/inicio'
];

function isPublic(pathname: string) {
    return publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    if (isPublic(pathname)) return NextResponse.next();

    const session = req.cookies.get('session_token');
    if (!session) {
        const loginUrl = req.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('from', pathname);
        return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)'
    ]
};
