import { prisma } from '@/lib/prisma'

/**
 * 내부(창업자/어드민) 트래픽 식별 — 대시보드 "실고객" 지표에서 제외용.
 *
 * 배경: 창업자 본인이 로그아웃 상태로 사이트를 둘러보면 비회원으로,
 * 로그인 상태면 실회원으로 집계돼 일일 UV·리텐션 절대값이 과대해진다.
 * 기존 제외는 수동 localStorage 플래그(`unao_internal`)에만 의존 → 새 기기·시크릿엔 미적용.
 * 여기서는 플래그 없이도 잡히는 자동 신호 두 가지를 제공한다.
 *
 *  - 세션: `/admin` 경로 접근(인증된 어드민=창업자만 가능) 또는 botType='founder'(플래그) 세션
 *  - 회원: role=ADMIN 유저
 */

/** 기간 내 내부 세션 id 집합 (/admin 경로 접근 또는 founder 플래그). */
export async function getInternalSessionIds(since: Date): Promise<Set<string>> {
  const rows = await prisma.eventLog.findMany({
    where: {
      sessionId: { not: null },
      createdAt: { gte: since },
      OR: [{ path: { startsWith: '/admin' } }, { botType: 'founder' }],
    },
    select: { sessionId: true },
    distinct: ['sessionId'],
  })
  return new Set(rows.map((r) => r.sessionId).filter((s): s is string => !!s))
}

/** 어드민(창업자) 유저 id 집합 — 회원측 지표에서 제외용. */
export async function getAdminUserIds(): Promise<Set<string>> {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } })
  return new Set(admins.map((u) => u.id))
}
