/**
 * 네이버 카페 유래 발행글 외부 노출 차단 (PHASE 1) — 2026-08-24
 *
 * 실행:
 *   cd agents
 *   npx tsx --env-file=../.env.local scripts/hide-naver-sourced-posts.ts             # dry-run (기본, 변경 0)
 *   npx tsx --env-file=../.env.local scripts/hide-naver-sourced-posts.ts --execute   # status=HIDDEN 적용
 *
 * 하는 일 — Post.status 를 PUBLISHED/SEO_ONLY → HIDDEN 으로만 바꾼다.
 *   HIDDEN 이 되면 상세 404 · JSON-LD 미생성 · OG fallback · sitemap/search/best/
 *   topic/related/공개 API 전면 제외가 한 번에 걸린다.
 *
 * 🚫 삭제하지 않는다 — CafePost · Comment · BotLog · CommentWaveQueue ·
 *    UserPostWaveQueue 전부 미변경. Post 도 status 외 필드는 건드리지 않는다.
 * 🚫 AI 호출 0 · raw SQL 0 · migration/seed 0.
 * 🚫 원문(title/content)을 출력하지 않는다 — id·boardType·집계 수치만 찍는다.
 *
 * 대상 식별 (OR):
 *   1) cafePostId IS NOT NULL              크롤 레인 (등록 카페 6곳 전부 네이버)
 *   2) sourceSite = 'navercafe'            Google Sheet 레인
 *   3) sourceUrl CONTAINS 'cafe.naver.com' URL 직접 매칭
 *
 * 1차 대상 제외(창업자 결정 2026-08-24):
 *   - sourceSite = 'bboom' (m.bboom.naver.com) — 네이버 도메인이나 카페 아님
 *   - naver.me 단축 URL — dry-run 에서 수량만 보고하고 실행 전 재승인
 *
 * ⚠️ 캐시 무효화는 이 스크립트가 하지 않는다(next/cache 는 서버 런타임 전용).
 *    적용 후 어드민 액션 또는 배포로 revalidateTag/revalidatePath 를 태워야 한다.
 */
import type { PrismaClient } from '../../src/generated/prisma/client'
import type { PostWhereInput } from '../../src/generated/prisma/models/Post'
import { prisma as rawPrisma, disconnect } from '../core/db.js'

// core/db.ts 는 Node 20/24 동적 import 호환 때문에 client 를 Record<string, unknown> 로 둔다.
// 타입만 되살린다(런타임 동일) — collect-dashboard-snapshot.ts 와 같은 패턴.
const prisma = rawPrisma as unknown as PrismaClient

const EXECUTE = process.argv.includes('--execute')

/** 노출 중인 상태 — 이미 HIDDEN/DELETED 인 글은 건드리지 않는다. */
const VISIBLE: PostWhereInput = { status: { in: ['PUBLISHED', 'SEO_ONLY'] } }

/** 1차 대상 조건 — dry-run 과 execute 가 같은 값을 쓴다(판정이 갈리면 안 된다). */
const NAVER_SOURCED: PostWhereInput = {
  ...VISIBLE,
  OR: [
    { cafePostId: { not: null } },
    { sourceSite: 'navercafe' },
    { sourceUrl: { contains: 'cafe.naver.com' } },
  ],
}

/** 1차 대상에서 뺀 것 — 수량만 보고하고 판단은 창업자가 한다. */
const DEFERRED: Record<'bboom' | 'naverMe', PostWhereInput> = {
  bboom: { ...VISIBLE, sourceSite: 'bboom' },
  naverMe: { ...VISIBLE, sourceUrl: { contains: 'naver.me' } },
}

function line(label: string, value: number | string) {
  console.log(`  ${label.padEnd(34)} ${value}`)
}

