/**
 * P1-3 Community Slug Backfill — Dry-run + Write (샘플 10건 / 배치 100건)
 *
 * dry-run (기본값):
 *   npx tsx scripts/backfill-community-slug.ts              # 50건
 *   npx tsx scripts/backfill-community-slug.ts --limit 20   # 20건
 *   npx tsx scripts/backfill-community-slug.ts --csv        # CSV 저장
 *
 * write 샘플 (--limit ≤10):
 *   npx tsx scripts/backfill-community-slug.ts --write --limit 10 --confirm-write-sample
 *
 * write 배치 (--limit ≤100):
 *   npx tsx scripts/backfill-community-slug.ts --write --limit 100 --confirm-write-batch --csv
 */
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any
const BOARDS = ['STORY', 'HUMOR', 'LIFE2']

// ── args parsing ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)

const isWrite         = args.includes('--write')
const isConfirmSample = args.includes('--confirm-write-sample')
const isConfirmBatch  = args.includes('--confirm-write-batch')

if (isWrite && !isConfirmSample && !isConfirmBatch) {
  console.error('[Backfill] ❌ --write requires --confirm-write-sample (≤10건) or --confirm-write-batch (≤100건).')
  process.exitCode = 1
  process.exit(1)
}

function getArg(flag: string, defaultVal: number): number {
  const idx = args.indexOf(flag)
  if (idx < 0) return defaultVal
  const val = parseInt(args[idx + 1] ?? String(defaultVal), 10)
  return isNaN(val) ? defaultVal : val
}

const limit   = getArg('--limit',  50)
const offset  = getArg('--offset', 0)
const csvMode = args.includes('--csv')

if (isWrite && isConfirmSample && !isConfirmBatch && limit > 10) {
  console.error(`[Backfill] ❌ --confirm-write-sample: --limit must not exceed 10. Got: ${limit}`)
  process.exitCode = 1
  process.exit(1)
}

if (isWrite && isConfirmBatch && limit > 100) {
  console.error(`[Backfill] ❌ --confirm-write-batch: --limit must not exceed 100. Got: ${limit}`)
  process.exitCode = 1
  process.exit(1)
}

// ── in-batch duplicate tracker ────────────────────────────────────────────────
const assignedInBatch = new Set<string>()

interface SlugResult {
  slug: string
  isFallback: boolean
  hasSuffix: boolean
  isTruncated: boolean
}

async function computeExpectedSlug(title: string): Promise<SlugResult> {
  const rawBase = title.replace(/[^\w\s가-힣]/g, '').trim()
  const expanded = rawBase.replace(/\s+/g, '-')
  const isTruncated = expanded.length > 50
  const base = expanded.slice(0, 50)

  if (!base) {
    const fallback = `post-${Date.now()}`
    assignedInBatch.add(fallback)
    return { slug: fallback, isFallback: true, hasSuffix: false, isTruncated: false }
  }

  const suffixes = ['', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9']
  for (const sfx of suffixes) {
    const candidate = base + sfx
    if (assignedInBatch.has(candidate)) continue
    const exists = await p.post.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!exists) {
      assignedInBatch.add(candidate)
      return { slug: candidate, isFallback: false, hasSuffix: sfx !== '', isTruncated }
    }
  }

  const tsSlug = `${base}-${Date.now()}`
  assignedInBatch.add(tsSlug)
  return { slug: tsSlug, isFallback: false, hasSuffix: true, isTruncated }
}

// ── row types ─────────────────────────────────────────────────────────────────
interface CsvRow {
  id: string
  boardType: string
  source: string
  createdAt: string
  title: string
  expectedSlug: string
  slugLength: number
  isFallback: boolean
  hasSuffix: boolean
  isTruncated: boolean
}

interface WriteLogRow {
  id: string
  boardType: string
  source: string
  createdAt: string
  title: string
  oldSlug: string
  newSlug: string
  updatedAt: string
}

