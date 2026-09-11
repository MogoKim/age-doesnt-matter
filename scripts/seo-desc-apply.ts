/**
 * REWRITE_BRAND_COPY 50건 `Post.seoDescription` 적용 / 롤백 CLI.
 *
 * ─────────────────────────────────────────────────────────────
 *  기본 동작은 **dry-run 이고 write 는 0건**이다.
 *  실제로 쓰려면 `--execute` 와 확인 토큰이 **둘 다** 있어야 한다.
 * ─────────────────────────────────────────────────────────────
 *
 *   # 1) 미리보기 (write 0)
 *   npx tsx scripts/seo-desc-apply.ts
 *   npx tsx scripts/seo-desc-apply.ts --read=rest     # Postgres 직결이 막힌 환경
 *
 *   # 2) 적용
 *   npx tsx scripts/seo-desc-apply.ts --execute --confirm=APPLY-SEO-DESC-50
 *
 *   # 3) 롤백 (적용 전 값으로 정확히 되돌린다)
 *   npx tsx scripts/seo-desc-apply.ts --rollback --execute --confirm=ROLLBACK-SEO-DESC-50
 *
 * 이 도구는 `Post.seoDescription` **하나만** 쓴다.
 * `seoTitle`·`title`·`content`·`JobDetail` 및 다른 필드는 `data` 에 넣지 않는다.
 * `applyEligible=false` 9건은 어떤 모드에서도 대상이 아니다.
 *
 * 🔒 정책: DB write 는 COO 경로 + 창업자 승인 대상이다(CLAUDE.md).
 *    이 CLI 는 승인 후 운영자가 **손으로** 실행하는 도구이지 자동화 훅이 아니다.
 *    크론·워크플로·에이전트 런타임에서 호출하지 않는다.
 *
 * 🔇 로그: 본문·SEO 문구·개인정보를 출력하지 않는다. 건수와 해시 지문만 남긴다.
 *
 * 문서: docs/operations/2026-09-11-seo-brand-copy-rewrite.md §7
 */
// Next 는 .env.local 을 읽지만 dotenv 기본값은 .env 다. 둘 다 읽지 않으면
// connectionString 이 undefined 가 되어 localhost 로 붙고 ECONNREFUSED 로 오해하게 된다.
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import {
  parseCsv, toRewriteRows, buildPlan, detectDrift, fingerprint,
  assertCsvIntegrity, CSV_SHA256, TRANSACTION_OPTIONS,
  REQUIRED_BOARD_TYPE, REQUIRED_STATUS,
  CONFIRM_TOKEN, EXPECTED_APPLY_ROWS,
  type Mode, type LiveRow, type PlanIssue,
} from '../src/lib/seo/desc-apply-plan'
import {
  executeInTransaction, ApplyAbortError, type TransactionRunner,
} from '../src/lib/seo/desc-apply-exec'

const CSV_PATH = 'docs/operations/data/2026-09-11-seo-brand-copy-rewrite.csv'

const argv = process.argv.slice(2)
const has = (f: string) => argv.includes(f)
const valueOf = (f: string) => argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1)

const mode: Mode = has('--rollback') ? 'rollback' : 'apply'
/**
 * 사전 조회 경로.
 *
 * 기본은 Prisma 다. 다만 운영자 로컬·CI 샌드박스에서는 Supabase Postgres 직결
 * (5432/6543)이 ECONNREFUSED 로 막히는 경우가 있어, **읽기 전용** 대안으로
 * Supabase REST(443, GET)를 둔다. dry-run 으로 drift 를 확인하기 위한 것이다.
 *
 * 🔒 **write 는 절대 REST 로 하지 않는다.** `--execute` 는 Prisma 읽기를 강제한다 —
 *    낙관적 잠금과 트랜잭션이 같은 연결 위에 있어야 의미가 있기 때문이다.
 */
const readVia: 'prisma' | 'rest' = valueOf('--read') === 'rest' ? 'rest' : 'prisma'
const execute = has('--execute')
const confirm = valueOf('--confirm')

function log(line: string) { console.log(line) }
function fail(code: string, message: string): never {
  console.error(`\n❌ ABORT [${code}] ${message}`)
  console.error('   → mutation 0건. 아무것도 쓰지 않았다.')
  process.exit(1)
}
function printIssues(issues: PlanIssue[], limit = 12) {
  const byCode = new Map<string, number>()
  for (const i of issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1)
  log('   사유별 건수:')
  for (const [code, n] of byCode) log(`     - ${code}: ${n}`)
  log('   상세(최대 ' + limit + '건):')
  for (const i of issues.slice(0, limit)) log(`     - [${i.code}] ${i.detail}`)
  if (issues.length > limit) log(`     … 외 ${issues.length - limit}건`)
}

