import { NextResponse, NextRequest } from 'next/server';

// Rutas públicas que no requieren autenticación
const publicPaths: string[] = [
    '/login',
    '/api',
    '/internal-api',
    '/favicon.ico',
    '/inicio'
];

function isPublic(pathname: string) {
    return publicPaths.some(p => pathname === p || pathname.startsWith(p + '/'));
}

/** Origin público detrás de Nginx (req.nextUrl usa localhost:3001 en el servidor). */
function getPublicOrigin(req: NextRequest): string {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    const host =
        req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
        req.headers.get('host')?.split(',')[0]?.trim() ||
        req.nextUrl.host;
    return `${proto}://${host}`;
}

export function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    if (isPublic(pathname)) return NextResponse.next();

    const session = req.cookies.get('session_token');
    if (!session) {
        const loginUrl = new URL('/login', getPublicOrigin(req));
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