async function main() {
  console.log(`\n${'='.repeat(62)}`)
  console.log(`네이버 유래 발행글 노출 차단 — ${EXECUTE ? '⚠️  EXECUTE' : 'DRY-RUN (변경 없음)'}`)
  console.log('='.repeat(62))

  // ── 1. 총 대상 ──────────────────────────────────────────────
  const total = await prisma.post.count({ where: NAVER_SOURCED })
  console.log('\n[1] 총 대상 (status=PUBLISHED|SEO_ONLY)')
  line('총 건수', total)

  // ── 2. 식별 경로별 (중복 포함 — 합계가 총계와 다를 수 있다) ──
  const [byCafePostId, bySourceSite, bySourceUrl] = await Promise.all([
    prisma.post.count({ where: { ...NAVER_SOURCED, cafePostId: { not: null } } }),
    prisma.post.count({ where: { ...NAVER_SOURCED, sourceSite: 'navercafe' } }),
    prisma.post.count({ where: { ...NAVER_SOURCED, sourceUrl: { contains: 'cafe.naver.com' } } }),
  ])
  console.log('\n[2] 식별 경로별 (겹칠 수 있음)')
  line('cafePostId IS NOT NULL', byCafePostId)
  line("sourceSite = 'navercafe'", bySourceSite)
  line("sourceUrl ~ 'cafe.naver.com'", bySourceUrl)

  // ── 3. board 별 ────────────────────────────────────────────
  const byBoard = await prisma.post.groupBy({
    by: ['boardType'],
    where: NAVER_SOURCED,
    _count: { _all: true },
  })
  console.log('\n[3] boardType 별')
  for (const b of [...byBoard].sort((a, z) => z._count._all - a._count._all)) {
    line(String(b.boardType), b._count._all)
  }

  // ── 4. status 별 ───────────────────────────────────────────
  const byStatus = await prisma.post.groupBy({
    by: ['status'],
    where: NAVER_SOURCED,
    _count: { _all: true },
  })
  console.log('\n[4] 현재 status 별')
  for (const s of byStatus) line(String(s.status), s._count._all)

  // ── 5. source(PostSource) 별 ───────────────────────────────
  const bySource = await prisma.post.groupBy({
    by: ['source'],
    where: NAVER_SOURCED,
    _count: { _all: true },
  })
  console.log('\n[5] PostSource 별')
  for (const s of [...bySource].sort((a, z) => z._count._all - a._count._all)) {
    line(String(s.source), s._count._all)
  }

  // ── 6. 댓글 영향 (삭제 아님 — 상세가 404 되어 렌더 경로만 사라진다) ──
  const [activeComments, botComments] = await Promise.all([
    prisma.comment.count({ where: { post: NAVER_SOURCED, status: 'ACTIVE' } }),
    prisma.comment.count({
      where: {
        post: NAVER_SOURCED,
        status: 'ACTIVE',
        author: { email: { endsWith: '@unao.bot' } },
      },
    }),
  ])
  console.log('\n[6] 댓글 영향 (🚫 삭제하지 않는다)')
  line('ACTIVE 댓글 총수', activeComments)
  line('  그중 봇 댓글(@unao.bot)', botComments)
  line('  그 외(실회원/게스트)', activeComments - botComments)

  // ── 7. 1차 제외 대상 수량 (판단 보류) ──────────────────────
  const [bboomCount, naverMeCount] = await Promise.all([
    prisma.post.count({ where: DEFERRED.bboom }),
    prisma.post.count({ where: DEFERRED.naverMe }),
  ])
  console.log('\n[7] 1차 제외 — 실행 전 재승인 대상')
  line("sourceSite = 'bboom'", bboomCount)
  line("sourceUrl ~ 'naver.me'", naverMeCount)

  // ── 8. 적용 ────────────────────────────────────────────────
  if (!EXECUTE) {
    console.log('\n' + '='.repeat(62))
    console.log('DRY-RUN 종료 — DB 변경 0건.')
    console.log('적용하려면 --execute 를 붙여 다시 실행한다.')
    console.log('='.repeat(62) + '\n')
    return
  }

  console.log('\n[8] 적용 — Post.status → HIDDEN (그 외 필드 미변경)')
  const res = await prisma.post.updateMany({
    where: NAVER_SOURCED,
    data: { status: 'HIDDEN' },
  })
  line('변경된 행', res.count)

  const remaining = await prisma.post.count({ where: NAVER_SOURCED })
  line('잔여(0이어야 정상)', remaining)

  console.log('\n⚠️  캐시 무효화가 남았다 — 이 스크립트는 하지 않는다.')
  console.log('    post-detail · post-meta · sitemap-posts · community-board-page')
  console.log('    home-* · best-* · topic-* · comments-by-post')
  console.log('='.repeat(62) + '\n')
}

main()
  .catch((err) => {
    console.error('[hide-naver-sourced-posts] 실패:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => disconnect())
