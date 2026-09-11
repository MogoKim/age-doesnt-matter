/**
 * 적용 후 production 전수 검증 — `/jobs/{id}` 50개의 **실제 meta description** 을 확인한다.
 *
 * DB 가 바뀐 것과 공개 면이 바뀐 것은 다르다. `/jobs/[id]` 는 데이터 캐시(300s)와
 * 라우트 ISR(300s)이 겹쳐 있어서, DB 만 보고 "완료"라고 하면 최대 5분간 옛 문구가
 * 그대로 노출된다. 그래서 실제 HTML 을 받아 `<meta name="description">` 을 읽는다.
 *
 *   npx tsx scripts/seo-desc-verify-production.ts
 *   npx tsx scripts/seo-desc-verify-production.ts --expect=before   # 적용 전/롤백 후
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
import { createHash } from 'node:crypto'
import {
  parseCsv, toRewriteRows, buildPlan, csvToDbValue,
} from '../src/lib/seo/desc-apply-plan'
import { extractMetaDescription, unapprovedBanned } from '../src/lib/seo/desc-verify'

const CSV_PATH = 'docs/operations/data/2026-09-11-seo-brand-copy-rewrite.csv'
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://age-doesnt-matter.com'
const argv = process.argv.slice(2)
const expect: 'after' | 'before' = argv.includes('--expect=before') ? 'before' : 'after'
const CONCURRENCY = 4

const sha12 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12)

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
  const rows = toRewriteRows(parseCsv(raw))
  const plan = buildPlan(rows, 'apply')
  if (!plan.ok) {
    console.error('❌ CSV 검증 실패 — 검증 대상을 특정할 수 없다')
    for (const i of plan.issues.slice(0, 10)) console.error(`   [${i.code}] ${i.detail}`)
    process.exit(1)
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  production meta description 전수 검증 — 기대: ${expect === 'after' ? '적용 후(제안값)' : '적용 전(현재값)'}`)
  console.log(`  ${BASE}/jobs/{id} × ${plan.targets.length}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  let match = 0
  const mismatched: string[] = []
  const banned: string[] = []
  const failed: string[] = []

  const queue = [...plan.targets]
  async function worker() {
    for (;;) {
      const t = queue.shift()
      if (!t) return
      const row = byId.get(t.id)!
      const want = expect === 'after'
        ? csvToDbValue(row.proposedSeoDescription)
        : csvToDbValue(row.currentSeoDescription)
      try {
        const { status, desc } = await fetchMeta(t.id)
        if (status !== 200 || desc === null) { failed.push(`${t.id}: HTTP ${status}${desc === null ? ' · meta 없음' : ''}`); continue }
        if (desc === want) match++
        else mismatched.push(`${t.id}: 기대 ${sha12(want ?? '')} · 실제 ${sha12(desc)}`)
        const hit = unapprovedBanned(desc)
        if (hit.length) banned.push(`${t.id}: ${hit.join(',')}`)
      } catch (e) {
        failed.push(`${t.id}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`\n일치            ${match}/${plan.targets.length}`)
  console.log(`불일치          ${mismatched.length}`)
  console.log(`요청 실패       ${failed.length}`)
  console.log(`미승인 금지표현 ${banned.length}`)
  for (const m of mismatched.slice(0, 12)) console.log(`  ✗ ${m}`)
  for (const f of failed.slice(0, 12)) console.log(`  ! ${f}`)
  for (const b of banned.slice(0, 12)) console.log(`  🚫 ${b}`)

  const ok = match === plan.targets.length && !banned.length && !failed.length
  if (!ok && !mismatched.length && !failed.length) {
    console.log('\n(캐시가 아직 안 내려갔을 수 있다 — 최대 5분 뒤 재실행해봐라)')
  }
  console.log(ok ? '\n✅ 전수 통과' : '\n❌ 검증 실패')
  process.exit(ok ? 0 : 1)
}

// import 만으로 실행되지 않게 한다 — 테스트가 이 파일을 읽어도 요청이 나가면 안 된다
const isDirectRun = process.argv[1]?.includes('seo-desc-verify-production')
if (isDirectRun) main().catch((e) => { console.error(e); process.exit(1) })
