import type { NextAuthConfig } from 'next-auth'
import Kakao from 'next-auth/providers/kakao'

/**
 * 미들웨어용 경량 auth 설정
 * Prisma를 import하지 않음 → Edge Runtime에서 동작
 */
export const authConfig: NextAuthConfig = {
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET!,
      checks: ['state'], // 카카오는 PKCE 미지원 → state 기반 CSRF 보호 사용
      token: {
        // 카카오 프로바이더의 기본 token이 문자열이라 conform 객체로 덮어씌우면 URL이 사라짐
        url: 'https://kauth.kakao.com/oauth/token',
        // oauth4webapi v3가 카카오 응답과 호환되지 않는 두 가지 이슈 대응:
        // 1. Content-Type: "application/json;charset=UTF-8" → "application/json" 정규화
        // 2. WWW-Authenticate 헤더 제거 (FusionAuth #8745 동일 패턴)
        conform: async (response: Response) => {
          const contentType = response.headers.get('content-type')
          const hasWwwAuth = response.headers.has('www-authenticate')
          const needsContentTypeFix =
            contentType?.startsWith('application/json') && contentType !== 'application/json'

          if (!needsContentTypeFix && !hasWwwAuth) return response

          const newHeaders = new Headers()
          response.headers.forEach((value, key) => {
            const k = key.toLowerCase()
            if (k === 'www-authenticate') return
            if (k === 'content-type' && needsContentTypeFix) {
              newHeaders.set(key, 'application/json')
              return
            }
            newHeaders.append(key, value)
          })
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          })
        },
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30일
  },

  pages: {
    signIn: '/login',
  },

  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnboarding = nextUrl.pathname === '/onboarding'
      const isProtected = nextUrl.pathname.startsWith('/my')

      // 보호 페이지: 로그인 필요
      if (isProtected && !isLoggedIn) {
        return false // NextAuth가 자동으로 signIn 페이지로 리다이렉트
      }

      // 온보딩 미완료 유저: /onboarding으로 리다이렉트
      if (isLoggedIn && auth.user.needsOnboarding && !isOnboarding) {
        return Response.redirect(new URL('/onboarding', nextUrl))
      }

      // 온보딩 완료 유저가 /onboarding 접근 시: 홈으로 리다이렉트
      if (isLoggedIn && !auth.user.needsOnboarding && isOnboarding) {
        return Response.redirect(new URL('/', nextUrl))
      }

      return true
    },
  },
}
