'use server'

import { prisma } from '@/lib/prisma'
import { isRealUser } from '@/lib/notify'
import { pushService } from '@/lib/push/service'
import { getAdminSession } from '@/lib/admin-auth'

interface NoticeResult {
  error?: string
  bellSent?: number
  pushSent?: number
}

/**
 * 전체 공지(인앱 종 알림) 일괄 발송.
 *
 * - 종(🔔) 알림: **전체 실고객(ACTIVE, 봇 제외) 전원**에게 생성 → 구독·마케팅 동의 무관, 웹·앱 모두 도달.
 *   (서비스성 공지라 정보통신망법 마케팅 동의 대상 아님 — 광고성 문구 금지)
 * - OS 푸시: 그중 **푸시 구독 보유자**에게 추가(category='service' → 마케팅 게이트/야간/광고표기 없음).
 * - createMany 청크(타임아웃 방지). 발송 후 되돌릴 수 없음 → 호출은 어드민 버튼에서만.
 */
export async function broadcastInAppNotice(formData: FormData): Promise<NoticeResult> {
  const session = await getAdminSession()
  if (!session) return { error: '관리자 인증이 필요합니다.' }

  const title = (formData.get('title') as string)?.trim() || '우나어 공지'
  const body = (formData.get('body') as string)?.trim()
  const url = (formData.get('url') as string)?.trim() || '/'
  const confirmed = formData.get('confirm') === 'on'

  if (!body) return { error: '공지 내용을 입력해 주세요' }
  if (body.length > 200) return { error: '내용은 200자 이내로 입력해 주세요' }
  if (!confirmed) return { error: '전체 발송 확인란을 체크해 주세요' }

  // 1. 대상: ACTIVE 실고객(providerId 순수숫자) — 봇 제외
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, providerId: true },
  })
  const realIds = users.filter(u => isRealUser(u.providerId)).map(u => u.id)
  if (realIds.length === 0) return { error: '발송 대상 회원이 없습니다' }

  // 2. 종 알림 전원 — createMany 청크(시드니 DB 왕복 고려, 루프-단건 금지)
  const BELL_CHUNK = 500
  for (let i = 0; i < realIds.length; i += BELL_CHUNK) {
    await prisma.notification.createMany({
      data: realIds.slice(i, i + BELL_CHUNK).map(id => ({
        userId: id,
        type: 'SYSTEM' as const,
        content: body,
      })),
    })
  }

  // 3. OS 푸시 — 구독 보유 실고객에게(service 타입: 마케팅 동의 무관)
  const subscribed = await prisma.user.findMany({
    where: { id: { in: realIds }, pushSubscriptions: { some: {} } },
    select: { id: true },
  })
  const pushIds = subscribed.map(s => s.id)
  const PUSH_CHUNK = 100
  for (let i = 0; i < pushIds.length; i += PUSH_CHUNK) {
    await Promise.allSettled(
      pushIds.slice(i, i + PUSH_CHUNK).map(id =>
        pushService.notify(id, { title, body, url, tag: 'notice' }, 'notice', 'service'),
      ),
    )
  }

  return { bellSent: realIds.length, pushSent: pushIds.length }
}

/**
 * 테스트 발송 — 닉네임으로 지정한 본인 회원 계정 1명에게만 종+푸시.
 * (어드민 계정 ≠ 회원 계정이라, 테스트 받을 본인 닉네임을 입력받는다.)
 */
export async function sendNoticeTest(formData: FormData): Promise<{ error?: string; ok?: string }> {
  const session = await getAdminSession()
  if (!session) return { error: '관리자 인증이 필요합니다.' }

  const title = (formData.get('title') as string)?.trim() || '우나어 공지'
  const body = (formData.get('body') as string)?.trim()
  const url = (formData.get('url') as string)?.trim() || '/'
  const nickname = (formData.get('testNickname') as string)?.trim()

  if (!body) return { error: '공지 내용을 먼저 입력해 주세요' }
  if (!nickname) return { error: '테스트 받을 본인 닉네임을 입력해 주세요' }

  const user = await prisma.user.findUnique({
    where: { nickname },
    select: { id: true, nickname: true, providerId: true, status: true, _count: { select: { pushSubscriptions: true } } },
  })
  if (!user || user.status !== 'ACTIVE') return { error: `'${nickname}' 회원을 찾을 수 없어요` }
  if (!isRealUser(user.providerId)) return { error: '실고객 계정이 아니에요(봇/관리자 계정 불가)' }

  await prisma.notification.create({ data: { userId: user.id, type: 'SYSTEM', content: body } })
  await pushService.notify(user.id, { title, body, url, tag: 'notice' }, 'notice', 'service').catch(() => {})

  const hasPush = user._count.pushSubscriptions > 0
  return {
    ok: `${user.nickname}님에게 종 알림 발송${hasPush ? ' + OS 푸시 발송' : ' (이 계정은 푸시 미구독 → 종 알림만 옴)'} 완료`,
  }
}
