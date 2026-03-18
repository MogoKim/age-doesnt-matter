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
      const isProtected = nextUrl.pathname.startsWith('/my') || nextUrl.pathname.startsWith('/onboarding')

      if (isProtected && !isLoggedIn) {
        return false // NextAuth가 자동으로 signIn 페이지로 리다이렉트
      }

      return true
    },
  },
}
