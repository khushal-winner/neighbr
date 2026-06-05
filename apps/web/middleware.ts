import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/register', '/verify']

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const token = request.cookies.get('access_token')?.value

    const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))

    if (!token && !isPublic) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (token && (pathname === '/login' || pathname === '/register')) {
        return NextResponse.redirect(new URL('/feed', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, sitemap.xml, robots.txt (metadata files)
         * - all static files with extensions (e.g. logo.svg, logo-white.svg, etc.)
         */
        '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\..*).*)',
    ],
}