'use server'

import { auth, unstable_update } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getInterestBasedPosts } from '@/lib/queries/posts'
import type { RecommendedPost } from '@/lib/queries/posts'

export type { RecommendedPost }

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]+$/
const BANNED_WORDS = ['운영자', '관리자', 'admin', '어드민', '관리인']

interface OnboardingResult {
  error?: string
}

interface SaveInterestsResult {
  error?: string
  recommendedPosts?: RecommendedPost[]
}

/** 닉네임 중복 확인 */
export async function checkNickname(nickname: string): Promise<{ available: boolean; error?: string }> {
  const trimmed = nickname.trim()

  if (trimmed.length < 2 || trimmed.length > 10) {
    return { available: false, error: '2~10자로 입력해 주세요' }
  }

  if (!NICKNAME_REGEX.test(trimmed)) {
    return { available: false, error: '한글, 영문, 숫자만 사용할 수 있어요' }
  }

  const lower = trimmed.toLowerCase()
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) {
      return { available: false, error: '사용할 수 없는 닉네임이에요' }
    }
  }

  const existing = await prisma.user.findUnique({
    where: { nickname: trimmed },
    select: { id: true },
  })

  if (existing) {
    return { available: false, error: '이미 사용 중인 닉네임이에요' }
  }

  return { available: true }
}

/** 온보딩 완료 (닉네임 저장 + 약관 동의 기록) */
export async function completeOnboarding(
  nickname: string,
  agreedTerms: { service: boolean; privacy: boolean; marketing: boolean },
): Promise<OnboardingResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  // 닉네임 유효성 재검증
  const check = await checkNickname(nickname)
  if (!check.available) {
    return { error: check.error || '사용할 수 없는 닉네임입니다' }
  }

  // 필수 약관 확인
  if (!agreedTerms.service || !agreedTerms.privacy) {
    return { error: '필수 약관에 동의해 주세요' }
  }

  // session.user.id가 DB의 실제 유저 ID(cuid)인지 확인
  let userId = session.user.id
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })

  if (!dbUser) {
    // JWT에 잘못된 userId가 저장된 경우 (예: 카카오 profile ID)
    // providerId로 재조회 시도
    const byProvider = await prisma.user.findUnique({
      where: { providerId: userId },
      select: { id: true },
    })
    if (!byProvider) {
      return { error: '세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.' }
    }
    userId = byProvider.id
  }

  const version = '1.0'

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          nickname,
          nicknameChangedAt: new Date(),
          marketingOptIn: agreedTerms.marketing,
          isOnboarded: true,
        },
      }),
      prisma.agreement.upsert({
        where: { userId_type_version: { userId, type: 'TERMS_OF_SERVICE', version } },
        create: { userId, type: 'TERMS_OF_SERVICE', version },
        update: { agreedAt: new Date() },
      }),
      prisma.agreement.upsert({
        where: { userId_type_version: { userId, type: 'PRIVACY_POLICY', version } },
        create: { userId, type: 'PRIVACY_POLICY', version },
        update: { agreedAt: new Date() },
      }),
      ...(agreedTerms.marketing
        ? [
            prisma.agreement.upsert({
              where: { userId_type_version: { userId, type: 'MARKETING', version } },
              create: { userId, type: 'MARKETING', version },
              update: { agreedAt: new Date() },
            }),
          ]
        : []),
    ])
  } catch (error) {
    console.error('[onboarding] transaction error:', error)
    return { error: '가입 처리 중 문제가 발생했습니다. 다시 시도해 주세요.' }
  }

  // JWT 토큰 갱신 — 미들웨어가 needsOnboarding=false를 인식하도록
  try {
    await unstable_update({ user: { needsOnboarding: false, nickname } })
  } catch (error) {
    console.error('[onboarding] session update error:', error)
  }

  return {}
}

/** 관심사 저장 + 온보딩 최종 완료 처리 (Step3) */
export async function saveInterests(interests: string[]): Promise<SaveInterestsResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: '로그인이 필요합니다' }
  }

  let userId = session.user.id
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!dbUser) {
    const byProvider = await prisma.user.findUnique({
      where: { providerId: userId },
      select: { id: true },
    })
    if (!byProvider) {
      return { error: '세션이 만료되었습니다. 다시 로그인해 주세요.' }
    }
    userId = byProvider.id
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { interests, isOnboarded: true },
    })
  } catch (error) {
    console.error('[onboarding] saveInterests error:', error)
    return { error: '관심사 저장 중 문제가 발생했습니다.' }
  }

  const recommendedPosts = await getInterestBasedPosts(interests, 3).catch(() => [])
  return { recommendedPosts }
}
