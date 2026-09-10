import { prisma } from '@/lib/prisma'

/**
 * 페르소나 계정별 "마지막으로 공개된 글" 조회 — 페르소나 발행 화면에서
 * 어느 이름이 오래 안 쓰였는지 보여주기 위한 read-only 쿼리.
 *
 * ## 공개된 글만 센다
 * `status='PUBLISHED'` + `publishedAt` 기준이다. DRAFT·HIDDEN·SEO_ONLY·DELETED는
 * 회원에게 보이지 않으므로 "이 페르소나를 최근에 썼다"의 근거가 될 수 없다.
 * 작성 시각(`createdAt`)이 아니라 **공개 시각(`publishedAt`)**을 쓴다 — 둘은 다를 수 있다.
 *
 * ## 쿼리 수는 페르소나 수와 무관하게 항상 2개다 (N+1 아님)
 *
 *  1. `groupBy(authorId)` → 계정별 마지막 공개 시각. `@@index([authorId])`를 탄다.
 *  2. 1에서 나온 (authorId, publishedAt) 쌍으로 제목·게시판을 한 번에 가져온다.
 *     OR 가지 수 = "공개 글이 있는 페르소나 수"이지 전체 후보 수가 아니다.
 *
 * 계정별로 findFirst를 도는 구현은 후보 수만큼 쿼리가 늘어나므로 쓰지 않는다.
 */
export interface PersonaRecentUse {
  lastPostedAt: Date
  /** 1번 쿼리에는 있고 2번에서 못 찾은 경우(그 사이 숨김·삭제 등) null */
  lastTitle: string | null
  lastBoardType: string | null
}

export async function getPersonaRecentUsage(
  userIds: readonly string[],
): Promise<Map<string, PersonaRecentUse>> {
  const result = new Map<string, PersonaRecentUse>()
  if (userIds.length === 0) return result

  const ids = [...userIds]

  // ① 계정별 마지막 공개 시각
  const lastByAuthor = await prisma.post.groupBy({
    by: ['authorId'],
    where: { authorId: { in: ids }, status: 'PUBLISHED', publishedAt: { not: null } },
    _max: { publishedAt: true },
  })

  const pairs = lastByAuthor
    .map((row) => ({ authorId: row.authorId, publishedAt: row._max.publishedAt }))
    .filter((p): p is { authorId: string; publishedAt: Date } => p.publishedAt !== null)

  if (pairs.length === 0) return result

  for (const p of pairs) {
    result.set(p.authorId, { lastPostedAt: p.publishedAt, lastTitle: null, lastBoardType: null })
  }

  // ② 그 시각의 공개 글에서 제목·게시판만 채운다
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      OR: pairs.map((p) => ({ authorId: p.authorId, publishedAt: p.publishedAt })),
    },
    select: { authorId: true, title: true, boardType: true, publishedAt: true },
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
