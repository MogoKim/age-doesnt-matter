/**
 * Post.summary Backfill — Dry-run 기본 / 단계별 write
 *
 * 배경: sheet-scraper가 summary를 쓰지 않던 시절 저장된 글들이 목록 미리보기 없이 남아 있다.
 *       PR #247로 신규 크롤은 summary를 채우고, 2026-07-30 launchd 운영경로 분리로
 *       옛 코드가 도는 경로도 끊었다. 이제 남은 과거분을 채운다.
 *
 * 대상: status=PUBLISHED · boardType ∈ {STORY, LIFE2, HUMOR, MENOPAUSE} · summary IS NULL
 *       (HIDDEN/DELETED/DRAFT/SEO_ONLY, 그 외 보드는 제외)
 *
 * 원칙:
 *   - content 원문은 절대 수정하지 않는다. summary 필드만 쓴다.
 *   - buildSummary가 null을 주면 그대로 null로 남긴다(출처뿐인 글 등).
 *   - raw SQL 금지. Prisma delegate만 사용.
 *
 * dry-run (기본값 — DB 수정 0):
 *   npx tsx agents/scripts/backfill-post-summary.ts
 *   npx tsx agents/scripts/backfill-post-summary.ts --limit 200
 *   npx tsx agents/scripts/backfill-post-summary.ts --csv
 *
 * write (창업자 승인 후 단계별로만):
 *   npx tsx agents/scripts/backfill-post-summary.ts --write --limit 10  --confirm-write-sample
 *   npx tsx agents/scripts/backfill-post-summary.ts --write --limit 100 --confirm-write-batch --csv
 *   npx tsx agents/scripts/backfill-post-summary.ts --write --limit 500 --confirm-write-large-batch --csv
 */
