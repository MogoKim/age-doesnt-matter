'use server'

import { prisma } from '@/lib/prisma'
import { pushService } from '@/lib/push/service'
import type { Grade } from '@/generated/prisma/client'

interface BroadcastResult {
  error?: string
  sent?: number
}

export async function adminBroadcastPush(formData: FormData): Promise<BroadcastResult> {
  const title = (formData.get('title') as string)?.trim()
  const body = (formData.get('body') as string)?.trim()
  const url = (formData.get('url') as string)?.trim() || '/'
  const targetGrade = (formData.get('targetGrade') as string) || 'ALL'

  if (!title || !body) return { error: '제목과 내용을 입력해 주세요' }
  if (title.length > 50) return { error: '제목은 50자 이내로 입력해 주세요' }
  if (body.length > 120) return { error: '내용은 120자 이내로 입력해 주세요' }

  // 대상 유저 조회
  const whereGrade = targetGrade !== 'ALL' ? { grade: targetGrade as Grade } : undefined
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', ...whereGrade },
    select: { id: true },
  })

  // 100명씩 chunk 처리
  const chunkSize = 100
  let sent = 0
  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize)
    await Promise.allSettled(
      chunk.map((u) =>
        pushService.notify(u.id, { title, body, url, tag: 'broadcast' }, 'broadcast')
      )
    )
    sent += chunk.length
  }

  return { sent }
}
