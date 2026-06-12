'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { FontSize } from '@/generated/prisma/client'
import { validateNicknameFormat } from '@/lib/nickname'

export async function updateFontSize(fontSize: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const validSizes: FontSize[] = ['NORMAL', 'LARGE', 'XLARGE']
  if (!validSizes.includes(fontSize as FontSize)) {
    return { error: '올바르지 않은 글자 크기입니다' }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { fontSize: fontSize as FontSize },
  })

  revalidateTag(`user-${session.user.id}-font`)
  revalidatePath('/my/settings')
  return {}
}

export async function updateNickname(nickname: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const trimmed = nickname.trim()

  // 유효성 검사 — 가입 온보딩과 동일 규칙(@/lib/nickname)
  const formatError = validateNicknameFormat(trimmed)
  if (formatError) return { error: formatError }

  // 30일 제한 확인
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { nickname: true, nicknameChangedAt: true },
  })

  if (!user) return { error: '사용자를 찾을 수 없습니다' }

  if (user.nickname === trimmed) return { error: '현재 닉네임과 동일합니다' }

  if (user.nicknameChangedAt) {
    const daysSinceChange = (Date.now() - user.nicknameChangedAt.getTime()) / (1000 * 60 * 60 * 24)
    if (daysSinceChange < 30) {
      const remainingDays = Math.ceil(30 - daysSinceChange)
      return { error: `닉네임은 30일에 1회 변경 가능해요. ${remainingDays}일 후 가능합니다.` }
    }
  }

  // 중복 확인
  const existing = await prisma.user.findFirst({
    where: { nickname: { equals: trimmed, mode: 'insensitive' }, id: { not: session.user.id } },
  })
  if (existing) return { error: '이미 사용 중인 닉네임이에요' }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { nickname: trimmed, nicknameChangedAt: new Date() },
  })

  revalidatePath('/my/settings')
  revalidatePath('/my')
  return {}
}

/**
 * 닉네임 변경 가능 여부 실시간 확인 (입력 중 ✅/❌ 표시용).
 * 형식·본인동일·중복(본인 제외)만 검사. 30일 제한은 UI(canChange)에서 입력 자체를 막으므로 제외.
 * 최종 저장은 updateNickname이 30일 포함 전 항목 재검증(권위).
 */
export async function checkNicknameForChange(nickname: string): Promise<{ available: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { available: false, error: '로그인이 필요합니다' }

  const trimmed = nickname.trim()
  const formatError = validateNicknameFormat(trimmed)
  if (formatError) return { available: false, error: formatError }

  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { nickname: true } })
  if (me?.nickname === trimmed) return { available: false, error: '현재 닉네임과 같아요' }

  const existing = await prisma.user.findFirst({
    where: { nickname: { equals: trimmed, mode: 'insensitive' }, id: { not: session.user.id } },
    select: { id: true },
  })
  if (existing) return { available: false, error: '이미 사용 중인 닉네임이에요' }

  return { available: true }
}
