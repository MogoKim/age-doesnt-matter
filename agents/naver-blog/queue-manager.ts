/**
 * 발행 큐 관리자 — Supabase NaverBlogQueue 테이블 기반
 *
 * queue.json 파일 의존 제거 → 상용 어드민에서도 실시간 접근 가능
 *
 * 큐 상태 전이:
 *   PENDING → READY_FOR_MANUAL  (LLM 변환 + 이미지 완료 → 창업자 수동 발행 대기)
 *   PENDING → EXPIRED           (48시간 초과 stale content)
 *   PENDING → FAILED            (retryCount >= maxRetries)
 *   READY_FOR_MANUAL → (삭제)  (창업자 발행 완료 → deleteQueueItem)
 *   READY_FOR_MANUAL → EXPIRED (48시간 초과 미처리)
 */

import { POSTING_POLICY, kstDateString } from './config.js'
import type { BlogContent } from './content-transformer.js'

// ── 타입 ──

export type QueueStatus = 'pending' | 'ready_for_manual' | 'posted' | 'failed' | 'expired'

export interface QueueItem {
  queueId: string
  magazinePostId: string
  title: string
  category: string
  targetTime: string       // ISO 8601
  status: QueueStatus
  naverBlogUrl: string | null
  retryCount: number
  lastAttemptAt: string | null
  queuedAt: string
  expiredReason: string | null
  transformedContent?: BlogContent
  imageUrls?: string[]
}

// ── 상태 매핑 ──

const TO_DB: Record<QueueStatus, string> = {
  pending: 'PENDING',
  ready_for_manual: 'READY_FOR_MANUAL',
  posted: 'POSTED',
  failed: 'FAILED',
  expired: 'EXPIRED',
}

const FROM_DB: Record<string, QueueStatus> = {
  PENDING: 'pending',
  READY_FOR_MANUAL: 'ready_for_manual',
  POSTED: 'posted',
  FAILED: 'failed',
  EXPIRED: 'expired',
}

// ── DB 접근 헬퍼 ──

// agents/core/db.ts는 tsc 제외 대상이라 Prisma delegate 타입을 직접 참조할 수 없으므로
// 사용하는 메서드만 선언한 최소 인터페이스로 any 없이 타입 안전성 확보
interface NaverBlogQueueDelegate {
  findFirst(args: unknown): Promise<Record<string, unknown> | null>
  findMany(args: unknown): Promise<Record<string, unknown>[]>
  create(args: unknown): Promise<Record<string, unknown>>
  update(args: unknown): Promise<Record<string, unknown>>
  updateMany(args: unknown): Promise<{ count: number }>
  count(args?: unknown): Promise<number>
  delete(args: unknown): Promise<Record<string, unknown>>
}

async function q(): Promise<NaverBlogQueueDelegate> {
  const { prisma } = await import('../core/db.js')
  return (prisma as Record<string, unknown>).naverBlogQueue as NaverBlogQueueDelegate
}

function toItem(row: Record<string, unknown>): QueueItem {
  return {
    queueId: row.queueId as string,
    magazinePostId: row.magazinePostId as string,
    title: row.title as string,
    category: row.category as string,
    targetTime: (row.targetTime as Date).toISOString(),
    status: FROM_DB[row.status as string] ?? 'pending',
    naverBlogUrl: (row.naverBlogUrl as string | null) ?? null,
    retryCount: row.retryCount as number,
    lastAttemptAt: row.lastAttemptAt ? (row.lastAttemptAt as Date).toISOString() : null,
    queuedAt: (row.queuedAt as Date).toISOString(),
    expiredReason: (row.expiredReason as string | null) ?? null,
    transformedContent: row.transformedContent as BlogContent | undefined,
    imageUrls: (row.imageUrls as string[]) ?? undefined,
  }
}

// ── 공개 API ──

export async function addToQueue(item: {
  magazinePostId: string
  title: string
  category: string
  targetTime: Date
}): Promise<QueueItem | null> {
  const queue = await q()
  const existing = await queue.findFirst({
    where: {
      magazinePostId: item.magazinePostId,
      status: { in: ['PENDING', 'POSTED', 'READY_FOR_MANUAL', 'FAILED'] },
    },
  })
  if (existing) {
    console.log(`[QueueManager] 이미 큐 존재: ${item.title} (magazinePostId=${item.magazinePostId})`)
    return null
  }
  const row = await queue.create({
    data: {
      magazinePostId: item.magazinePostId,
      title: item.title,
      category: item.category,
      targetTime: item.targetTime,
      status: 'PENDING',
    },
  })
  console.log(`[QueueManager] 큐 추가: "${item.title}" targetTime=${item.targetTime.toISOString()}`)
  return toItem(row)
}

