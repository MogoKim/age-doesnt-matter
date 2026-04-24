import type { NextAuthConfig } from 'next-auth'
import type { Grade, Role } from '@/generated/prisma/client'
import Kakao from 'next-auth/providers/kakao'

/**
 * 미들웨어용 경량 auth 설정
 * Prisma를 import하지 않음 → Edge Runtime에서 동작
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID ?? '',
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? '',
      checks: ['state'],
      token: {
        url: 'https://kauth.kakao.com/oauth/token',
        // oauth4webapi v3 ↔ 카카오 응답 호환:
        // Content-Type charset 정규화 + WWW-Authenticate 제거
        conform: async (response: Response) => {
          const contentType = response.headers.get('content-type')
          const hasWwwAuth = response.headers.has('www-authenticate')
          const needsContentTypeFix =
            contentType?.startsWith('application/json') && contentType !== 'application/json'

          if (!needsContentTypeFix && !hasWwwAuth) return response

          const body = await response.clone().text()
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
    maxAge: 30 * 24 * 60 * 60,
  },

  pages: {
    signIn: '/login',
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
        session.user.fontSize = token.fontSize as string | undefined
        session.user.createdAt = token.createdAt as string | undefined
      }
      return session
    },

    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnboarding = nextUrl.pathname === '/onboarding'
      const isProtected = nextUrl.pathname.startsWith('/my')

      if (isProtected && !isLoggedIn) {
        return false
      }

      if (isLoggedIn && auth.user.needsOnboarding && !isOnboarding) {
        return Response.redirect(new URL('/onboarding', nextUrl))
      }

      if (isLoggedIn && !auth.user.needsOnboarding && isOnboarding) {
        return Response.redirect(new URL('/', nextUrl))
      }

      return true
    },
  },
}
