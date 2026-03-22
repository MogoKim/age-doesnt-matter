import type { NextAuthConfig } from 'next-auth'
import Kakao from 'next-auth/providers/kakao'

/**
 * ⚠️ 극한 격리 테스트 — 모든 커스텀 설정 제거
 * 목적: NextAuth + Kakao 기본 설정만으로 OAuth가 동작하는지 확인
 *
 * 원래 코드: git show HEAD~1:src/lib/auth.config.ts
 */
export const authConfig: NextAuthConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID!,
      clientSecret: process.env.KAKAO_CLIENT_SECRET!,
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },

  debug: true,

  pages: {
    signIn: '/login',
    error: '/auth-error',
  },

  callbacks: {
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string
      }
      return session
    },
  },
}
