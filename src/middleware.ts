import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { verifyAdminToken } from '@/lib/admin-auth'

const nextAuth = NextAuth(authConfig)

// 인증이 필요한 경로들
const PROTECTED_PATHS = ['/my', '/community/write', '/onboarding']

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

  // ── 보호된 경로: 로그인 확인 ──
  if (PROTECTED_PATHS.some((p) => pathname.startsWith(p))) {
    const sessionToken =
      request.cookies.get('authjs.session-token')?.value ||
      request.cookies.get('__Secure-authjs.session-token')?.value
    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── 일반 라우트: NextAuth 미들웨어 ──
  return nextAuth.auth(request as never) as unknown as ReturnType<typeof NextResponse.next>
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|api/auth).*)'],
}
