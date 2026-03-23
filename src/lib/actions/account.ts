'use server'

import { revalidatePath } from 'next/cache'
import { auth, signOut } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 정보 공개 설정 업데이트 */
export async function updatePrivacySettings(data: {
  isGenderPublic: boolean
  isRegionPublic: boolean
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: '로그인이 필요합니다.' }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        isGenderPublic: data.isGenderPublic,
        isRegionPublic: data.isRegionPublic,
      },
    })
    revalidatePath('/my/settings')
    return { success: true }
  } catch {
    return { success: false, error: '설정 저장에 실패했습니다.' }
  }
}

export async function withdrawAccount(): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: '로그인이 필요합니다.' }
  }

  try {
    // 소프트 삭제: 상태를 WITHDRAWN으로 변경, 30일 후 배치로 완전 삭제
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
      },
    })

    // 로그아웃 처리
    await signOut({ redirect: false })

    return { success: true }
  } catch {
    return { success: false, error: '탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }
  }
}
