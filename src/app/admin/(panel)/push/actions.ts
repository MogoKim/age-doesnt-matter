'use server'

import { prisma } from '@/lib/prisma'
import { isRealUser } from '@/lib/notify'
import { getAdminSession } from '@/lib/admin-auth'
import type { Grade } from '@/generated/prisma/client'
import { resolveRecipients, sendToRecipients, type ResolveInput } from './_dispatch'

interface BroadcastResult {
  error?: string
  sent?: number
}

export interface PushTargetUser {
  id: string
  nickname: string
  grade: Grade
  hasSubscription: boolean   // 푸시 구독 보유(발송 가능) 여부
  marketingOptIn: boolean    // 마케팅 수신 동의(광고 발송 가능) 여부
}

export interface ScheduledPushItem {
  id: string
  title: string
  body: string
  url: string
  messageType: string
  targetMode: string
  targetGrade: string
  targetUserIds: string[]
  scheduledAt: string       // ISO
  status: string
  sentCount: number | null
  sentAt: string | null     // ISO
  error: string | null
}

export async function adminBroadcastPush(formData: FormData): Promise<BroadcastResult> {
  // 보안 가드: 비인증 호출 차단 (Server Action은 미들웨어 우회 가능 → 액션 내부 인증 필수)
  const session = await getAdminSession()
  if (!session) return { error: '관리자 인증이 필요합니다.' }

  const title = (formData.get('title') as string)?.trim()
  const body = (formData.get('body') as string)?.trim()
  const url = (formData.get('url') as string)?.trim() || '/'
  const targetGrade = (formData.get('targetGrade') as string) || 'ALL'
  const targetMode = ((formData.get('targetMode') as string) || 'all') as ResolveInput['targetMode']
  const isAd = (formData.get('messageType') as string) === 'ad'
  let targetUserIds: string[] = []
  try { targetUserIds = JSON.parse((formData.get('targetUserIds') as string) || '[]') } catch { /* noop */ }

  if (!title || !body) return { error: '제목과 내용을 입력해 주세요' }
  if (title.length > 50) return { error: '제목은 50자 이내로 입력해 주세요' }
  if (body.length > 120) return { error: '내용은 120자 이내로 입력해 주세요' }
  if (targetMode === 'user' && targetUserIds.length === 0) return { error: '발송할 회원을 1명 이상 선택해 주세요' }

  // 실제 수신자(구독 보유 + 광고면 동의자) 확정 후 발송 → sent는 정확한 도달 대상 수
  const recipients = await resolveRecipients({ targetMode, targetGrade, targetUserIds, isAd })
  if (recipients.length === 0) {
    return { error: isAd ? '조건에 맞는 수신자가 없어요(구독+마케팅 동의 필요)' : '조건에 맞는 구독자가 없어요' }
  }

  const sent = await sendToRecipients(recipients, { title, body, url, tag: 'broadcast' }, isAd)

  // OS 푸시 발송 이력 — 종 알림과 같은 "공지 발송 이력"에 표시.
  // sentBell=0 → OS 푸시 직접발송으로 구분(종 알림은 sentBell>0). 읽음/클릭은 종 알림만 추적(OS는 별도 설계).
  await prisma.notice
    .create({ data: { title, body, url, sentBell: 0, sentPush: sent, createdByAdminId: session.adminId } })
    .catch(() => {}) // 이력 기록 실패가 발송 결과를 막지 않게

  return { sent }
}

