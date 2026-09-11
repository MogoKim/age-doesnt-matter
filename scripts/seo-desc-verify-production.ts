/**
 * 적용 후 production 전수 검증 — `/jobs/{id}` 50개의 **실제 meta description** 을 확인한다.
 *
 * DB 가 바뀐 것과 공개 면이 바뀐 것은 다르다. `/jobs/[id]` 는 데이터 캐시(300s)와
 * 라우트 ISR(300s)이 겹쳐 있어서, DB 만 보고 "완료"라고 하면 최대 5분간 옛 문구가
 * 그대로 노출된다. 그래서 실제 HTML 을 받아 `<meta name="description">` 을 읽는다.
 *
 *   npx tsx scripts/seo-desc-verify-production.ts
 *   npx tsx scripts/seo-desc-verify-production.ts --expect=before        # 적용 전/롤백 후
 *   npx tsx scripts/seo-desc-verify-production.ts --deadline=1800 --interval=60
 *
 * 종료 코드: 0 = 전건 일치 / 3 = 캐시 대기·요청 실패(재확인 필요) / 2 = 내용 위반(롤백 검토)
 *
 * 🔴 **옛 문구가 보이는 것은 위반이 아니다.** 확정 CSV 실측으로 적용 대상 50건 중
 *    48건의 `currentSeoDescription` 에 미승인 금지 표현이 있다. 캐시가 안 내려간
 *    상태에서 그걸 보고 롤백하면 멀쩡한 정정을 되돌리게 된다.
 *    **내용 검사는 기대값과 정확히 일치할 때만** 한다.
 *
 * 읽기 전용이다. DB 도 캐시도 건드리지 않는다.
 *
 * ⚠️ 자사 사이트 요청에는 `x-bot-type` 헤더가 필수다(CLAUDE.md).
 *    없으면 GA4·EventLog 에 우리 검증 트래픽이 섞여 운영 데이터가 오염된다.
 *
 * 🔇 로그에 문구 전문을 출력하지 않는다. 일치 여부와 해시 지문만 남긴다.
 */
// Next 는 .env.local 을 읽지만 dotenv 기본값은 .env 다. 둘 다 읽지 않으면
// connectionString 이 undefined 가 되어 localhost 로 붙고 ECONNREFUSED 로 오해하게 된다.
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseCsv, toRewriteRows, buildPlan, csvToDbValue, assertCsvIntegrity, fingerprint,
} from '../src/lib/seo/desc-apply-plan'
import {
  extractMetaDescription, classifyVerifyOutcome, observeUrl, createTracker,
  type UrlObservation,
} from '../src/lib/seo/desc-verify'

const CSV_PATH = 'docs/operations/data/2026-09-11-seo-brand-copy-rewrite.csv'
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
const argv = process.argv.slice(2)
const valueOf = (f: string) => argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1)
const expect: 'after' | 'before' = argv.includes('--expect=before') ? 'before' : 'after'
const CONCURRENCY = 4
/**
 * 반복 확인 한도.
 *
 * "최대 5분이면 반영된다"고 단정할 수 없다 — ISR 은 만료 후 첫 요청에 stale 을 주고
 * 뒤에서 다시 만들기 때문에, 같은 URL 을 한 번 더 쳐야 새 값이 나온다. CDN 층이
 * 더 붙으면 더 걸릴 수도 있다. 그래서 **단정하지 않고 제한시간 동안 반복 확인**한다.
 */
const DEADLINE_MS = Number(valueOf('--deadline') ?? 900) * 1000   // 기본 15분
const INTERVAL_MS = Number(valueOf('--interval') ?? 30) * 1000    // 기본 30초

async function fetchMeta(id: string): Promise<{ status: number; desc: string | null }> {
  const res = await fetch(`${BASE}/jobs/${id}`, {
    headers: {
      // 자사 요청 표시 — 운영 데이터 오염 방지
      'x-bot-type': 'ops-verify',
      'user-agent': 'unao-ops-seo-verify/1.0',
      'cache-control': 'no-cache',
    },
    redirect: 'follow',
  })
  if (!res.ok) return { status: res.status, desc: null }
  return { status: res.status, desc: extractMetaDescription(await res.text()) }
}

