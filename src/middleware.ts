import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { verifyAdminToken } from '@/lib/admin-auth'

// 로그인이 필요한 경로
const PROTECTED_PATHS = ['/my', '/community/write']

// CUID 패턴: 소문자 알파벳+숫자 20~30자 (한글/하이픈 포함 slug와 겹치지 않음)
const CUID_PATTERN = /^[a-z0-9]{20,30}$/

/**
 * CUID로 Supabase REST API에서 slug 조회
 * Edge Runtime에서 Prisma 사용 불가 → fetch() 직접 사용
 * 실패 시 null 반환 → middleware 통과 (RSC redirect가 fallback)
 */
async function resolveSlug(cuid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/Post` +
        `?select=slug&id=eq.${cuid}&slug=not.is.null&limit=1`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { slug: string }[]
    return data[0]?.slug ?? null
  } catch {
    return null
  }
}

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

  // ── Magazine CUID → slug 308 redirect ──
  // server component의 permanentRedirect()는 streaming 이후 RSC redirect로 처리됨 (HTTP 308 아님)
  // Middleware는 렌더링 전에 실행되므로 진짜 HTTP 308을 보낼 수 있음
  if (pathname.startsWith('/magazine/')) {
    const raw = pathname.slice('/magazine/'.length).split('/')[0]
    const segment = decodeURIComponent(raw)
    if (CUID_PATTERN.test(segment)) {
      const slug = await resolveSlug(segment)
      if (slug) {
        return NextResponse.redirect(new URL(`/magazine/${slug}`, request.url), 308)
      }
    }
  }

  // ── Community CUID → slug 308 redirect ──
  const communityMatch = pathname.match(/^\/community\/([^/]+)\/([^/]+)$/)
  if (communityMatch) {
    const decoded = decodeURIComponent(communityMatch[2])
    if (CUID_PATTERN.test(decoded)) {
      const slug = await resolveSlug(decoded)
      if (slug) {
        return NextResponse.redirect(
          new URL(`/community/${communityMatch[1]}/${slug}`, request.url),
          308,
        )
      }
    }
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
    const onboardingUrl = new URL('/onboarding', request.url)
    if (pathname !== '/' && pathname !== '/login') {
      onboardingUrl.searchParams.set('callbackUrl', pathname)
    }
    return NextResponse.redirect(onboardingUrl)
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
