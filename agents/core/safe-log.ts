import { prisma } from './db.js'
import { notifyAdmin } from './notifier.js'

/**
 * safeBotLog — prisma.botLog.create() 안전 wrapper
 *
 * BaseAgent를 상속하지 않는 에이전트 파일들(cafe, seed, cmo 등)에서
 * 직접 prisma.botLog.create()를 호출하는 대신 이 함수를 사용.
 * DB write 실패 시 Slack #시스템 알림으로 fallback — silent fail 방지.
 */
export async function safeBotLog(params: {
  botType: string
  action: string
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL'
  details?: string
  itemCount?: number
  executionTimeMs?: number
}): Promise<void> {
  try {
    await prisma.botLog.create({
      data: {
        botType: params.botType,
        action: params.action,
        status: params.status,
        details: params.details,
        itemCount: params.itemCount ?? 0,
        executionTimeMs: params.executionTimeMs ?? 0,
      },
    })
  } catch (err) {
    console.error(`[safeBotLog] DB write failed: ${params.botType}:${params.action}`, err)
    try {
      await notifyAdmin({
        level: 'important',
        agent: params.botType,
        title: `BotLog 기록 실패 — ${params.action}`,
        body: err instanceof Error ? err.message : String(err),
      })
    } catch { /* Slack도 실패하면 circular fail 방지 위해 무시 */ }
  }
}
