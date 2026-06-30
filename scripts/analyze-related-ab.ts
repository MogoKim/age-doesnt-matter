/**
 * 관련글 algo v1/v2 A/B 분석 (read-only) — 7일 실험 측정.
 *
 * 신규 이벤트 0. 기존 related_recommend_view(algo_version) + related_post_click(algoVersion) +
 * page_view 를 _anon_sid(sessionId)로 조인해 arm별·네이버 세그먼트별 지표를 낸다.
 *
 * 실행: (worktree, generated client 필요)
 *   npx tsx scripts/analyze-related-ab.ts [days=7]
 * DB write 없음. 집계만.
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const prop = (p: unknown, k: string) => (p as Record<string, unknown> | null)?.[k]

async function main() {
  const days = Number(process.argv[2] ?? 7)
  const since = new Date(Date.now() - days * 86400000)

  // 내부 세션 제외
  const internal = new Set(
    (await prisma.eventLog.findMany({
      where: { sessionId: { not: null }, createdAt: { gte: since }, OR: [{ path: { startsWith: '/admin' } }, { botType: 'founder' }] },
      select: { sessionId: true }, distinct: ['sessionId'],
    })).map((r) => r.sessionId),
  )

  // page_view → 세션별 pv수 + 네이버 여부(첫 referrer/browser_env)
  const pv = await prisma.eventLog.findMany({
    where: { eventName: 'page_view', isBot: false, sessionId: { not: null }, createdAt: { gte: since } },
    select: { sessionId: true, referrer: true, properties: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const sess = new Map<string, { pv: number; naver: boolean }>()
  for (const e of pv) {
    const sid = e.sessionId!
    if (internal.has(sid)) continue
    let s = sess.get(sid)
    if (!s) {
      const ref = str(e.referrer), be = str(prop(e.properties, 'browser_env'))
      s = { pv: 0, naver: /naver/.test(ref) || be === 'naver-inapp' }
      sess.set(sid, s)
    }
    s.pv++
  }

  // 노출(arm) — 세션별 arm = related_recommend_view.algo_version
  const views = await prisma.eventLog.findMany({
    where: { eventName: 'related_recommend_view', sessionId: { not: null }, createdAt: { gte: since } },
    select: { sessionId: true, properties: true },
  })
  const sessionArm = new Map<string, string>()
  let impV1 = 0, impV2 = 0
  for (const v of views) {
    const sid = v.sessionId!
    if (internal.has(sid)) continue
    const ver = str(prop(v.properties, 'algo_version'))
    const arm = ver.startsWith('rec_v2') ? 'v2' : 'v1'
    sessionArm.set(sid, arm)
    if (arm === 'v2') impV2++; else impV1++
  }

  // 클릭(inline) — arm = algoVersion
  const clicks = await prisma.eventLog.findMany({
    where: { eventName: 'related_post_click', sessionId: { not: null }, createdAt: { gte: since }, properties: { path: ['position'], equals: 'inline' } },
    select: { sessionId: true, properties: true },
  })
  let clkV1 = 0, clkV2 = 0
  for (const c of clicks) {
    if (internal.has(c.sessionId!)) continue
    const ver = str(prop(c.properties, 'algoVersion'))
    if (ver.startsWith('rec_v2')) clkV2++; else clkV1++
  }

  // arm별 세션 집계(노출된 세션 기준) + 네이버 세그먼트
  const agg = (arm: string, naverOnly: boolean) => {
    const ids = [...sessionArm].filter(([sid, a]) => a === arm && (!naverOnly || sess.get(sid)?.naver)).map(([sid]) => sid)
    const ss = ids.map((id) => sess.get(id)).filter(Boolean) as { pv: number }[]
    const n = ss.length, totalPv = ss.reduce((a, s) => a + s.pv, 0), multi = ss.filter((s) => s.pv >= 2).length
    return { n, pvPerSession: n ? (totalPv / n).toFixed(2) : '-', nextPageRate: n ? (multi / n * 100).toFixed(1) + '%' : '-' }
  }

  const line = (label: string, imp: number, clk: number, a: ReturnType<typeof agg>) =>
    `${label.padEnd(14)} | 세션 ${String(a.n).padStart(5)} | next-page ${a.nextPageRate.padStart(6)} | PV/s ${a.pvPerSession} | 노출 ${imp} 클릭 ${clk} CTR ${imp ? (clk / imp * 100).toFixed(1) + '%' : '-'}`

  console.log(`\n=== 관련글 algo A/B (최근 ${days}일, 내부 제외) ===`)
  console.log('[전체 채널]')
  console.log(line('v1(control)', impV1, clkV1, agg('v1', false)))
  console.log(line('v2(실험)', impV2, clkV2, agg('v2', false)))
  console.log('\n[네이버 세그먼트]')
  console.log(line('v1 naver', impV1, clkV1, agg('v1', true)) + '  (CTR은 전체기준)')
  console.log(line('v2 naver', impV2, clkV2, agg('v2', true)) + '  (CTR은 전체기준)')
  console.log('\n목표: 네이버 next-page ≥8% · PV/s ≥1.6 · 인라인 CTR ≥6% (baseline 5.9%·1.26·2.8%)')
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e.message); process.exit(1) })
