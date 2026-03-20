'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { FontSize } from '@/generated/prisma/client'

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

  revalidatePath('/my/settings')
  return {}
}

export async function updateNickname(nickname: string): Promise<{ error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { error: '로그인이 필요합니다' }

  const trimmed = nickname.trim()

  // 유효성 검사
  if (trimmed.length < 2 || trimmed.length > 12) {
    return { error: '닉네임은 2~12자로 입력해 주세요' }
  }

  if (!/^[가-힣a-zA-Z0-9]+$/.test(trimmed)) {
    return { error: '한글, 영문, 숫자만 사용할 수 있어요' }
  }

  const forbidden = ['운영자', '관리자', 'admin', '우나어']
  if (forbidden.some((word) => trimmed.toLowerCase().includes(word.toLowerCase()))) {
    return { error: '사용할 수 없는 닉네임이에요' }
  }

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
