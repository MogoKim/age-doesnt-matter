import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { issueHandoffToken } from '@/lib/app-handoff'
import { safeKakaoCallbackUrl } from '@/lib/kakao-start'

/** 앱 딥링크 스킴 (custom scheme — Day2). App Links는 production 안정화 단계에서 보강. */
const DEEPLINK = 'com.agenotmatter.app://auth'

/**
 * 시스템 브라우저 OAuth 성공 후 도달점. 현재 세션(auth())을 handoff 토큰으로 만들어
 * 딥링크로 앱 WebView에 넘긴다. (남성차단/예외는 여기 도달 전 /auth/error로 빠짐 → auth-error에서 딥링크 처리)
 */
export async function GET(request: NextRequest) {
  const cb = safeKakaoCallbackUrl(request.nextUrl.searchParams.get('cb') ?? '/')

  const cookieStore = await cookies()
  cookieStore.delete('app_login')

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(`${DEEPLINK}?error=NoSession`)
  }

  const token = await issueHandoffToken({
    userId: session.user.id,
    needsOnboarding: !!session.user.needsOnboarding,
    cb,
  })

  return NextResponse.redirect(`${DEEPLINK}?token=${encodeURIComponent(token)}`)
}
