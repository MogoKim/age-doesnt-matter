import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const step = url.searchParams.get('step')

  try {
    // Step 1: 환경변수 확인
    if (step === 'env') {
      return NextResponse.json({
        AUTH_SECRET_exists: !!process.env.AUTH_SECRET,
        AUTH_SECRET_length: process.env.AUTH_SECRET?.length,
        AUTH_URL_exists: !!process.env.AUTH_URL,
        AUTH_URL_value: process.env.AUTH_URL,
        KAKAO_CLIENT_ID_exists: !!process.env.KAKAO_CLIENT_ID,
        KAKAO_CLIENT_SECRET_exists: !!process.env.KAKAO_CLIENT_SECRET,
        NODE_ENV: process.env.NODE_ENV,
      })
    }

    // Step 2: NextAuth 설정 로드 테스트
    if (step === 'auth') {
      const { auth } = await import('@/lib/auth')
      const session = await auth()
      return NextResponse.json({
        authLoaded: true,
        session: session ? { user: session.user } : null,
      })
    }

    // Step 3: Prisma 연결 테스트
    if (step === 'db') {
      const { prisma } = await import('@/lib/prisma')
      const count = await prisma.user.count()
      return NextResponse.json({ dbConnected: true, userCount: count })
    }

    // Step 4: 실제 카카오 콜백 시뮬레이션 (에러 잡기)
    if (step === 'callback-test') {
      const code = url.searchParams.get('code') || 'TEST'
      const state = url.searchParams.get('state') || ''

      // 쿠키 정보
      const cookies = request.headers.get('cookie') || ''
      const hasStateCookie = cookies.includes('authjs.state')
      const hasCsrfCookie = cookies.includes('authjs.csrf-token')

      return NextResponse.json({
        code: code.substring(0, 10) + '...',
        stateLength: state.length,
        hasStateCookie,
        hasCsrfCookie,
        cookieNames: cookies.split(';').map(c => c.trim().split('=')[0]),
      })
    }

    return NextResponse.json({
      usage: 'Add ?step=env|auth|db|callback-test',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
    }, { status: 500 })
  }
}
