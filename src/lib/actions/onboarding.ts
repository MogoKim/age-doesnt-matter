'use server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]+$/
const BANNED_WORDS = ['운영자', '관리자', 'admin', '어드민', '관리인']

interface OnboardingResult {
  error?: string
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

  const userId = session.user.id
  const version = '1.0'

  await prisma.$transaction([
    // 닉네임 업데이트
    prisma.user.update({
      where: { id: userId },
      data: {
        nickname,
        nicknameChangedAt: new Date(),
        marketingOptIn: agreedTerms.marketing,
      },
    }),
    // 약관 동의 기록
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

  return {}
}