/** 닉네임 검색 — 특정 회원 발송 대상 선택용. 실고객·ACTIVE 상위 20명 + 구독/동의 상태. */
export async function searchPushTargets(query: string): Promise<PushTargetUser[]> {
  const session = await getAdminSession()
  if (!session) return []
  const q = (query || '').trim()
  if (q.length < 1) return []

  const rows = await prisma.user.findMany({
    where: { status: 'ACTIVE', nickname: { contains: q, mode: 'insensitive' } },
    select: {
      id: true, nickname: true, grade: true, providerId: true, marketingOptIn: true,
      _count: { select: { pushSubscriptions: true } },
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  })
  return rows
    .filter((u) => isRealUser(u.providerId))
    .map((u) => ({
      id: u.id,
      nickname: u.nickname,
      grade: u.grade,
      hasSubscription: u._count.pushSubscriptions > 0,
      marketingOptIn: u.marketingOptIn,
    }))
}

/** 예상 수신자 수 — 대상/유형 미리보기. (실제 발송과 동일 조건) */
export async function countPushRecipients(input: ResolveInput): Promise<number> {
  const session = await getAdminSession()
  if (!session) return 0
  const recipients = await resolveRecipients(input)
  return recipients.length
}

// ── 예약 발송(1회성) ──

/** 예약 등록 — scheduledAt(ISO UTC, 폼에서 변환)에 PENDING으로 저장. 실제 발송은 크론 디스패치가 처리. */
export async function schedulePush(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const session = await getAdminSession()
  if (!session) return { error: '관리자 인증이 필요합니다.' }

  const title = (formData.get('title') as string)?.trim()
  const body = (formData.get('body') as string)?.trim()
  const url = (formData.get('url') as string)?.trim() || '/'
  const targetGrade = (formData.get('targetGrade') as string) || 'ALL'
  const targetMode = ((formData.get('targetMode') as string) || 'all') as ResolveInput['targetMode']
  const isAd = (formData.get('messageType') as string) === 'ad'
  const scheduledAtRaw = (formData.get('scheduledAt') as string) || ''
  let targetUserIds: string[] = []
  try { targetUserIds = JSON.parse((formData.get('targetUserIds') as string) || '[]') } catch { /* noop */ }

  if (!title || !body) return { error: '제목과 내용을 입력해 주세요' }
  if (title.length > 50) return { error: '제목은 50자 이내로 입력해 주세요' }
  if (body.length > 120) return { error: '내용은 120자 이내로 입력해 주세요' }
  if (targetMode === 'user' && targetUserIds.length === 0) return { error: '발송할 회원을 1명 이상 선택해 주세요' }

  const when = new Date(scheduledAtRaw)
  if (isNaN(when.getTime())) return { error: '예약 시각이 올바르지 않아요' }
  if (when.getTime() < Date.now() + 4 * 60 * 1000) return { error: '예약은 지금부터 최소 5분 뒤로 잡아 주세요' }

  await prisma.scheduledPush.create({
    data: {
      title, body, url,
      messageType: isAd ? 'ad' : 'service',
      targetMode, targetGrade,
      targetUserIds: targetMode === 'user' ? targetUserIds : [],
      scheduledAt: when,
      createdBy: session.adminId,
    },
  })
  return { ok: true }
}

/** 예약 목록 — 예정(PENDING) 우선 + 최근 처리분. 직렬화(Date→ISO). */
export async function listScheduledPushes(): Promise<ScheduledPushItem[]> {
  const session = await getAdminSession()
  if (!session) return []
  const rows = await prisma.scheduledPush.findMany({
    orderBy: { scheduledAt: 'desc' },
    take: 30,
  })
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    url: r.url,
    messageType: r.messageType,
    targetMode: r.targetMode,
    targetGrade: r.targetGrade,
    targetUserIds: r.targetUserIds,
    scheduledAt: r.scheduledAt.toISOString(),
    status: r.status,
    sentCount: r.sentCount,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    error: r.error,
  }))
}

/** 예약 취소 — PENDING만 취소 가능. */
export async function cancelScheduledPush(id: string): Promise<{ error?: string; ok?: boolean }> {
  const session = await getAdminSession()
  if (!session) return { error: '관리자 인증이 필요합니다.' }
  const row = await prisma.scheduledPush.findUnique({ where: { id } })
  if (!row) return { error: '예약을 찾을 수 없어요' }
  if (row.status !== 'PENDING') return { error: '이미 발송됐거나 취소된 예약이에요' }
  await prisma.scheduledPush.update({ where: { id }, data: { status: 'CANCELED' } })
  return { ok: true }
}
