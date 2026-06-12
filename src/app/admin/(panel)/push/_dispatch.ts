// 푸시 발송 공용 로직 (즉시 발송 actions.ts + 예약 디스패치 route.ts 공용).
// 서버 액션 지시어 없음 — 일반 서버 모듈이라 server action·route 양쪽에서 import 가능.
import { prisma } from '@/lib/prisma'
import { pushService } from '@/lib/push/service'
import { isRealUser } from '@/lib/notify'
import type { Grade } from '@/generated/prisma/client'
import type { PushPayload } from '@/lib/push/types'

export interface ResolveInput {
  targetMode: 'all' | 'grade' | 'user'
  targetGrade: string
  targetUserIds: string[]
  isAd: boolean
}

/** 발송 조건 → 실제 수신자 userId 목록 (구독 보유자만 + 광고면 마케팅 동의자만). count·send 공용. */
export async function resolveRecipients({ targetMode, targetGrade, targetUserIds, isAd }: ResolveInput): Promise<string[]> {
  // 구독 보유자만(pushSubscriptions 존재) — 미구독은 푸시 자체 불가
  const where: Record<string, unknown> = {
    status: 'ACTIVE',
    pushSubscriptions: { some: {} },
    ...(isAd ? { marketingOptIn: true } : {}),   // 광고는 마케팅 동의자만(§50)
  }
  if (targetMode === 'user') {
    if (targetUserIds.length === 0) return []
    where.id = { in: targetUserIds }
  } else if (targetMode === 'grade' && targetGrade !== 'ALL') {
    where.grade = targetGrade as Grade
  }
  const rows = await prisma.user.findMany({ where, select: { id: true, providerId: true } })
  return rows.filter((u) => isRealUser(u.providerId)).map((u) => u.id)
}

/** 수신자 목록에 100개 chunk로 발송. 발송 시도 건수 반환. */
export async function sendToRecipients(recipientIds: string[], payload: PushPayload, isAd: boolean): Promise<number> {
  const chunkSize = 100
  let sent = 0
  for (let i = 0; i < recipientIds.length; i += chunkSize) {
    const chunk = recipientIds.slice(i, i + chunkSize)
    await Promise.allSettled(
      chunk.map((uid) => pushService.notify(uid, payload, 'broadcast', isAd ? 'ad' : 'service')),
    )
    sent += chunk.length
  }
  return sent
}

/** 예약 due 처리 — status=PENDING && scheduledAt<=now 픽업해 발송 후 상태 갱신. 멱등. */
export async function dispatchDuePushes(): Promise<{ processed: number; sent: number }> {
  const now = new Date()
  const due = await prisma.scheduledPush.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: 20,
  })

  let totalSent = 0
  for (const job of due) {
    try {
      const isAd = job.messageType === 'ad'
      const recipients = await resolveRecipients({
        targetMode: job.targetMode as ResolveInput['targetMode'],
        targetGrade: job.targetGrade,
        targetUserIds: job.targetUserIds,
        isAd,
      })
      const sent = await sendToRecipients(
        recipients,
        { title: job.title, body: job.body, url: job.url, tag: 'broadcast' },
        isAd,
      )
      totalSent += sent
      await prisma.scheduledPush.update({
        where: { id: job.id },
        data: { status: 'SENT', sentCount: sent, sentAt: new Date() },
      })
    } catch (e) {
      await prisma.scheduledPush.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: String(e).slice(0, 500) },
      }).catch(() => {})
    }
  }
  return { processed: due.length, sent: totalSent }
}
