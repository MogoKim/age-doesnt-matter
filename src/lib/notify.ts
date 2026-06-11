import { prisma } from '@/lib/prisma'
import { pushService } from '@/lib/push/service'
import type { NotificationType } from '@/generated/prisma/client'
import type { PushPayload } from '@/lib/push/types'

/**
 * 실고객(진짜 카카오 가입자) 판별 — providerId가 순수 숫자.
 * 봇(seed/curate/bot-* 등)은 providerId가 비숫자 → 알림 대상에서 제외.
 * 기준 단일화: admin.insights.ts isRealUser와 동일 규칙.
 */
export const isRealUser = (providerId: string | null | undefined): boolean =>
  !!providerId && /^\d+$/.test(providerId)

interface NotifyUserParams {
  type: NotificationType
  /** 종(bell) 인앱 알림 문구 */
  bellContent: string
  /** OS 푸시 페이로드 (구독자에게만 전달됨) */
  push: PushPayload
  campaign?: string
  postId?: string | null
  fromUserId?: string | null
}

/**
 * 진짜고객에게만 종 알림 + OS 푸시를 발송한다.
 *
 * - 봇(providerId 비숫자)·비ACTIVE 수신자는 **즉시 스킵** — 종·푸시 둘 다 안 감.
 * - OS 푸시는 구독(PushSubscription)이 있는 기기에만 전달됨(없으면 pushService 내부에서 no-op).
 * - 알림 실패가 호출부(댓글 작성 등) 본 로직에 영향 주지 않도록 throw 하지 않음.
 */
export async function notifyUser(userId: string, params: NotifyUserParams): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { providerId: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE' || !isRealUser(user.providerId)) return

    await prisma.notification
      .create({
        data: {
          userId,
          type: params.type,
          content: params.bellContent,
          postId: params.postId ?? undefined,
          fromUserId: params.fromUserId ?? undefined,
        },
      })
      .catch(() => {})

    void pushService.notify(userId, params.push, params.campaign ?? 'notification').catch(() => {})
  } catch {
    // 알림은 부가 기능 — 실패해도 본 로직에 영향 없음
  }
}
