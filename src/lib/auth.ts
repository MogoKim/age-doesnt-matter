import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'

/**
 * ⚠️ 격리 테스트 모드 — Prisma 콜백 완전 제거
 * 목적: Configuration 에러가 우리 콜백 코드 때문인지 NextAuth/카카오 자체 문제인지 확인
 *
 * 원래 코드: git show HEAD:src/lib/auth.ts
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ account, profile }) {
      console.log('[auth-isolation] signIn called:', {
        provider: account?.provider,
        hasProfile: !!profile,
        profileId: profile?.id,
      })
      // 무조건 true — Prisma 로직 완전 제거
      return true
    },

    async jwt({ token, account, profile }) {
      console.log('[auth-isolation] jwt called:', {
        hasAccount: !!account,
        provider: account?.provider,
        hasProfile: !!profile,
      })
      // 최소한의 토큰만 설정 — Prisma 없이
      if (account?.provider === 'kakao' && profile) {
        token.userId = String(profile.id)
        token.nickname = `user_${String(profile.id).slice(-8)}`
        token.needsOnboarding = true
      }
      return token
    },
  },
})
