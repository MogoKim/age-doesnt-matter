import { prisma } from '@/lib/prisma'

/**
 * 페르소나 계정별 "마지막으로 쓴 글" 조회 — 페르소나 발행 화면에서
 * 어느 이름이 오래 안 쓰였는지 보여주기 위한 read-only 쿼리.
 *
 * ## 쿼리 수는 페르소나 수와 무관하게 항상 2개다 (N+1 아님)
 *
 *  1. `groupBy(authorId)` → 계정별 마지막 작성 시각. `@@index([authorId])`를 탄다.
 *     후보가 289명이어도 쿼리 1회다.
 *  2. 1에서 나온 (authorId, createdAt) 쌍으로 제목·게시판을 한 번에 가져온다.
 *     OR 가지 수 = "글을 쓴 적 있는 페르소나 수"이지 전체 후보 수가 아니다.
 *
 * 계정별로 findFirst를 도는 구현은 후보 수만큼 쿼리가 늘어나므로 쓰지 않는다.
 */
export interface PersonaRecentUse {
  lastPostedAt: Date
  /** 1번 쿼리에는 있고 2번에서 못 찾은 경우(그 사이 삭제 등) null */
  lastTitle: string | null
  lastBoardType: string | null
}

export async function getPersonaRecentUsage(
  userIds: readonly string[],
): Promise<Map<string, PersonaRecentUse>> {
  const result = new Map<string, PersonaRecentUse>()
  if (userIds.length === 0) return result

  const ids = [...userIds]

  // ① 계정별 마지막 작성 시각
  const lastByAuthor = await prisma.post.groupBy({
    by: ['authorId'],
    where: { authorId: { in: ids }, status: { not: 'DELETED' } },
    _max: { createdAt: true },
  })

  const pairs = lastByAuthor
    .map((row) => ({ authorId: row.authorId, createdAt: row._max.createdAt }))
    .filter((p): p is { authorId: string; createdAt: Date } => p.createdAt !== null)

  if (pairs.length === 0) return result

  for (const p of pairs) {
    result.set(p.authorId, { lastPostedAt: p.createdAt, lastTitle: null, lastBoardType: null })
  }

  // ② 그 시각의 글에서 제목·게시판만 채운다
  const rows = await prisma.post.findMany({
    where: { OR: pairs.map((p) => ({ authorId: p.authorId, createdAt: p.createdAt })) },
    select: { authorId: true, title: true, boardType: true, createdAt: true },
  })

  for (const row of rows) {
    const entry = result.get(row.authorId)
    // 같은 시각 글이 둘이면 먼저 만난 것을 쓴다 — 표시용이라 어느 쪽이든 무방하다.
    if (entry && entry.lastTitle === null) {
      entry.lastTitle = row.title
      entry.lastBoardType = row.boardType
    }
  }

  return result
}
