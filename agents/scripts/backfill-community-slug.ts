/**
 * P1-1 Community Slug Backfill — Dry-run Only
 *
 * 기존 slug=null PUBLISHED 커뮤니티 글(STORY/HUMOR/LIFE2)에 대해
 * 예상 slug를 시뮬레이션합니다. DB write 없음.
 *
 * 사용:
 *   npx tsx scripts/backfill-community-slug.ts              # dry-run 50건
 *   npx tsx scripts/backfill-community-slug.ts --limit 20   # 20건
 *   npx tsx scripts/backfill-community-slug.ts --offset 50  # 51번째부터
 *   npx tsx scripts/backfill-community-slug.ts --csv        # CSV 저장
 *   npx tsx scripts/backfill-community-slug.ts --write      # ❌ disabled (P1-2에서 구현)
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

if (args.includes('--write')) {
  console.error('[Backfill] ❌ --write mode is disabled in P1-1. Use P1-2 script for actual write.')
  process.exitCode = 1
  process.exit(1)
}

function getArg(flag: string, defaultVal: number): number {
  const idx = args.indexOf(flag)
  if (idx < 0) return defaultVal
  const val = parseInt(args[idx + 1] ?? String(defaultVal), 10)
  return isNaN(val) ? defaultVal : val
}

const limit  = getArg('--limit',  50)
const offset = getArg('--offset', 0)
const csvMode = args.includes('--csv')

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
    // 이번 배치 내 중복 회피
    if (assignedInBatch.has(candidate)) continue
    // DB 기존 slug 충돌 확인
    const exists = await p.post.findUnique({ where: { slug: candidate }, select: { id: true } })
    if (!exists) {
      assignedInBatch.add(candidate)
      return {
        slug: candidate,
        isFallback: false,
        hasSuffix: sfx !== '',
        isTruncated,
      }
    }
  }

  // -2 ~ -9 모두 사용 중 → timestamp fallback
  const tsSlug = `${base}-${Date.now()}`
  assignedInBatch.add(tsSlug)
  return { slug: tsSlug, isFallback: false, hasSuffix: true, isTruncated }
}

// ── CSV row type ──────────────────────────────────────────────────────────────
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

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[Backfill DryRun] ✅ DB write 없음 | limit=${limit} offset=${offset} csv=${csvMode}`)

  // 전체 대상 수
  const totalTarget: number = await p.post.count({
    where: { boardType: { in: BOARDS }, status: 'PUBLISHED', slug: null },
  })
  console.log(`[Backfill DryRun] 전체 대상: ${totalTarget}건\n`)

  // 대상 조회 (createdAt 오름차순 — 오래된 글이 clean slug 우선)
  const posts: Array<{
    id: string
    boardType: string
    source: string
    createdAt: Date
    title: string
  }> = await p.post.findMany({
    where: { boardType: { in: BOARDS }, status: 'PUBLISHED', slug: null },
    orderBy: { createdAt: 'asc' },
    skip: offset,
    take: limit,
    select: { id: true, boardType: true, source: true, createdAt: true, title: true },
  })

  if (posts.length === 0) {
    console.log('[Backfill DryRun] 처리할 대상이 없습니다.')
    return
  }

  // ── header ──
  const H = (s: string, w: number) => s.slice(0, w).padEnd(w)
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

    const idx    = offset + i + 1
    const idTail = post.id.slice(-8)
    const date   = post.createdAt.toISOString().slice(0, 10)

    console.log(
      H(String(idx), 5) +
      H(idTail, 10) +
      H(post.boardType, 8) +
      H(post.source, 8) +
      H(date, 12) +
      H(slug, 52) +
      H(String(slug.length), 5) +
      H(isFallback ? '⚠️ fallback' : '', 10) +
      (hasSuffix ? '✓' : '')
    )

    csvRows.push({
      id: post.id,
      boardType: post.boardType,
      source: post.source,
      createdAt: date,
      title: post.title,
      expectedSlug: slug,
      slugLength: slug.length,
      isFallback,
      hasSuffix,
      isTruncated,
    })
  }

  // ── 요약 ──
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

  // ── CSV 저장 ──
  if (csvMode && csvRows.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const csvPath = join(__dirname, `backfill-community-slug-dryrun-${ts}.csv`)
    const header = 'id,boardType,source,createdAt,title,expectedSlug,slugLength,isFallback,hasSuffix,isTruncated'
    const lines = csvRows.map(r =>
      [
        r.id,
        r.boardType,
        r.source,
        r.createdAt,
        `"${r.title.replace(/"/g, '""')}"`,
        r.expectedSlug,
        r.slugLength,
        r.isFallback,
        r.hasSuffix,
        r.isTruncated,
      ].join(',')
    )
    writeFileSync(csvPath, [header, ...lines].join('\n'), 'utf-8')
    console.log(`\n📄 CSV 저장: ${csvPath}`)
  }
}

main()
  .catch((err: unknown) => {
    console.error('[Backfill DryRun] ❌ 에러:', err)
    process.exitCode = 1
  })
  .finally(() => disconnect())
