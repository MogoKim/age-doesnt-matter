/**
 * 갱년기 톡(MENOPAUSE) 확정 30건 이동 스크립트 (PR-M1)
 *
 * 대상·매핑의 단일 소스: src/lib/moved-posts.ts (창업자 승인본 — 여기서 임의 추가/변경 금지)
 *
 * 동작:
 *   - 기본 = **dry-run**: DB를 읽기만 하고 이동 계획표 출력 (write 0)
 *   - `--apply` 명시 시에만 실제 이동:
 *       1) 이동 직전 30건 현재값을 백업 JSON으로 저장 (scripts/data/menopause-move-backup-{ts}.json)
 *          — 항목: id, slug, title, boardType, category, updatedAt (롤백 스크립트 입력)
 *       2) $transaction으로 boardType=MENOPAUSE + category=매핑값 update
 *          — slug/id/author/createdAt/댓글/좋아요/조회수 불변. updatedAt은 Prisma @updatedAt으로 갱신됨(허용).
 *
 * 사용법:
 *   npx tsx scripts/move-menopause-posts.ts           # dry-run (기본)
 *   npx tsx scripts/move-menopause-posts.ts --apply   # 실제 이동 (/careful 승인 후에만)
 *
 * 안전 가드: 대상이 STORY·PUBLISHED·slug 일치가 아니면 해당 건 skip 후 보고(이미 이동됐거나 상태 변경된 글 재이동 방지).
 */
import { config } from 'dotenv'
config({ path: process.env.QA_ENV_FILE || '.env.local' })
import { writeFileSync, mkdirSync } from 'fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { MENOPAUSE_MOVED_POSTS } from '../src/lib/moved-posts'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL })
const prisma = new PrismaClient({ adapter })

const APPLY = process.argv.includes('--apply')

async function main() {
  console.log(`[MoveMenopause] 모드: ${APPLY ? '⚠️ APPLY (실제 이동)' : 'dry-run (write 0)'} — 대상 ${MENOPAUSE_MOVED_POSTS.length}건`)

  const rows = await prisma.post.findMany({
    where: { id: { in: MENOPAUSE_MOVED_POSTS.map((p) => p.id) } },
    select: { id: true, slug: true, title: true, boardType: true, category: true, source: true, status: true, updatedAt: true, commentCount: true, viewCount: true },
  })
  const byId = new Map(rows.map((r) => [r.id, r]))

  const ok: typeof MENOPAUSE_MOVED_POSTS[number][] = []
  const skip: string[] = []
  for (const p of MENOPAUSE_MOVED_POSTS) {
    const db = byId.get(p.id)
    if (!db) { skip.push(`${p.id} DB 미존재`); continue }
    if (db.boardType !== 'STORY') { skip.push(`${p.id} boardType=${db.boardType} (이미 이동?)`); continue }
    if (db.status !== 'PUBLISHED') { skip.push(`${p.id} status=${db.status}`); continue }
    if (db.slug !== p.slug) { skip.push(`${p.id} slug 불일치 (DB=${db.slug})`); continue }
    if (db.source === 'USER' || db.source === 'ADMIN') { skip.push(`${p.id} source=${db.source} (이동 금지)`); continue }
    ok.push(p)
    console.log(`  ✓ [${p.newCategory}] (${db.source}/${db.category}) 💬${db.commentCount} ${p.title.slice(0, 36)}`)
  }
  const dist: Record<string, number> = {}
  for (const p of ok) dist[p.newCategory] = (dist[p.newCategory] ?? 0) + 1
  console.log(`\n이동 가능 ${ok.length}건 / skip ${skip.length}건 ${skip.length ? '\n  - ' + skip.join('\n  - ') : ''}`)
  console.log('카테고리 분포:', JSON.stringify(dist))

  if (!APPLY) { console.log('\n[MoveMenopause] dry-run 종료 — 이동하려면 --apply'); return }

  // ── APPLY: 백업 → 트랜잭션 이동 ──
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = ok.map((p) => {
    const db = byId.get(p.id)!
    return { id: db.id, slug: db.slug, title: db.title, boardType: db.boardType, category: db.category, updatedAt: db.updatedAt.toISOString() }
  })
  mkdirSync('scripts/data', { recursive: true })
  const backupPath = `scripts/data/menopause-move-backup-${ts}.json`
  writeFileSync(backupPath, JSON.stringify(backup, null, 2))
  console.log(`\n[MoveMenopause] 백업 저장: ${backupPath} (${backup.length}건)`)

  const result = await prisma.$transaction(
    ok.map((p) =>
      prisma.post.update({
        where: { id: p.id, boardType: 'STORY', status: 'PUBLISHED' }, // 재검증 조건부 update
        data: { boardType: 'MENOPAUSE', category: p.newCategory },
      }),
    ),
  )
  console.log(`[MoveMenopause] ✅ 이동 완료: ${result.length}건 (boardType→MENOPAUSE, category→매핑값, updatedAt 자동 갱신)`)
  console.log('[MoveMenopause] 다음: revalidate는 ISR TTL(300s)로 자연 반영 — 즉시 필요 시 어드민 revalidate 사용')
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0) })
  .catch(async (e) => { console.error('[MoveMenopause] 오류:', e); await prisma.$disconnect(); process.exit(1) })