type PostRow = { id: string; boardType: string; source: string; createdAt: Date; title: string }

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const modeLabel = isWrite ? '⚠️  WRITE MODE' : '✅ DB write 없음'
  console.log(`\n[Backfill ${isWrite ? 'Write' : 'DryRun'}] ${modeLabel} | limit=${limit} offset=${offset} csv=${csvMode}`)

  const totalTarget: number = await p.post.count({
    where: { boardType: { in: BOARDS }, status: 'PUBLISHED', slug: null },
  })
  console.log(`[Backfill] slug=null 전체 대상: ${totalTarget}건\n`)

  const posts: PostRow[] = await p.post.findMany({
    where: { boardType: { in: BOARDS }, status: 'PUBLISHED', slug: null },
    orderBy: { createdAt: 'asc' },
    skip: offset,
    take: limit,
    select: { id: true, boardType: true, source: true, createdAt: true, title: true },
  })

  if (posts.length === 0) {
    console.log('[Backfill] 처리할 대상이 없습니다.')
    return
  }

  const H = (s: string, w: number) => s.slice(0, w).padEnd(w)

  // ── WRITE MODE ───────────────────────────────────────────────────────────────
  if (isWrite) {
    // Phase 1: 모든 slug 사전 계산 (DB write 없음)
    console.log('[Backfill Write] Phase 1: 예상 slug 계산 중...')
    const preview: Array<{ post: PostRow; slug: string; result: SlugResult }> = []
    for (const post of posts) {
      const result = await computeExpectedSlug(post.title)
      preview.push({ post, slug: result.slug, result })
    }

    // 사전 확인 테이블
    console.log('\n[Backfill Write] ⚠️  다음 대상에 slug를 부여합니다:')
    console.log(
      H('idx', 5) + H('id(끝8)', 10) + H('board', 8) + H('src', 8) +
      H('date', 12) + H('newSlug', 52) + H('len', 5) + 'suffix'
    )
    console.log('─'.repeat(110))
    for (let i = 0; i < preview.length; i++) {
      const { post, slug, result } = preview[i]
      console.log(
        H(String(offset + i + 1), 5) +
        H(post.id.slice(-8), 10) +
        H(post.boardType, 8) +
        H(post.source, 8) +
        H(post.createdAt.toISOString().slice(0, 10), 12) +
        H(slug, 52) +
        H(String(slug.length), 5) +
        (result.hasSuffix ? '✓' : '')
      )
    }
    console.log()

    // Phase 2: 실제 DB write
    console.log('[Backfill Write] Phase 2: DB slug 업데이트 시작...')
    const writeLogs: WriteLogRow[] = []
    let writeCount = 0

    for (const { post, slug } of preview) {
      await p.post.update({ where: { id: post.id }, data: { slug } })
      const updatedAt = new Date().toISOString()
      writeLogs.push({
        id: post.id,
        boardType: post.boardType,
        source: post.source,
        createdAt: post.createdAt.toISOString().slice(0, 10),
        title: post.title,
        oldSlug: 'null',
        newSlug: slug,
        updatedAt,
      })
      writeCount++
      console.log(`  [${writeCount}/${preview.length}] ${post.id.slice(-8)} → ${slug}`)
    }

    // 사후 검증: slug=null 감소 확인
    const afterTotal: number = await p.post.count({
      where: { boardType: { in: BOARDS }, status: 'PUBLISHED', slug: null },
    })
    const decreased = totalTarget - afterTotal

    console.log('\n' + '═'.repeat(80))
    console.log('[Backfill Write] ✅ 완료')
    console.log('═'.repeat(80))
    console.log(`slug 부여:  ${writeCount}건`)
    console.log(`slug=null:  ${totalTarget}건 → ${afterTotal}건 (감소: ${decreased}건)`)
    if (decreased !== writeCount) {
      console.error(`[Backfill Write] ⚠️  감소량 불일치: 예상 ${writeCount}건 / 실제 ${decreased}건`)
    } else {
      console.log('✅ slug=null 감소량 일치')
    }

    // write 로그 CSV (rollback용)
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const logPath = join(__dirname, `backfill-community-slug-write-sample-${ts}.csv`)
    const header = 'id,boardType,source,createdAt,title,oldSlug,newSlug,updatedAt'
    const lines = writeLogs.map(r =>
      [r.id, r.boardType, r.source, r.createdAt,
       `"${r.title.replace(/"/g, '""')}"`,
       r.oldSlug, r.newSlug, r.updatedAt,
      ].join(',')
    )
    writeFileSync(logPath, [header, ...lines].join('\n'), 'utf-8')
    console.log(`\n📄 Rollback 로그: ${logPath}`)
    return
  }

  // ── DRY-RUN MODE ─────────────────────────────────────────────────────────────
  console.log(
    H('idx', 5) + H('id(끝8)', 10) + H('board', 8) + H('src', 8) +
    H('date', 12) + H('expectedSlug', 52) + H('len', 5) + H('fallback', 10) + 'suffix'
  )
  console.log('─'.repeat(120))

  const csvRows: CsvRow[] = []
  let fallbackCount = 0
  let suffixCount = 0
  let truncateCount = 0
  const boardCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    const result = await computeExpectedSlug(post.title)
    const { slug, isFallback, hasSuffix, isTruncated } = result

    if (isFallback)  fallbackCount++
    if (hasSuffix)   suffixCount++
    if (isTruncated) truncateCount++
    boardCounts[post.boardType] = (boardCounts[post.boardType] ?? 0) + 1
    sourceCounts[post.source]   = (sourceCounts[post.source]   ?? 0) + 1

    console.log(
      H(String(offset + i + 1), 5) +
      H(post.id.slice(-8), 10) +
      H(post.boardType, 8) +
      H(post.source, 8) +
      H(post.createdAt.toISOString().slice(0, 10), 12) +
      H(slug, 52) +
      H(String(slug.length), 5) +
      H(isFallback ? '⚠️ fallback' : '', 10) +
      (hasSuffix ? '✓' : '')
    )

    csvRows.push({
      id: post.id,
      boardType: post.boardType,
      source: post.source,
      createdAt: post.createdAt.toISOString().slice(0, 10),
      title: post.title,
      expectedSlug: slug,
      slugLength: slug.length,
      isFallback,
      hasSuffix,
      isTruncated,
    })
  }

  console.log('\n' + '═'.repeat(80))
  console.log('[Backfill DryRun] 결과 요약')
  console.log('═'.repeat(80))
  console.log(`전체 대상:       ${totalTarget}건`)
  console.log(`이번 처리:       ${posts.length}건`)
  console.log(`fallback 발생:   ${fallbackCount}건  (title이 빈 경우 post-{ts} 사용)`)
  console.log(`suffix 발생:     ${suffixCount}건  (중복으로 인해 -2~-9 또는 -ts 추가)`)
  console.log(`50자 truncate:   ${truncateCount}건  (title 50자 초과)`)

  console.log('\nboadType별:')
  Object.entries(boardCounts).forEach(([k, v]) => console.log(`  ${k.padEnd(8)}: ${v}`))
  console.log('\nsource별:')
  Object.entries(sourceCounts).forEach(([k, v]) => console.log(`  ${k.padEnd(8)}: ${v}`))

  console.log('\n✅ DB write 없음 — dry-run 완료')

  if (csvMode && csvRows.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const csvPath = join(__dirname, `backfill-community-slug-dryrun-${ts}.csv`)
    const header = 'id,boardType,source,createdAt,title,expectedSlug,slugLength,isFallback,hasSuffix,isTruncated'
    const lines = csvRows.map(r =>
      [r.id, r.boardType, r.source, r.createdAt,
       `"${r.title.replace(/"/g, '""')}"`,
       r.expectedSlug, r.slugLength, r.isFallback, r.hasSuffix, r.isTruncated,
      ].join(',')
    )
    writeFileSync(csvPath, [header, ...lines].join('\n'), 'utf-8')
    console.log(`\n📄 CSV 저장: ${csvPath}`)
  }
}

main()
  .catch((err: unknown) => {
    console.error('[Backfill] ❌ 에러:', err)
    process.exitCode = 1
  })
  .finally(() => disconnect())