async function main() {
  const raw = readFileSync(resolve(process.cwd(), CSV_PATH), 'utf8')
  try {
    assertCsvIntegrity(raw)
  } catch (e) {
    console.error('❌ ABORT [CSV_SHA256]', e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
  const rows = toRewriteRows(parseCsv(raw))
  const plan = buildPlan(rows, 'apply')
  if (!plan.ok) {
    console.error('❌ CSV 검증 실패 — 검증 대상을 특정할 수 없다')
    for (const i of plan.issues.slice(0, 10)) console.error(`   [${i.code}] ${i.detail}`)
    process.exit(1)
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  production meta description 전수 검증 — 기대: ${expect === 'after' ? '적용 후(제안값)' : '적용 전/롤백 후(현재값)'}`)
  console.log(`  ${BASE}/jobs/{id} × ${plan.targets.length} · 제한시간 ${DEADLINE_MS / 1000}s · 간격 ${INTERVAL_MS / 1000}s`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // URL 별 terminal 상태를 라운드 너머로 유지한다 —
  // 라운드마다 초기화하면 앞 라운드의 진짜 위반이 사라진다.
  const tracker = createTracker(plan.targets.map((t) => t.id))
  let round = 0
  const started = Date.now()

  for (;;) {
    const todo = tracker.pending()
    if (!todo.length) break
    round++

    const queue = [...todo]
    const observed: UrlObservation[] = []
    async function worker() {
      for (;;) {
        const id = queue.shift()
        if (!id) return
        const r = byId.get(id)!
        try {
          const { status, desc } = await fetchMeta(id)
          observed.push(observeUrl({
            id, mode: expect, html: desc, status,
            currentValue: csvToDbValue(r.currentSeoDescription),
            proposedValue: csvToDbValue(r.proposedSeoDescription),
          }))
        } catch {
          observed.push({ id, state: 'FETCH_FAILED', banned: [] })
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    tracker.record(observed)

    const snap = tracker.snapshot()
    const elapsed = Math.round((Date.now() - started) / 1000)
    console.log(
      `  [round ${round}] 일치 ${snap.matched}/${snap.total} · 대기 ${snap.pending} · ` +
      `예상 밖 ${snap.unexpected} · 실패 ${snap.fetchFailed} · 위반 ${snap.violation} · +${elapsed}s`,
    )

    if (!tracker.pending().length) break
    if (Date.now() - started + INTERVAL_MS >= DEADLINE_MS) break
    // ISR 은 만료 후 첫 요청에 stale 을 주고 뒤에서 다시 만든다 —
    // 같은 URL 을 한 번 더 요청해야 새 값이 나오므로, 기다렸다 다시 친다.
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }

  const counts = tracker.snapshot()
  const verdict = classifyVerifyOutcome(counts, expect)

  console.log(`\n일치            ${counts.matched}/${counts.total}`)
  console.log(`아직 반대쪽 값  ${counts.pending}`)
  console.log(`예상 밖 값      ${counts.unexpected}`)
  console.log(`요청 실패       ${counts.fetchFailed}`)
  console.log(`내용 위반       ${counts.violation}`)
  for (const v of tracker.violations().slice(0, 12)) {
    console.log(`  🚫 post#${fingerprint(v.id)}: ${v.banned.join(',')}`)
  }

  console.log(`\n판정: ${verdict.outcome}`)
  if (verdict.hint) console.log(`  ${verdict.hint}`)
  console.log(verdict.shouldRollback
    ? '  🔴 DB 롤백을 검토해야 한다.'
    : '  DB 롤백 사유가 아니다.')

  // OK 만 0. CACHE_PENDING·FETCH_FAILED 는 3(재확인 필요), 내용 위반은 2.
  process.exit(verdict.outcome === 'OK' ? 0 : verdict.shouldRollback ? 2 : 3)
}

/**
 * **direct-run 계약** — import 만으로는 HTTP 요청이 나가지 않는다.
 * 한 번 이걸 어겨서 테스트가 production 에 GET 50건을 날린 적이 있다.
 */
export const isDirectRun = (): boolean =>
  Boolean(process.argv[1]?.includes('seo-desc-verify-production'))

if (isDirectRun()) main().catch((e) => { console.error(e); process.exit(1) })
