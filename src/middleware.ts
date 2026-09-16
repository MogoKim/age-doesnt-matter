import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { Redis } from '@upstash/redis'
import { verifyAdminToken } from '@/lib/admin-auth'
import { BOT_UA_PATTERN } from '@/lib/bot-patterns'
import { isDevRoute, isDevRouteAllowed } from '@/lib/dev-routes'
import { getMovedPostRedirect } from '@/lib/moved-posts'
import { resolveCommunityCanonicalPath } from '@/lib/community-canonical'
import { buildReturnTo } from '@/lib/return-to'

/**
 * 로그인이 필요한 경로.
 *
 * 글쓰기(/community/write)는 여기 없다 — 비회원도 폼을 열고 글을 쓸 수 있어야 한다.
 * 로그인 장벽을 "글을 쓰기 전"이 아니라 "등록을 누를 때"로 옮겼기 때문이다.
 * 실제 차단은 그대로 서버에 있다: createPost가 첫 줄에서 세션을 확인하고,
 * 글 수정(/community/[board]/[postId]/edit)은 자체 auth + 작성자 확인을 한다.
 * 즉 폼이 열리는 것과 글이 저장되는 것은 다른 문제이고, 막아야 하는 쪽은 저장이다.
 */
const PROTECTED_PATHS = ['/my']

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
          // RLS 적용(2026-06-10) 후 anon은 차단됨 → 서버 전용 service_role로 slug read만 (Edge 서버 코드, 키 노출 없음)
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
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

const BOARD_REDIS_TTL_S = 86400  // 24시간 — 글의 보드는 거의 바뀌지 않고, 바뀌면 옛 URL 이 하루 안에 정본으로 수렴한다
/**
 * "그런 slug 없음"은 **짧게만** 기억한다.
 * 방금 발행된 글이 24시간 동안 "없는 글"로 캐시되면 그동안 정본 교정이 죽는다.
 */
const BOARD_NEGATIVE_TTL_S = 300
const BOARD_REDIS_PREFIX = 'board:'

/**
 * slug 로 글의 **정본 보드 타입**을 찾는다. `resolveSlug` 와 같은 2단 구조(Redis → Supabase REST).
 *
 * 왜 middleware 인가: 상세 라우트가 `dynamic = 'force-static'` 이라
 * `generateMetadata` 안의 `permanentRedirect()` 가 정적 생성 중 redirect 가 되어 **HTTP 500** 이 난다
 * (2026-09-16 production 실측 9/9, `x-matched-path: /500`). middleware 는 렌더 전에 돌기 때문에
 * 진짜 HTTP 308 을 보낼 수 있다 — CUID→slug 교정이 이미 같은 이유로 여기 있다.
 *
 * 실패하면 `null` 을 돌려주고 **조용히 통과**시킨다. 그 경우 페이지가 200 으로 렌더되며
 * 정본 canonical 을 달아 중복 신호를 정리한다(500 보다 낫다).
 */