/**
 * Supabase REST 읽기 (GET 전용).
 *
 * 이 함수는 조회만 한다. PostgREST 로 write 할 수 있는 경로를 여기 두지 않는다.
 * URL 길이 제한 때문에 id 를 25개씩 끊어 요청한다.
 */
async function readViaRest(ids: string[]): Promise<LiveRow[]> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !key) fail('REST_ENV', 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없다')
  const out: LiveRow[] = []
  for (let i = 0; i < ids.length; i += 25) {
    const chunk = ids.slice(i, i + 25).map((id) => `"${id}"`).join(',')
    const url = `${base}/rest/v1/Post?select=id,boardType,status,seoTitle,seoDescription&id=in.(${chunk})`
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!res.ok) fail('REST_HTTP', `Supabase REST ${res.status}`)
    const j: unknown = await res.json()
    if (!Array.isArray(j)) fail('REST_SHAPE', 'Supabase REST 응답이 배열이 아니다')
    out.push(...(j as LiveRow[]))
  }
  return out
}

async function main() {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log(`  SEO description ${mode === 'apply' ? '적용' : '롤백'} — ${execute ? 'EXECUTE' : 'DRY-RUN (write 0)'}`)
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // ── 0. 이중 게이트 ──────────────────────────────────────────
  if (execute && confirm !== CONFIRM_TOKEN[mode]) {
    fail('CONFIRM_TOKEN',
      `--execute 에는 확인 토큰이 필요하다. --confirm=${CONFIRM_TOKEN[mode]}`)
  }
  if (!execute && confirm) {
    log('⚠️  --confirm 만으로는 쓰지 않는다. 실제 적용은 --execute 도 필요하다.')
  }

  // ── 1. CSV 파싱 + 계획 검증 ────────────────────────────────
  const csvPath = resolve(process.cwd(), CSV_PATH)
  const raw = readFileSync(csvPath, 'utf8')
  log(`\n[1] CSV   ${CSV_PATH}`)
  // 출력만 하지 않는다 — 전체 SHA-256 이 다르면 여기서 끝난다
  try {
    assertCsvIntegrity(raw)
  } catch (e) {
    fail('CSV_SHA256', e instanceof Error ? e.message : String(e))
  }
  log(`    sha256=${CSV_SHA256.slice(0, 16)}… ✅ 확정본 일치`)
  const rows = toRewriteRows(parseCsv(raw))
  log(`    전체 ${rows.length}행`)

  const plan = buildPlan(rows, mode)
  log(`    분류: ${Object.entries(plan.decisionCounts).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
  log(`    적용 대상 ${plan.targets.length} · 적용 제외 ${plan.excluded}`)
  if (!plan.ok) {
    log('\n[1] ❌ 계획 검증 실패')
    printIssues(plan.issues)
    fail('PLAN', `CSV 검증에 실패했다 (${plan.issues.length}건)`)
  }
  log('    ✅ 행수·분류 합계·고유 ID·보류 제외·행별 해시 재계산 검증 통과')

  // ── 2. production 현재값 조회 ──────────────────────────────
  if (execute && readVia === 'rest') {
    fail('READ_VIA', '--execute 는 Prisma 읽기를 요구한다. --read=rest 와 함께 쓸 수 없다.')
  }
  const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  try {
    const ids = plan.targets.map((t) => t.id)
    const live: LiveRow[] = readVia === 'rest'
      ? await readViaRest(ids)
      : await prisma.post.findMany({
          where: { id: { in: ids } },
          // 공개 상태도 읽는다 — 숨겨졌거나 게시판이 바뀐 글에 쓰지 않기 위해
          select: {
            id: true, boardType: true, status: true,
            seoTitle: true, seoDescription: true,
          },
        })
    log(`\n[2] production 조회 (${readVia})  요청 ${ids.length} · 응답 ${live.length}`)

    // ── 3. drift 대조 (null-safe exact) ──────────────────────
    const drift = detectDrift(plan.targets, live, mode)
    if (!drift.ok) {
      log('\n[3] ❌ 사전 대조 실패 — 누락·중복·drift')
      printIssues(drift.issues)
      fail('DRIFT',
        `production 값이 CSV current 값과 일치하지 않는다 (${drift.issues.length}건). ` +
        '값이 달라졌다면 이 정정안의 전제가 깨진 것이다 — 덮어쓰지 말고 다시 측정해라.')
    }
    log(`[3] ✅ 누락 0 · 중복 0 · drift 0 · 전건 ${REQUIRED_BOARD_TYPE}/${REQUIRED_STATUS} (null-safe exact match)`)

    // ── 4. dry-run 이면 여기서 끝 ─────────────────────────────
    if (!execute) {
      log('\n[4] DRY-RUN 종료')
      log(`    대상 ${plan.targets.length} · drift 0 · mutation 0`)
      log(`    적용하려면: --execute --confirm=${CONFIRM_TOKEN[mode]}`)
      if (readVia === 'rest') log('    ⚠️ REST 로 읽었다. 실제 적용은 Prisma 연결이 되는 환경에서 해야 한다.')
      log('\n샘플(전부 해시 지문 — post id 도 문구도 그대로 찍지 않는다):')
      for (const t of plan.targets.slice(0, 3)) {
        log(`    post#${fingerprint(t.id)}  ` +
            `${fingerprint(t.expectedSeoDescription ?? '')} → ${fingerprint(t.nextSeoDescription ?? '')}`)
      }
      return
    }

    // ── 5. 단일 트랜잭션 write ────────────────────────────────
    log(`\n[5] 트랜잭션 시작 — ${plan.targets.length}건 · maxWait ${TRANSACTION_OPTIONS.maxWait}ms · timeout ${TRANSACTION_OPTIONS.timeout}ms`)
    const started = Date.now()
    // Prisma 의 $transaction 은 배열/콜백 두 오버로드를 갖는다. 콜백 쪽을 명시적으로
    // 집어 넘긴다 — 인터페이스에 직접 넣으면 TS 가 배열 오버로드를 먼저 잡아 실패한다.
    const runner: TransactionRunner = {
      $transaction: (fn, options) => prisma.$transaction(fn, options),
    }
    const res = await executeInTransaction(runner, plan.targets, EXPECTED_APPLY_ROWS)
    log(`    ✅ commit — 영향 행 ${res.affected}/${res.attempted} · ${Date.now() - started}ms`)

    // ── 6. 사후 검증 ──────────────────────────────────────────
    const after: LiveRow[] = await prisma.post.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, boardType: true, status: true,
        seoTitle: true, seoDescription: true,
      },
    })
    const afterMap = new Map(after.map((r) => [r.id, r]))
    let okDesc = 0, okTitle = 0
    const bad: string[] = []
    for (const t of plan.targets) {
      const row = afterMap.get(t.id)
      const fp = `post#${fingerprint(t.id)}`
      if (!row) { bad.push(`${fp}: 조회 실패`); continue }
      if ((row.seoDescription ?? null) === (t.nextSeoDescription ?? null)) okDesc++
      else bad.push(`${fp}: seoDescription 이 목표값과 다르다`)
      if ((row.seoTitle ?? null) === (t.expectedSeoTitle ?? null)) okTitle++
      else bad.push(`${fp}: seoTitle 이 변경됐다(있어서는 안 되는 일)`)
    }
    log(`\n[6] 사후 검증  seoDescription 일치 ${okDesc}/${plan.targets.length} · seoTitle 무변경 ${okTitle}/${plan.targets.length}`)
    if (bad.length) {
      log('    ❌ 불일치:')
      for (const b of bad.slice(0, 12)) log(`      - ${b}`)
      console.error('\n🔴 write 는 commit 됐으나 사후 검증이 실패했다. 후속 write 를 중단하고 롤백을 검토해라.')
      console.error(`   롤백: npx tsx scripts/seo-desc-apply.ts --rollback --execute --confirm=${CONFIRM_TOKEN.rollback}`)
      process.exit(2)
    }
    log('    ✅ 전건 일치')

    // ── 7. 캐시 무효화 안내 (이 도구는 캐시를 건드리지 않는다) ──
    log('\n[7] 캐시 — 이 CLI 는 Next 런타임 밖이라 revalidate 를 호출할 수 없다.')
    log('    /jobs/[id] 는 라우트 ISR(revalidate 300)로 HTML 이 캐시되고,')
    log('    ISR 은 만료 후 첫 요청에 stale 을 주고 뒤에서 다시 만든다 —')
    log('    그래서 "몇 분이면 반영된다"고 단정할 수 없다. 확인해야 한다:')
    log('      npx tsx scripts/seo-desc-verify-production.ts        (제한시간 동안 반복 확인)')
    log('    HTML 이 아직 옛 문구여도 DB 는 이미 맞다([6] 확인 완료). 롤백 사유가 아니다.')
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * **direct-run 계약** — import 만으로는 DB 에 붙지도, 아무것도 쓰지도 않는다.
 * 테스트가 이 파일을 읽어도 부작용이 없어야 한다.
 */
export const isDirectRun = (): boolean =>
  Boolean(process.argv[1]?.includes('seo-desc-apply'))

if (isDirectRun()) {
  main().catch((e) => {
    if (e instanceof ApplyAbortError) fail(e.code, e.message)
    console.error('\n❌ 예기치 못한 오류:', e instanceof Error ? e.message : String(e))
    console.error('   트랜잭션 안에서 발생했다면 rollback 됐다 (mutation 0).')
    process.exit(1)
  })
}
