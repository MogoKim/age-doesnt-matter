import type { NextAuthConfig } from 'next-auth'
import type { Grade, Role } from '@/generated/prisma/client'
import Kakao from 'next-auth/providers/kakao'

/**
 * 미들웨어용 경량 auth 설정
 * Prisma를 import하지 않음 → Edge Runtime에서 동작
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID ?? '',
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? '',
      // 임시: state 검증 비활성화하여 문제 격리 테스트
      checks: [],
      // userinfo 엔드포인트도 카카오는 비표준 Content-Type 반환
      userinfo: {
        url: 'https://kapi.kakao.com/v2/user/me',
        conform: async (response: Response) => {
          console.log('[auth-isolation] userinfo conform called:', {
            status: response.status,
            contentType: response.headers.get('content-type'),
          })
          const contentType = response.headers.get('content-type')
          if (contentType?.startsWith('application/json') && contentType !== 'application/json') {
            const body = await response.clone().text()
            const newHeaders = new Headers(response.headers)
            newHeaders.set('content-type', 'application/json')
            return new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            })
          }
          return response
        },
      },
      token: {
        url: 'https://kauth.kakao.com/oauth/token',
        // oauth4webapi v3 ↔ 카카오 응답 호환 대응:
        // Content-Type charset 정규화 + WWW-Authenticate 제거
        conform: async (response: Response) => {
          console.log('[auth-isolation] token conform called:', {
            status: response.status,
            contentType: response.headers.get('content-type'),
            hasWwwAuth: response.headers.has('www-authenticate'),
          })

          const contentType = response.headers.get('content-type')
          const hasWwwAuth = response.headers.has('www-authenticate')
          const needsContentTypeFix =
            contentType?.startsWith('application/json') && contentType !== 'application/json'

          if (!needsContentTypeFix && !hasWwwAuth) {
            console.log('[auth-isolation] conform: no fix needed')
            return response
          }

          const body = await response.clone().text()
          console.log('[auth-isolation] conform: fixing response, body length:', body.length)

          const newHeaders = new Headers(response.headers)
          if (needsContentTypeFix) {
            newHeaders.set('content-type', 'application/json')
          }
          if (hasWwwAuth) {
            newHeaders.delete('www-authenticate')
          }

          return new Response(body, {
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

  debug: true, // 임시: Vercel 로그에서 에러 원인 확인용

  pages: {
    signIn: '/login',
    error: '/auth-error',
  },

  callbacks: {
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string
        session.user.role = token.role as Role
        session.user.grade = token.grade as Grade
        session.user.nickname = token.nickname as string
        session.user.profileImage = token.profileImage as string | null
        session.user.needsOnboarding = token.needsOnboarding as boolean
      }
      return session
    },

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
