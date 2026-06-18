import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { signIn } from '@/lib/auth'
import { safeKakaoCallbackUrl } from '@/lib/kakao-start'

/**
 * 앱(Capacitor) 전용 카카오 로그인 시작 — 시스템 브라우저에서 호출된다.
 *  1) app_login 쿠키(앱 플로우 표식) set → bridge/auth-error가 딥링크 복귀 여부 판단
 *  2) 기존 NextAuth signIn('kakao') 트리거(남성차단·온보딩 콜백 그대로)
 *  3) OAuth 성공 후 redirectTo=/app-login/bridge → 거기서 handoff 토큰 발급
 *
 * 웹 /api/login/kakao는 그대로 유지(무변경). 본 라우트는 앱 전용.
 */
export async function GET(request: NextRequest) {
  const cb = safeKakaoCallbackUrl(request.nextUrl.searchParams.get('cb') ?? '/')

  const cookieStore = await cookies()
  cookieStore.set('app_login', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10, // 10분 — OAuth 왕복 동안만 유효
  })

  await signIn('kakao', { redirectTo: `/app-login/bridge?cb=${encodeURIComponent(cb)}` })

  // signIn은 위에서 redirect를 throw하므로 보통 아래에 도달하지 않는다(웹 라우트와 동일 패턴).
  return NextResponse.redirect(new URL('/login', request.url))
}
