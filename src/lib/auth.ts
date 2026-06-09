import NextAuth from 'next-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { authConfig } from '@/lib/auth.config'
import { logAuthFailure } from '@/lib/auth-monitor'
import { retryOnConnError } from '@/lib/db-retry'

const TOKEN_REFRESH_WINDOW_MS = 30 * 60 * 1000

function normalizeKakaoPhone(raw: string | undefined): string | null {
  if (!raw) return null
  return raw.replace(/^\+82\s?/, '0').replace(/[^0-9]/g, '') || null
}

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

        const existing = await retryOnConnError(() => prisma.user.findUnique({
          where: { providerId },
          select: { status: true, suspendedUntil: true },
        }))

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
        await logAuthFailure('signin_exception', String(error)).catch(() => {})
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
        token.tokenRefreshedAt = 0 // 다음 요청에 DB 재조회 강제
        return token
      }

      try {
        if (account?.provider === 'kakao' && profile) {
          const providerId = String(profile.id)
          const kakaoAccount = profile as Record<string, unknown>
          const kakaoData = kakaoAccount.kakao_account as Record<string, unknown>
          const kakaoProfile = kakaoData?.profile as Record<string, string> | undefined

          let user = await retryOnConnError(() => prisma.user.findUnique({
            where: { providerId },
            select: { id: true, role: true, grade: true, nickname: true, profileImage: true, status: true, suspendedUntil: true, fontSize: true, createdAt: true },
          }))

          if (!user) {
            const tempNickname = `user_${providerId.slice(-8)}`
            const kakaoEmail = typeof kakaoData?.email === 'string' ? kakaoData.email : undefined
            // 계정 식별자는 providerId. email은 부가 정보일 뿐 식별/병합에 쓰지 않는다.
            const newUserData = {
              providerId,
              nickname: tempNickname,
              profileImage: kakaoProfile?.profile_image_url,
              birthYear: kakaoData?.birthyear ? Number(kakaoData.birthyear) : undefined,
              gender: typeof kakaoData?.gender === 'string' ? kakaoData.gender : undefined,
              phone: normalizeKakaoPhone(kakaoData?.phone_number as string | undefined),
            }
            try {
              user = await retryOnConnError(() => prisma.user.create({
                data: { ...newUserData, email: kakaoEmail },
              }))
              token.needsOnboarding = true
            } catch (createError) {
              // 동시 콜백 race: 형제 요청이 먼저 같은 providerId(=같은 사람)로 생성하면서
              // unique(email/providerId) 제약 위반. providerId 기준으로만 회복한다.
              if (
                createError instanceof Prisma.PrismaClientKnownRequestError &&
                createError.code === 'P2002'
              ) {
                // 1) 같은 사람(providerId) 계정이 방금 생겼는지 재조회 → 있으면 그 계정 채택
                user = await prisma.user.findUnique({
                  where: { providerId },
                  select: { id: true, role: true, grade: true, nickname: true, profileImage: true, status: true, suspendedUntil: true, fontSize: true, createdAt: true },
                })
                if (user) {
                  // 정상 회복 — BotLog FAILED로 남기지 않고 Vercel 로그로만 관측
                  console.warn('[auth] jwt create P2002 → providerId 재조회로 회복 (동시 콜백)')
                  token.needsOnboarding = user.nickname.startsWith('user_')
                } else {
                  // 2) providerId로도 없음 = 다른 사람이 같은 email을 선점한 진짜 충돌.
                  //    email로 그 계정에 로그인/병합하지 않는다(계정 탈취 방어).
                  //    email 없이 신규 생성하여 제약 위반과 탈취를 동시에 회피한다.
                  user = await retryOnConnError(() => prisma.user.create({
                    data: { ...newUserData, email: undefined },
                  }))
                  token.needsOnboarding = true
                  // email 값(PII)은 기록하지 않고 충돌 발생 사실만 남긴다.
                  await logAuthFailure(
                    'jwt_exception',
                    'kakao_email_collision: created account without email (no providerId match after P2002)'
                  ).catch(() => {})
                }
              } else {
                throw createError
              }
            }
          } else {
            const existingUserId = user.id
            await retryOnConnError(() => prisma.user.update({
              where: { id: existingUserId },
              data: { lastLoginAt: new Date() },
            }))
            token.needsOnboarding = user.nickname.startsWith('user_')
          }

          token.userId = user.id
          token.role = user.role
          token.grade = user.grade
          token.nickname = user.nickname
          token.profileImage = user.profileImage
          token.fontSize = user.fontSize ?? 'NORMAL'
          token.createdAt = user.createdAt.toISOString()
        } else if (token.userId) {
          // 5분 이내 갱신됐으면 DB 스킵 (매 요청 DB 조회 방지)
          const now = Date.now()
          const lastRefresh = (token.tokenRefreshedAt as number) ?? 0
          if (now - lastRefresh < TOKEN_REFRESH_WINDOW_MS) {
            return token
          }

          // 기존 세션 갱신: lastLoginAt 업데이트 겸 유저 존재 확인 (30분 throttle 내 스킵됨)
          const user = await (async () => {
            try {
              return await retryOnConnError(() => prisma.user.update({
                where: { id: token.userId as string },
                data: { lastLoginAt: new Date() },
                select: { id: true, role: true, grade: true, nickname: true, profileImage: true, fontSize: true, createdAt: true },
              }))
            } catch (e) {
              if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
                return null // 유저 없음 → 토큰 초기화
              }
              throw e // 기타 DB 오류 → 외부 catch로 넘겨 logAuthFailure 처리 (정상 유저 로그아웃 방지)
            }
          })()
          if (!user) {
            // DB에 유저가 없으면 토큰 초기화 → 재로그인 유도
            token.userId = undefined
            token.role = undefined
            token.grade = undefined
            token.nickname = undefined
            token.profileImage = undefined
            token.needsOnboarding = undefined
            token.fontSize = undefined
            token.createdAt = undefined
          } else {
            // DB 최신 정보 반영
            token.tokenRefreshedAt = now
            token.role = user.role
            token.grade = user.grade
            token.nickname = user.nickname
            token.profileImage = user.profileImage
            token.needsOnboarding = user.nickname.startsWith('user_')
            token.fontSize = user.fontSize ?? 'NORMAL'
            if (!token.createdAt) {
              token.createdAt = user.createdAt.toISOString()
            }
          }
        }
      } catch (error) {
        console.error('[auth] jwt callback error:', error)
        await logAuthFailure('jwt_exception', String(error)).catch(() => {})
      }

      return token
    },
  },
})
