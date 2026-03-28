import { prisma } from './db.js'
import { notifyApproval } from './notifier.js'

/**
 * AdminQueue 생성 입력 타입
 * Prisma.AdminQueueCreateInput과 동일한 필수/옵션 필드
 */
interface ApprovalRequestInput {
  type: string
  title: string
  description?: string | null
  payload?: unknown
  requestedBy: string
  status: string
}

/**
 * AdminQueue 생성 + Slack #승인-대기 채널에 Block Kit 알림 전송
 *
 * 기존 prisma.adminQueue.create 호출을 이 함수로 교체하면
 * 자동으로 Slack 승인 버튼이 포함된 메시지가 전송됩니다.
 */
export async function createApprovalRequest(
  data: ApprovalRequestInput,
): Promise<string> {
  const item = await (prisma as Record<string, unknown> & {
    adminQueue: {
      create: (args: { data: ApprovalRequestInput }) => Promise<{
        id: string
        type: string
        title: string
        description: string | null
        requestedBy: string
      }>
    }
  }).adminQueue.create({ data })

  await notifyApproval({
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    requestedBy: item.requestedBy,
  })

  return item.id
}
