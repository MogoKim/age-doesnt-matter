import NextAuth from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/lib/auth.config'

/**
 * 전체 auth 설정 (서버 전용 — Prisma DB 접근 포함)
 * 미들웨어에서는 auth.config.ts의 경량 버전 사용
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ account, profile }) {
      try {
        if (account?.provider !== 'kakao' || !profile) return false

        const providerId = String(profile.id)
        console.log('[auth] signIn callback - providerId:', providerId)

        const existing = await prisma.user.findUnique({
          where: { providerId },
        })
        console.log('[auth] existing user:', existing?.id ?? 'none')

        // 탈퇴 유예 중인 계정 복구
        if (existing?.status === 'WITHDRAWN') {
          await prisma.user.update({
            where: { providerId },
            data: { status: 'ACTIVE', withdrawnAt: null },
          })
        }

        // 차단 상태
        if (existing?.status === 'BANNED') return false

        // 정지 상태 — 기간 만료 시 자동 해제
        if (existing?.status === 'SUSPENDED' && existing.suspendedUntil) {
          if (existing.suspendedUntil > new Date()) return false
          await prisma.user.update({
            where: { providerId },
            data: { status: 'ACTIVE', suspendedUntil: null },
          })
        }

        return true
      } catch (error) {
        console.error('[auth] signIn error:', error)
        return false
      }
    },

    async jwt({ token, account, profile }) {
      try {
        if (account?.provider === 'kakao' && profile) {
          const providerId = String(profile.id)
          console.log('[auth] jwt callback - providerId:', providerId)
          const kakaoAccount = profile as Record<string, unknown>
          console.log('[auth] kakao profile keys:', Object.keys(kakaoAccount))
          const kakaoProfile = (kakaoAccount.kakao_account as Record<string, unknown>)
            ?.profile as Record<string, string> | undefined

          let user = await prisma.user.findUnique({
            where: { providerId },
          })

          if (!user) {
            // 신규 회원 — 임시 닉네임 생성, 온보딩 필요
            const tempNickname = `user_${providerId.slice(-8)}`
            console.log('[auth] creating new user:', tempNickname)
            user = await prisma.user.create({
              data: {
                providerId,
                nickname: tempNickname,
                email: (kakaoAccount.kakao_account as Record<string, unknown>)?.email as
                  | string
                  | undefined,
                profileImage: kakaoProfile?.profile_image_url,
                birthYear: (kakaoAccount.kakao_account as Record<string, unknown>)?.birthyear
                  ? Number((kakaoAccount.kakao_account as Record<string, unknown>)?.birthyear)
                  : undefined,
                gender: (kakaoAccount.kakao_account as Record<string, unknown>)?.gender as
                  | string
                  | undefined,
              },
            })
            token.needsOnboarding = true
          } else {
            console.log('[auth] existing user login:', user.id)
            await prisma.user.update({
              where: { id: user.id },
              data: { lastLoginAt: new Date() },
            })
            token.needsOnboarding = user.nickname.startsWith('user_')
          }

          token.userId = user.id
          token.role = user.role
          token.grade = user.grade
          token.nickname = user.nickname
          token.profileImage = user.profileImage
        }
      } catch (error) {
        console.error('[auth] jwt callback error:', error)
      }

      return token
    },

    // session 콜백은 authConfig.callbacks에서 상속 (Edge Runtime 호환)
  },
})