async function resolveBoardType(slug: string): Promise<string | null> {
  const key = `${BOARD_REDIS_PREFIX}${slug}`
  try {
    const cached = await redis.get<string>(key)
    if (cached !== null && cached !== undefined) return cached === '' ? null : cached
  } catch {
    // Redis 장애 → REST fallback
  }
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/Post` +
        `?select=boardType&slug=eq.${encodeURIComponent(slug)}&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
      },
    )
    // 🔴 전송 실패(401·5xx·네트워크)는 **캐시하지 않는다.**
    //    한 번의 일시 장애를 '없는 글'로 24시간 굳히면 그동안 정본 교정이 통째로 죽는다.
    //    (2026-09-16 Preview 실측에서 실제로 이 함정을 밟았다 — 첫 요청 실패가 캐시돼
    //     이후 요청이 REST 를 시도조차 하지 않았다.)
    if (!res.ok) return null

    const data = (await res.json()) as { boardType: string }[]
    const boardType = data[0]?.boardType ?? null
    // 조회가 **성공**했을 때만 캐시한다. 없음(null)은 짧게만 기억한다.
    redis
      .set(key, boardType ?? '', { ex: boardType ? BOARD_REDIS_TTL_S : BOARD_NEGATIVE_TTL_S })
      .catch(() => {})
    return boardType
  } catch {
    return null
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── `/dev/*` 는 production 에 존재하지 않는다 ──
  // 배경·환경 행렬·왜 noindex 로는 안 되는지는 `src/lib/dev-routes.ts` 에 있다(여기서 반복하지 않는다).
  // 여기서 막는 이유만 남긴다: 렌더링·인증·Redis **이전**이라 차단 요청이 DB 를 건드리지 않는다.
  if (isDevRoute(pathname) && !isDevRouteAllowed()) {
    return new NextResponse(null, { status: 404 })
  }

  // ── 구 아임웹 레거시 "개별 글/검색결과" URL → 410 Gone (legacy imweb parameter URLs only) ──
  // 대상: /Humor·/Free-Board·/blog·/job·/magazine 경로 + query에 idx 또는 bmode 또는 q 존재.
  // 예: /Humor/?idx=164815302 · /magazine/?idx=167023913&bmode=view · /Free-Board/?q=...(검색결과)
  // 이유: 아임웹 idx→새 글 매핑이 DB에 없어 복구 불가 → 목록 301(soft-404) 대신 410으로 명확히 폐기(크롤버짓 회수).
  // 범위 제한: 파라미터 없는 맨-경로·정상 /community/*·/magazine 목록·글 상세·www→apex·CUID→slug·sitemap 무영향.
  // (next.config redirects가 이 경로들의 param URL을 missing 가드로 양보 → 여기 410 도달)
  const LEGACY_IMWEB_PREFIXES = ['/Humor', '/Free-Board', '/blog', '/job', '/magazine']
  const sp = request.nextUrl.searchParams
  const hasLegacyParam = sp.has('idx') || sp.has('bmode') || sp.has('q')
  if (hasLegacyParam && LEGACY_IMWEB_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return new NextResponse(null, { status: 410 })
  }

  // ── 레거시 경로 즉시 301 (getToken/addAnonSession 실행 없음) ──
  for (const [src, dest] of Object.entries(LEGACY_REDIRECTS)) {
    if (pathname === src || pathname.startsWith(src + '/')) {
      return NextResponse.redirect(new URL(dest, request.url), { status: 301 })
    }
  }

  // ── 갱년기톡 이동 글 정본 HTTP 308 (PR-M1) — moved-posts 확정 30건, GSC 안정화 후 맵 제거 가능 ──
  // CUID URL은 맵에 없음(의도) — PR-M0 상세 라우트 가드가 정본으로 수렴시킨다.
  const movedDest = getMovedPostRedirect(pathname)
  if (movedDest) {
    return NextResponse.redirect(new URL(movedDest, request.url), { status: 308 })
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

  // ── 커뮤니티 상세: 정본 **보드** 교정 308 (Batch A) ──
  // 글을 다른 보드로 옮기면 옛 보드 URL 이 그대로 200 을 내 같은 글이 두 주소로 존재했다.
  // 상세 라우트에서 교정하려던 `permanentRedirect()` 는 force-static 정적 생성과 충돌해
  // **HTTP 500** 을 냈다(2026-09-16 실측). 그래서 렌더 전 여기서 진짜 308 을 보낸다.
  //
  // 비용: 커뮤니티 상세 요청마다 Redis GET 1회(캐시 적중 시). 24시간 TTL 이라
  // 같은 글의 두 번째 요청부터는 REST 왕복이 없다. 실패는 전부 통과(fail-open)다.
  if (communityMatch) {
    const urlBoardSlug = communityMatch[1]
    const segment = decodeURIComponent(communityMatch[2])
    // CUID 는 위 블록이 이미 처리했다(거기서 못 풀면 여기서도 못 푼다)
    if (!CUID_PATTERN.test(segment)) {
      const boardType = await resolveBoardType(segment)
      // TEMP-PROBE(Batch A, 머지 전 제거): `?__probe=1` 일 때만 조회 결과를 헤더로 노출한다.
      // Preview 에서 308 이 안 나오는 원인이 조회 실패인지 판정 실패인지 가르기 위한 일회용 계측.
      if (request.nextUrl.searchParams.get('__probe') === '1') {
        const probe = NextResponse.next()
        probe.headers.set('x-probe-segment-len', String(segment.length))
        probe.headers.set('x-probe-board-type', boardType ?? 'NULL')
        probe.headers.set('x-probe-url-board', urlBoardSlug)
        probe.headers.set('x-probe-has-supabase-url', process.env.NEXT_PUBLIC_SUPABASE_URL ? '1' : '0')
        probe.headers.set('x-probe-has-service-key', process.env.SUPABASE_SERVICE_ROLE_KEY ? '1' : '0')
        probe.headers.set('x-probe-canonical', String(resolveCommunityCanonicalPath({
          boardSlug: urlBoardSlug, postId: segment, post: { boardType: boardType ?? 'UNKNOWN', slug: segment },
        })))
        return probe
      }
      if (boardType) {
        // slug 는 URL 세그먼트 그대로다 → `resolveCommunityCanonicalPath` 는 보드만 비교한다
        const canonicalPath = resolveCommunityCanonicalPath({
          boardSlug: urlBoardSlug,
          postId: segment,
          post: { boardType, slug: segment },
        })
        if (canonicalPath) {
          // `new URL` 이 한글 세그먼트를 percent-encode 한다 → Location 헤더가 ASCII 로 나간다
          return addAnonSession(
            NextResponse.redirect(new URL(canonicalPath, request.url), 308),
            request,
          )
        }
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
      // pathname만 넘기면 ?board=stories 같은 값이 사라져 로그인 후 다른 화면으로 떨어진다
      const returnTo = buildReturnTo(pathname, request.nextUrl.search)
      if (returnTo) loginUrl.searchParams.set('callbackUrl', returnTo)
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
    // 신규 가입자는 로그인 직후 여기를 한 번 더 거친다 — 여기서도 쿼리를 지키지 않으면
    // 로그인 리다이렉트에서 살려온 값이 결국 사라진다
    const returnTo = buildReturnTo(pathname, request.nextUrl.search)
    if (returnTo && pathname !== '/' && pathname !== '/login') {
      onboardingUrl.searchParams.set('callbackUrl', returnTo)
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
