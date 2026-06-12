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

export interface PushTargetUser {
  id: string
  nickname: string
  grade: Grade
  hasSubscription: boolean   // 푸시 구독 보유(발송 가능) 여부
  marketingOptIn: boolean    // 마케팅 수신 동의(광고 발송 가능) 여부
}

interface ResolveInput {
  targetMode: 'all' | 'grade' | 'user'
  targetGrade: string
  targetUserIds: string[]
  isAd: boolean
}

/** 발송 조건 → 실제 수신자 userId 목록 (구독 보유자만 + 광고면 마케팅 동의자만). count·send 공용. */
async function resolveRecipients({ targetMode, targetGrade, targetUserIds, isAd }: ResolveInput): Promise<string[]> {
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

  const chunkSize = 100
  let sent = 0
  for (let i = 0; i < recipients.length; i += chunkSize) {
    const chunk = recipients.slice(i, i + chunkSize)
    await Promise.allSettled(
      chunk.map((uid) =>
        pushService.notify(uid, { title, body, url, tag: 'broadcast' }, 'broadcast', isAd ? 'ad' : 'service')
      )
    )
    sent += chunk.length
  }

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