export async function expireStaleItems(): Promise<number> {
  const queue = await q()
  const threshold = new Date(Date.now() - POSTING_POLICY.expireAfterHours * 60 * 60 * 1000)
  const result = await queue.updateMany({
    where: {
      status: { in: ['PENDING', 'READY_FOR_MANUAL'] },
      targetTime: { lt: threshold },
    },
    data: { status: 'EXPIRED', expiredReason: 'stale_content' },
  })
  if (result.count > 0) console.log(`[QueueManager] Expired 처리: ${result.count}건`)
  return result.count as number
}

export async function getCatchupItem(): Promise<QueueItem | null> {
  const queue = await q()
  const row = await queue.findFirst({
    where: { status: 'PENDING', targetTime: { lte: new Date() } },
    orderBy: { targetTime: 'asc' },
  })
  return row ? toItem(row) : null
}

export async function getNextScheduledItem(): Promise<QueueItem | null> {
  const queue = await q()
  const todayStr = kstDateString()
  const startKst = new Date(`${todayStr}T00:00:00+09:00`)
  const endKst = new Date(`${todayStr}T23:59:59+09:00`)
  const row = await queue.findFirst({
    where: {
      status: 'PENDING',
      targetTime: { gte: startKst, lte: endKst },
    },
    orderBy: { targetTime: 'asc' },
  })
  return row ? toItem(row) : null
}

export async function getTodayPostedCount(): Promise<number> {
  const queue = await q()
  const todayStr = kstDateString()
  const startKst = new Date(`${todayStr}T00:00:00+09:00`)
  return queue.count({
    where: { status: 'POSTED', lastAttemptAt: { gte: startKst } },
  }) as Promise<number>
}

export async function markPosted(queueId: string, naverBlogUrl: string): Promise<void> {
  const queue = await q()
  const row = await queue.update({
    where: { queueId },
    data: { status: 'POSTED', naverBlogUrl, lastAttemptAt: new Date() },
  })
  console.log(`[QueueManager] ✅ Posted: "${row.title}" → ${naverBlogUrl}`)
}

export async function markFailed(queueId: string, reason: string): Promise<void> {
  const queue = await q()
  const current = await queue.findFirst({ where: { queueId } })
  if (!current) return

  const newRetryCount = ((current.retryCount as number) ?? 0) + 1
  const newStatus = newRetryCount >= POSTING_POLICY.maxRetries ? 'FAILED' : 'PENDING'

  await queue.update({
    where: { queueId },
    data: {
      retryCount: newRetryCount,
      lastAttemptAt: new Date(),
      expiredReason: reason,
      status: newStatus,
    },
  })

  if (newStatus === 'FAILED') {
    console.warn(`[QueueManager] ❌ Failed (maxRetries 도달): "${current.title}" — ${reason}`)
  } else {
    console.warn(`[QueueManager] ⚠️ 재시도 예정 (${newRetryCount}/${POSTING_POLICY.maxRetries}): "${current.title}"`)
  }
}

export async function shouldHalt(): Promise<boolean> {
  const queue = await q()
  const count = await queue.count({ where: { status: 'FAILED' } }) as number
  return count >= POSTING_POLICY.haltAfterFailedItems
}

export async function getQueueSummary(): Promise<{
  pending: number
  ready_for_manual: number
  posted: number
  failed: number
  expired: number
}> {
  const queue = await q()
  const [pending, ready_for_manual, posted, failed, expired] = await Promise.all([
    queue.count({ where: { status: 'PENDING' } }),
    queue.count({ where: { status: 'READY_FOR_MANUAL' } }),
    queue.count({ where: { status: 'POSTED' } }),
    queue.count({ where: { status: 'FAILED' } }),
    queue.count({ where: { status: 'EXPIRED' } }),
  ]) as [number, number, number, number, number]
  return { pending, ready_for_manual, posted, failed, expired }
}

export async function markReadyForManual(
  queueId: string,
  content: BlogContent,
  imageUrls: string[],
): Promise<void> {
  const queue = await q()
  const row = await queue.update({
    where: { queueId },
    data: {
      status: 'READY_FOR_MANUAL',
      transformedContent: content as object,
      imageUrls,
      lastAttemptAt: new Date(),
    },
  })
  console.log(`[QueueManager] 📝 Ready for manual: "${row.title}" — 이미지 ${imageUrls.length}개`)
}

export async function deleteQueueItem(queueId: string): Promise<boolean> {
  const queue = await q()
  try {
    const row = await queue.delete({ where: { queueId } })
    console.log(`[QueueManager] 🗑️ 항목 삭제: "${row.title}"`)
    return true
  } catch {
    return false
  }
}

export async function getReadyForManualItems(): Promise<QueueItem[]> {
  const queue = await q()
  const rows = await queue.findMany({
    where: { status: 'READY_FOR_MANUAL' },
    orderBy: { targetTime: 'asc' },
  })
  return rows.map(toItem)
}

export async function isQueueReadable(): Promise<boolean> {
  try {
    const queue = await q()
    await queue.count({})
    return true
  } catch {
    return false
  }
}

// 하위 호환 — 기존 코드에서 readQueue() 호출 시 빈 구조 반환
export { TO_DB, FROM_DB }
