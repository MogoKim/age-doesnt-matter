import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { verifyAdminToken } from '@/lib/admin-auth'

// 로그인이 필요한 경로
const PROTECTED_PATHS = ['/my', '/community/write']

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 어드민 라우트 처리 ──
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      return NextResponse.next()
    }

    const adminToken = request.cookies.get('admin-token')?.value
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    const admin = await verifyAdminToken(adminToken)
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

  // ── 온보딩 리다이렉트: JWT에서 needsOnboarding 확인 ──
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: request.cookies.has('__Secure-authjs.session-token')
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token',
  })

  if (token?.needsOnboarding && pathname !== '/onboarding') {
    return NextResponse.redirect(new URL('/onboarding', request.url))
  }

  // 비회원이 /onboarding 직접 접근 → 로그인으로
  if (!token && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!token?.needsOnboarding && token && pathname === '/onboarding') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|api).*)'],
}