import { config } from 'dotenv'
import { writeFileSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { buildSummary } from '../core/summary.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// core/db.ts는 import 시점에 곧바로 Prisma client를 만든다(top-level).
// .env.local을 그 전에 읽어야 하므로 dotenv 먼저, db는 동적 import로 뒤에 로드한다.
config({ path: resolve(__dirname, '../../.env.local') })
const { prisma, disconnect } = await import('../core/db.js')

const BOARDS = ['STORY', 'LIFE2', 'HUMOR', 'MENOPAUSE'] as const

// ── 최소 타입 (core/db.ts는 구조 타입을 노출하지 않는다) ────────────────────────
interface PostRow {
  id: string
  title: string
  content: string | null
  boardType: string
  createdAt: Date
}
interface PostDelegate {
  count(args: unknown): Promise<number>
  findMany(args: unknown): Promise<PostRow[]>
  update(args: unknown): Promise<unknown>
}
const post = (prisma as unknown as { post: PostDelegate }).post

// ── args ────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)

const isWrite = args.includes('--write')
const isCsv = args.includes('--csv')
const isConfirmSample = args.includes('--confirm-write-sample')
const isConfirmBatch = args.includes('--confirm-write-batch')
const isConfirmLargeBatch = args.includes('--confirm-write-large-batch')

function readLimit(): number | null {
  const i = args.indexOf('--limit')
  if (i === -1 || i === args.length - 1) return null
  const n = Number.parseInt(args[i + 1], 10)
  return Number.isFinite(n) && n > 0 ? n : null
}
const limit = readLimit()

/** write 가드 — limit·confirm 둘 다 없으면 진행하지 않는다. */
function assertWriteAllowed(): number {
  if (!isConfirmSample && !isConfirmBatch && !isConfirmLargeBatch) {
    console.error(
      '[backfill-summary] ❌ --write에는 확인 플래그가 필요하다:\n' +
      '    --confirm-write-sample      (--limit ≤ 10)\n' +
      '    --confirm-write-batch       (--limit ≤ 100)\n' +
      '    --confirm-write-large-batch (--limit ≤ 500)'
    )
    process.exit(1)
  }
  if (limit === null) {
    console.error('[backfill-summary] ❌ --write에는 --limit 이 필요하다. limit 없이 전체 write는 허용하지 않는다.')
    process.exit(1)
  }
  const cap = isConfirmSample ? 10 : isConfirmBatch ? 100 : 500
  const capName = isConfirmSample ? 'sample' : isConfirmBatch ? 'batch' : 'large-batch'
  if (limit > cap) {
    console.error(`[backfill-summary] ❌ --confirm-write-${capName} 의 상한은 ${cap}건인데 --limit ${limit} 을 받았다.`)
    process.exit(1)
  }
  return cap
}

// ── 잔존 꼬리표 검사 ────────────────────────────────────────────────────────────
const LEAK_PATTERNS: [string, RegExp][] = [
  ['사이트명', /82cook|네이버\s*카페|cafe\.naver|cafe\.daum|fmkorea|에펨코리아|펨코|보배드림|뽐뿌|디시|인스티즈|더쿠|웃긴대학|bboom|루리웹|goodgag/i],
  ['출처문구', /출처|자료\s*출처|원문|퍼옴|스크랩/],
  ['URL', /https?:\/\/|www\.|\.com|\.net|\.co\.kr/i],
]
/** 초성 은어 — buildSummary가 아직 모른다(known issue). FAIL 조건 아님. */
const SLANG_SOURCE = /ㅊㅊ/

const MIN_USEFUL_LEN = 20

interface Candidate {
  row: PostRow
  summary: string | null
  leaks: string[]
  slang: boolean
  tooShort: boolean
}

function evaluate(row: PostRow): Candidate {
  const summary = buildSummary(row.content ?? '')
  const leaks: string[] = []
  if (summary) {
    for (const [label, re] of LEAK_PATTERNS) if (re.test(summary)) leaks.push(label)
  }
  return {
    row,
    summary,
    leaks,
    slang: summary !== null && SLANG_SOURCE.test(summary),
    tooShort: summary !== null && summary.length < MIN_USEFUL_LEN,
  }
}

function csvCell(v: string | null): string {
  if (v === null) return ''
  return `"${v.replace(/"/g, '""')}"`
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

// ── main ────────────────────────────────────────────────────────────────────────
async function main() {
  const where = {
    status: 'PUBLISHED',
    boardType: { in: BOARDS },
    summary: null,
  }

  const total = await post.count({ where })

  console.log('═'.repeat(78))
  console.log(`[backfill-summary] 모드: ${isWrite ? '⚠️  WRITE' : 'DRY-RUN (DB 수정 0)'}`)
  console.log(`  대상: status=PUBLISHED · boardType ∈ {${BOARDS.join(', ')}} · summary IS NULL`)
  console.log(`  제외: HIDDEN / DELETED / DRAFT / SEO_ONLY, 그 외 보드`)
  console.log(`  전체 대상: ${total}건${limit ? ` · 이번 실행 처리 상한 ${limit}건` : ''}`)
  console.log('═'.repeat(78))

  if (isWrite) assertWriteAllowed()

  const rows = await post.findMany({
    where,
    select: { id: true, title: true, content: true, boardType: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    ...(limit ? { take: limit } : {}),
  })

  const cands = rows.map(evaluate)
  const buildable = cands.filter((c) => c.summary !== null)
  const keptNull = cands.filter((c) => c.summary === null)
  const leaked = buildable.filter((c) => c.leaks.length > 0)
  const slangy = buildable.filter((c) => c.slang)
  const shorts = buildable.filter((c) => c.tooShort)

  // 보드별 분포
  const byBoard = new Map<string, { total: number; ok: number }>()
  for (const c of cands) {
    const e = byBoard.get(c.row.boardType) ?? { total: 0, ok: 0 }
    e.total++
    if (c.summary !== null) e.ok++
    byBoard.set(c.row.boardType, e)
  }

  console.log('\n── 집계')
  console.log(`  스캔        ${rows.length}건`)
  console.log(`  생성 가능    ${buildable.length}건`)
  console.log(`  null 유지    ${keptNull.length}건  (본문이 출처뿐이거나 비어 있음 — 그대로 둔다)`)
  console.log('\n── 보드별')
  for (const b of BOARDS) {
    const e = byBoard.get(b) ?? { total: 0, ok: 0 }
    console.log(`  ${b.padEnd(10)} 스캔 ${String(e.total).padStart(5)} · 생성 가능 ${String(e.ok).padStart(5)}`)
  }

  console.log('\n── 꼬리표 잔존 (0이어야 정상)')
  for (const [label] of LEAK_PATTERNS) {
    const n = buildable.filter((c) => c.leaks.includes(label)).length
    console.log(`  ${label.padEnd(8)} ${String(n).padStart(5)}건 ${n === 0 ? '✅' : '❌'}`)
  }
  console.log(`  합계     ${String(leaked.length).padStart(5)}건 ${leaked.length === 0 ? '✅' : '❌'}`)

  console.log('\n── known issue (FAIL 조건 아님)')
  console.log(`  초성 은어 'ㅊㅊ' 잔존 ${slangy.length}건 — buildSummary가 아직 모르는 패턴`)

  console.log(`\n── 대표 샘플 10건`)
  for (const c of buildable.slice(0, 10)) {
    console.log(`  [${c.row.boardType}] ${c.row.title.slice(0, 30)}`)
    console.log(`     → ${c.summary}`)
  }

  const suspects = [...leaked, ...shorts, ...slangy]
    .filter((c, i, a) => a.findIndex((x) => x.row.id === c.row.id) === i)
    .slice(0, 20)
  console.log(`\n── 문제 의심 케이스 ${suspects.length}건 (최대 20건)`)
  if (suspects.length === 0) {
    console.log('  없음')
  } else {
    for (const c of suspects) {
      const tags = [
        ...c.leaks.map((l) => `누수:${l}`),
        c.slang ? 'known:ㅊㅊ' : '',
        c.tooShort ? `짧음(${c.summary?.length}자)` : '',
      ].filter(Boolean).join(' ')
      console.log(`  [${tags}] ${c.row.title.slice(0, 26)}`)
      console.log(`     → ${c.summary}`)
    }
  }

  // ── CSV (dry-run에서도 생성 가능 — 롤백 대장 역할) ────────────────────────────
  let csvPath: string | null = null
  if (isCsv) {
    const mode = isWrite ? 'write' : 'dryrun'
    csvPath = join(__dirname, `backfill-post-summary-${mode}-${stamp()}.csv`)
    const header = 'id,boardType,createdAt,title,prevSummary,newSummary,leaks,slang,tooShort'
    const lines = cands.map((c) =>
      [
        csvCell(c.row.id),
        csvCell(c.row.boardType),
        csvCell(c.row.createdAt.toISOString()),
        csvCell(c.row.title),
        csvCell(null), // prevSummary — 대상이 summary IS NULL 이므로 항상 빈 값(롤백 시 null로 되돌린다)
        csvCell(c.summary),
        csvCell(c.leaks.join('|')),
        csvCell(c.slang ? 'Y' : ''),
        csvCell(c.tooShort ? 'Y' : ''),
      ].join(',')
    )
    writeFileSync(csvPath, [header, ...lines].join('\n'), 'utf-8')
  }

  // ── WRITE ─────────────────────────────────────────────────────────────────────
  if (!isWrite) {
    console.log('\n' + '═'.repeat(78))
    console.log('[backfill-summary] DRY-RUN 종료 — DB 수정 0건.')
    if (csvPath) console.log(`📄 CSV: ${csvPath}`)
    console.log('  write는 창업자 승인 후 --write --limit N --confirm-write-* 로만 실행한다.')
    console.log('═'.repeat(78))
    return
  }

  console.log('\n' + '═'.repeat(78))
  console.log(`[backfill-summary] WRITE 시작 — ${buildable.length}건 (null 유지 ${keptNull.length}건은 건드리지 않는다)`)
  let updated = 0
  let failed = 0
  for (const c of buildable) {
    try {
      // summary 외 필드는 건드리지 않는다. content 무변경.
      await post.update({ where: { id: c.row.id }, data: { summary: c.summary } })
      updated++
    } catch (e) {
      failed++
      console.error(`  ❌ ${c.row.id}: ${(e as Error).message}`)
    }
  }
  console.log(`  완료: 수정 ${updated}건 · 실패 ${failed}건`)
  if (csvPath) console.log(`📄 롤백 대장 CSV: ${csvPath}`)
  console.log('═'.repeat(78))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => disconnect())
