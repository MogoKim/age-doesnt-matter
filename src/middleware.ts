import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { Redis } from '@upstash/redis'
import { verifyAdminToken } from '@/lib/admin-auth'
import { BOT_UA_PATTERN } from '@/lib/bot-patterns'

// 로그인이 필요한 경로
const PROTECTED_PATHS = ['/my', '/community/write']

// 아임웹 레거시 경로 → 현재 경로 매핑 (middleware 최상단 early return용)
const LEGACY_REDIRECTS: Record<string, string> = {
  '/Humor':      '/community/humor',
  '/Free-Board': '/community/stories',
  '/job':        '/jobs',
  '/blog':       '/magazine',
  '/write_1st':  '/community/write',
  '/write':      '/community/write',
}

// CUID 패턴: 소문자 알파벳+숫자 20~30자 (한글/하이픈 포함 slug와 겹치지 않음)
const CUID_PATTERN = /^[a-z0-9]{20,30}$/

// 비회원 익명 세션 쿠키 — EventLog.sessionId에 저장해 비회원 동선 추적
// 봇(크롤러/E2E/자동화)에는 발급하지 않아 세션 오염 방지
// maxAge 30일 슬라이딩 윈도우 — 방문마다 갱신해 "365일 = 1세션" 왜곡 방지
function addAnonSession(response: NextResponse, request: NextRequest): NextResponse {
  const ua = request.headers.get('user-agent') ?? ''
  if (request.headers.has('x-bot-type') || BOT_UA_PATTERN.test(ua)) return response

  const existingSid = request.cookies.get('_anon_sid')?.value
  response.cookies.set('_anon_sid', existingSid ?? crypto.randomUUID(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}

// Upstash Redis: Edge 인스턴스 간 공유 캐시 — Map 방식은 콜드스타트마다 초기화됨
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
const SLUG_REDIS_TTL_S = 86400   // 24시간 — slug는 생성 후 불변
const SLUG_REDIS_PREFIX = 'slug:'

async function resolveSlug(cuid: string): Promise<string | null> {
  const key = `${SLUG_REDIS_PREFIX}${cuid}`

  // 1. Redis 공유 캐시 조회
  try {
    const cached = await redis.get<string>(key)
    if (cached !== null && cached !== undefined) {
      return cached === '' ? null : cached  // '' = "slug 없음" sentinel
    }
  } catch {
    // Redis 장애 시 Supabase API로 fallback
  }

  // 2. Supabase REST API (캐시 miss 또는 Redis 장애 시)
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
    if (!res.ok) {
      redis.set(key, '', { ex: SLUG_REDIS_TTL_S }).catch(() => {})
      return null
    }
    const data = (await res.json()) as { slug: string }[]
    const slug = data[0]?.slug ?? null
    redis.set(key, slug ?? '', { ex: SLUG_REDIS_TTL_S }).catch(() => {})
    return slug
  } catch {
    return null
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 레거시 경로 즉시 301 (getToken/addAnonSession 실행 없음) ──
  for (const [src, dest] of Object.entries(LEGACY_REDIRECTS)) {
    if (pathname === src || pathname.startsWith(src + '/')) {
      return NextResponse.redirect(new URL(dest, request.url), { status: 301 })
    }
  }

  // ── /community 인덱스 → /community/stories (RSC redirect보다 먼저 처리) ──
  if (pathname === '/community') {
    return NextResponse.redirect(new URL('/community/stories', request.url), { status: 301 })
  }

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
        return addAnonSession(
          NextResponse.redirect(new URL(`/magazine/${slug}`, request.url), 301),
          request,
        )
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
        return addAnonSession(
          NextResponse.redirect(new URL(`/community/${communityMatch[1]}/${slug}`, request.url), 301),
          request,
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
      return addAnonSession(NextResponse.redirect(loginUrl), request)
    }
  }

  // ── 온보딩 리다이렉트: JWT에서 needsOnboarding 확인 ──
  // 세션 쿠키 없으면 getToken() (JWT 복호화) 자체를 skip — 비로그인 사용자 오버헤드 제거
  const hasSession =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token')
  const token = hasSession
    ? await getToken({
        req: request,
        secret: process.env.AUTH_SECRET,
        cookieName: request.cookies.has('__Secure-authjs.session-token')
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
      })
    : null

  if (token?.needsOnboarding && pathname !== '/onboarding') {
    const onboardingUrl = new URL('/onboarding', request.url)
    if (pathname !== '/' && pathname !== '/login') {
      onboardingUrl.searchParams.set('callbackUrl', pathname)
    }
    return addAnonSession(NextResponse.redirect(onboardingUrl), request)
  }

  // 비회원이 /onboarding 직접 접근 → 로그인으로
  if (!token && pathname === '/onboarding') {
    return addAnonSession(NextResponse.redirect(new URL('/login', request.url)), request)
  }

  if (!token?.needsOnboarding && token && pathname === '/onboarding') {
    return addAnonSession(NextResponse.redirect(new URL('/', request.url)), request)
  }

  // HTML 페이지 응답에는 Set-Cookie를 하지 않음 — Vercel CDN HTML 캐시 허용
  // _anon_sid는 /api/events POST 최초 호출 시 발급 (EventLog.sessionId 보존)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|api|robots.txt|sitemap.xml|manifest.json|\\.well-known).*)'],
}
