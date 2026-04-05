import NextAuth from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/lib/auth.config'

/**
 * 전체 auth 설정 (서버 전용 — Prisma DB 접근 포함)
 * 미들웨어에서는 auth.config.ts의 경량 버전 사용
 */
export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  ...authConfig,

  callbacks: {
    ...authConfig.callbacks,

    async signIn({ account, profile }) {
      try {
        if (account?.provider !== 'kakao' || !profile) return false

        const providerId = String(profile.id)

        const existing = await prisma.user.findUnique({
          where: { providerId },
          select: { status: true, suspendedUntil: true },
        })

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

    async jwt({ token, account, profile, trigger, session }) {
      // 온보딩 완료 등 세션 업데이트 시 토큰 갱신
      if (trigger === 'update' && session) {
        const updates = session.user || session
        if (updates.needsOnboarding !== undefined) token.needsOnboarding = updates.needsOnboarding
        if (updates.nickname) token.nickname = updates.nickname
        if (updates.grade) token.grade = updates.grade
        return token
      }

      try {
        if (account?.provider === 'kakao' && profile) {
          const providerId = String(profile.id)
          const kakaoAccount = profile as Record<string, unknown>
          const kakaoProfile = (kakaoAccount.kakao_account as Record<string, unknown>)
            ?.profile as Record<string, string> | undefined

          let user = await prisma.user.findUnique({
            where: { providerId },
            select: { id: true, role: true, grade: true, nickname: true, profileImage: true, status: true, suspendedUntil: true },
          })

          if (!user) {
            const tempNickname = `user_${providerId.slice(-8)}`
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
        } else if (token.userId) {
          // 기존 세션 갱신: DB에 유저가 실제 존재하는지 확인
          const user = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { id: true, role: true, grade: true, nickname: true, profileImage: true },
          })
          if (!user) {
            // DB에 유저가 없으면 토큰 초기화 → 재로그인 유도
            token.userId = undefined
            token.role = undefined
            token.grade = undefined
            token.nickname = undefined
            token.profileImage = undefined
            token.needsOnboarding = undefined
          } else {
            // DB 최신 정보 반영
            token.role = user.role
            token.grade = user.grade
            token.nickname = user.nickname
            token.profileImage = user.profileImage
            token.needsOnboarding = user.nickname.startsWith('user_')
          }
        }
      } catch (error) {
        console.error('[auth] jwt callback error:', error)
      }

      return token
    },
  },
})
