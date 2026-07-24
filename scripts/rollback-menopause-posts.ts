/**
 * 갱년기 톡 이동 롤백 스크립트 (PR-M1)
 *
 * 입력: move-menopause-posts.ts --apply가 생성한 백업 JSON
 * 동작: 백업의 boardType/category로 원복 (조건: 현재 boardType=MENOPAUSE인 글만 — 이중 롤백 방지)
 * ⚠️ updatedAt은 Prisma @updatedAt 특성상 원복 시 **다시 갱신**된다(백업의 원 updatedAt으로 되돌리지 않음 — raw SQL 금지 정책).
 *
 * 사용법:
 *   npx tsx scripts/rollback-menopause-posts.ts scripts/data/menopause-move-backup-<ts>.json           # dry-run
 *   npx tsx scripts/rollback-menopause-posts.ts scripts/data/menopause-move-backup-<ts>.json --apply   # 실제 원복
 */
import { config } from 'dotenv'
config({ path: process.env.QA_ENV_FILE || '.env.local' })
import { readFileSync } from 'fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? process.env.DIRECT_URL })
const prisma = new PrismaClient({ adapter })

const backupPath = process.argv[2]
const APPLY = process.argv.includes('--apply')

interface BackupRow { id: string; slug: string; title: string; boardType: string; category: string | null; updatedAt: string }

async function main() {
  if (!backupPath || !backupPath.endsWith('.json')) {
    console.error('사용법: npx tsx scripts/rollback-menopause-posts.ts <백업.json> [--apply]')
    process.exit(1)
  }
  const backup: BackupRow[] = JSON.parse(readFileSync(backupPath, 'utf-8'))
  console.log(`[Rollback] 모드: ${APPLY ? '⚠️ APPLY (실제 원복)' : 'dry-run'} — 백업 ${backup.length}건 (${backupPath})`)

  const rows = await prisma.post.findMany({
    where: { id: { in: backup.map((b) => b.id) } },
    select: { id: true, boardType: true, category: true },
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const targets = backup.filter((b) => byId.get(b.id)?.boardType === 'MENOPAUSE')
  const skipped = backup.length - targets.length
  for (const b of targets) console.log(`  ↩︎ ${b.id} → boardType=${b.boardType}, category=${b.category} (${b.title.slice(0, 30)})`)
  console.log(`원복 대상 ${targets.length}건 / skip ${skipped}건(이미 MENOPAUSE 아님)`)

  if (!APPLY) { console.log('[Rollback] dry-run 종료 — 원복하려면 --apply'); return }

  const result = await prisma.$transaction(
    targets.map((b) =>
      prisma.post.update({
        where: { id: b.id, boardType: 'MENOPAUSE' },
        data: { boardType: b.boardType as never, category: b.category },
      }),
    ),
  )
  console.log(`[Rollback] ✅ 원복 완료: ${result.length}건 — ⚠️ updatedAt은 재갱신됨(원값 미복원, 정책상 raw SQL 금지)`)
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0) })
  .catch(async (e) => { console.error('[Rollback] 오류:', e); await prisma.$disconnect(); process.exit(1) })
