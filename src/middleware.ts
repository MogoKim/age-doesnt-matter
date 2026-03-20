import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { verifyAdminToken } from '@/lib/admin-auth'

const nextAuth = NextAuth(authConfig)

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 어드민 라우트 처리 ──
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      return NextResponse.next()
    }

    const token = request.cookies.get('admin-token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const admin = await verifyAdminToken(token)
    if (!admin) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    return NextResponse.next()
  }

  // ── 일반 라우트: NextAuth 미들웨어 ──
  return nextAuth.auth(request as never) as unknown as ReturnType<typeof NextResponse.next>
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
