'use server'

import { prisma } from '@/lib/prisma'
import { pushService } from '@/lib/push/service'
import { isRealUser } from '@/lib/notify'
import { getAdminSession } from '@/lib/admin-auth'
import type { Grade } from '@/generated/prisma/client'

interface BroadcastResult {
  error?: string
  sent?: number
}

export async function adminBroadcastPush(formData: FormData): Promise<BroadcastResult> {
  // 보안 가드: 비인증 호출 차단 (Server Action은 미들웨어 우회 가능 → 액션 내부 인증 필수)
  const session = await getAdminSession()
  if (!session) return { error: '관리자 인증이 필요합니다.' }

  const title = (formData.get('title') as string)?.trim()
  const body = (formData.get('body') as string)?.trim()
  const url = (formData.get('url') as string)?.trim() || '/'
  const targetGrade = (formData.get('targetGrade') as string) || 'ALL'
  // 유형: 'ad'(광고/마케팅) vs 'service'(서비스 알림·기본). 광고는 마케팅 동의자만 + (광고)표기 + 야간차단(pushService 내부).
  const isAd = (formData.get('messageType') as string) === 'ad'

  if (!title || !body) return { error: '제목과 내용을 입력해 주세요' }
  if (title.length > 50) return { error: '제목은 50자 이내로 입력해 주세요' }
  if (body.length > 120) return { error: '내용은 120자 이내로 입력해 주세요' }

  // 대상 유저 조회 — 봇(providerId 비숫자) 제외, 실고객에게만. 광고면 마케팅 동의자(marketingOptIn)만(이중 가드).
  const whereGrade = targetGrade !== 'ALL' ? { grade: targetGrade as Grade } : undefined
  const allUsers = await prisma.user.findMany({
    where: { status: 'ACTIVE', ...whereGrade, ...(isAd ? { marketingOptIn: true } : {}) },
    select: { id: true, providerId: true },
  })
  const users = allUsers.filter((u) => isRealUser(u.providerId))

  // 100명씩 chunk 처리
  const chunkSize = 100
  let sent = 0
  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize)
    await Promise.allSettled(
      chunk.map((u) =>
        pushService.notify(u.id, { title, body, url, tag: 'broadcast' }, 'broadcast', isAd ? 'ad' : 'service')
      )
    )
    sent += chunk.length
  }

  return { sent }
}
