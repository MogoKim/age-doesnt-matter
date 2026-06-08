// MANUAL ONLY — 수동 실행 비용 감시 도구. Admin 키 3개 연결·검증 후 단계3에서 runner/cron 자동화 예정.
/**
 * CFO 비용 감시 — 3사 비용 API 폴링 + BotLog 폴백 + 임계 통제
 *
 * 실행: npx tsx --env-file=.env.local agents/cfo/cost-monitor.ts
 *
 * 키(.env.local, 창업자 발급):
 *   ANTHROPIC_ADMIN_API_KEY  — console.anthropic.com → Admin keys (없으면 BotLog 토큰으로 추정)
 *   OPENAI_ADMIN_KEY         — platform.openai.com → Settings → Organization → Admin keys
 *   VERCEL_API_TOKEN         — vercel.com → Account → Tokens
 *
 * 키가 없으면 해당 서비스는 스킵(Anthropic만 BotLog 폴백 추정).
 * cost-tracker.ts(실행횟수×추정단가, 중단)를 대체하는 토큰/API 실측 기반 도구.
 */
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

const ANTHROPIC_ADMIN_KEY = process.env.ANTHROPIC_ADMIN_API_KEY
const OPENAI_ADMIN_KEY = process.env.OPENAI_ADMIN_KEY
const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN

// ── 통제 임계 (USD) ──
const THRESHOLDS = {
  claudeMonthlyUsd: 80,   // Claude API 월 누계 경고선 (실측 ~$21 기준 여유)
  openaiAnyUsd: 0.01,     // OpenAI는 0 유지 정책 — 조금이라도 쓰면 경고
  vercelCycleUsd: 35,     // Vercel 사이클 경고선 (실측 ~$37 기준)
}

// ── BotLog 폴백 단가 (Anthropic Admin 키 없을 때만, USD per 1M tokens) ──
// 키 연결 시 실측(cost_report)으로 대체되므로 근사값. 구현 시점 공개가 기준.
const FALLBACK_PRICING: Record<'haiku' | 'sonnet' | 'opus', { in: number; out: number; cache: number }> = {
  haiku: { in: 1, out: 5, cache: 0.1 },
  sonnet: { in: 3, out: 15, cache: 0.3 },
  opus: { in: 15, out: 75, cache: 1.5 },
}
// botType → 모델 tier 근사 (BotLog에 모델명이 없어 botType으로 추정 — 폴백 전용)
const STRATEGIC_BOTS = new Set(['CEO'])
const HEAVY_BOTS = new Set(['COO', 'CMO', 'CPO', 'SEED', 'QA', 'MAGAZINE_GENERATOR', 'CONTENT_CURATOR', 'STRATEGIST'])
function tierOf(botType: string): 'haiku' | 'sonnet' | 'opus' {
  if (STRATEGIC_BOTS.has(botType)) return 'opus'
  if (HEAVY_BOTS.has(botType)) return 'sonnet'
  return 'haiku'
}

interface ServiceCost {
  service: string
  source: 'api' | 'botlog-est' | 'skipped' | 'error'
  monthUsd: number | null
  detail: string
  alert?: string
}

const usd = (n: number) => `$${n.toFixed(2)}`

// ── Anthropic Claude ──
async function getAnthropicCost(monthStartIso: string): Promise<ServiceCost> {
  if (!ANTHROPIC_ADMIN_KEY) {
    const est = await estimateClaudeFromBotLog(monthStartIso)
    return {
      service: 'Anthropic Claude API',
      source: 'botlog-est',
      monthUsd: est.total,
      detail: `${est.detail} — 에이전트 토큰 추정(Claude Code 개발분 제외). Admin 키 연결 시 실측 전환`,
      alert: est.total > THRESHOLDS.claudeMonthlyUsd ? `Claude 월 추정 ${usd(est.total)} > 임계 ${usd(THRESHOLDS.claudeMonthlyUsd)}` : undefined,
    }
  }
  try {
    const url = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${encodeURIComponent(monthStartIso)}&bucket_width=1d&group_by[]=description`
    const res = await fetch(url, {
      headers: { 'anthropic-version': '2023-06-01', 'X-Api-Key': ANTHROPIC_ADMIN_KEY },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { service: 'Anthropic Claude API', source: 'error', monthUsd: null, detail: `cost_report HTTP ${res.status}` }
    const json = (await res.json()) as { data?: Array<{ results?: Array<{ amount: string; model?: string | null }> }> }
    let total = 0
    const byModel: Record<string, number> = {}
    for (const bucket of json.data ?? []) {
      for (const r of bucket.results ?? []) {
        const cents = parseFloat(r.amount) // lowest unit(cents) decimal string
        if (Number.isNaN(cents)) continue
        const dollars = cents / 100
        total += dollars
        const key = r.model ?? 'other'
        byModel[key] = (byModel[key] ?? 0) + dollars
      }
    }
    const modelDetail = Object.entries(byModel).sort((a, b) => b[1] - a[1]).map(([m, c]) => `${m} ${usd(c)}`).join(', ')
    return {
      service: 'Anthropic Claude API',
      source: 'api',
      monthUsd: total,
      detail: modelDetail || '데이터 없음',
      alert: total > THRESHOLDS.claudeMonthlyUsd ? `Claude 월 실측 ${usd(total)} > 임계 ${usd(THRESHOLDS.claudeMonthlyUsd)}` : undefined,
    }
  } catch (err) {
    return { service: 'Anthropic Claude API', source: 'error', monthUsd: null, detail: err instanceof Error ? err.message : String(err) }
  }
}

async function estimateClaudeFromBotLog(monthStartIso: string): Promise<{ total: number; detail: string }> {
  const logs = await prisma.botLog.findMany({
    where: { details: { contains: 'tokens:' }, createdAt: { gte: new Date(monthStartIso) } },
    select: { botType: true, details: true },
  })
  const byTier: Record<string, { in: number; out: number; cache: number }> = {}
  for (const l of logs) {
    const tier = tierOf(l.botType)
    byTier[tier] ??= { in: 0, out: 0, cache: 0 }
    const matches = (l.details ?? '').matchAll(/in:(\d+)\s+out:(\d+)(?:\s+hit:(\d+))?/g)
    for (const m of matches) {
      byTier[tier].in += Number(m[1])
      byTier[tier].out += Number(m[2])
      byTier[tier].cache += Number(m[3] ?? 0)
    }
  }
  let total = 0
  const parts: string[] = []
  for (const [tier, t] of Object.entries(byTier)) {
    const p = FALLBACK_PRICING[tier as 'haiku' | 'sonnet' | 'opus']
    const cost = (t.in * p.in + t.out * p.out + t.cache * p.cache) / 1_000_000
    total += cost
    parts.push(`${tier} ${usd(cost)}`)
  }
  // 대부분 에이전트가 직접 SDK 호출이라 BotLog 토큰 로깅이 극소수(실측의 1% 미만) — 폴백은 신뢰 불가, Admin 키 필수
  const warn = `⚠️ BotLog 토큰로깅 ${logs.length}건만 집계 — 실측 대비 대폭 과소, Admin 키 연결 전엔 신뢰 불가`
  return { total, detail: parts.length ? `${parts.join(', ')} ${warn}` : '토큰 로그 없음' }
}

// ── OpenAI ──
async function getOpenAICost(monthStartUnix: number): Promise<ServiceCost> {
  if (!OPENAI_ADMIN_KEY) return { service: 'OpenAI API', source: 'skipped', monthUsd: null, detail: 'Admin 키 미설정 (대시보드 확인 필요)' }
  try {
    const url = `https://api.openai.com/v1/organization/costs?start_time=${monthStartUnix}&bucket_width=1d&limit=31`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${OPENAI_ADMIN_KEY}` }, signal: AbortSignal.timeout(20000) })
    if (!res.ok) return { service: 'OpenAI API', source: 'error', monthUsd: null, detail: `costs HTTP ${res.status}` }
    const json = (await res.json()) as { data?: Array<{ results?: Array<{ amount?: { value?: number } }> }> }
    let total = 0
    for (const b of json.data ?? []) for (const r of b.results ?? []) total += r.amount?.value ?? 0
    return {
      service: 'OpenAI API',
      source: 'api',
      monthUsd: total,
      detail: total > THRESHOLDS.openaiAnyUsd ? '⚠️ API 사용 감지' : '$0 정상',
      alert: total > THRESHOLDS.openaiAnyUsd ? `OpenAI API 사용 감지 ${usd(total)} — 0 유지 정책 위반` : undefined,
    }
  } catch (err) {
    return { service: 'OpenAI API', source: 'error', monthUsd: null, detail: err instanceof Error ? err.message : String(err) }
  }
}

// ── Vercel ──
async function getVercelCost(): Promise<ServiceCost> {
  if (!VERCEL_TOKEN) return { service: 'Vercel', source: 'skipped', monthUsd: null, detail: 'Access Token 미설정 (대시보드 확인 필요)' }
  // 키 연결 후 /billing/charges(FOCUS JSONL) 또는 usage 엔드포인트로 구현 — 현재 골격
  return { service: 'Vercel', source: 'skipped', monthUsd: null, detail: 'Token 있음 — billing/charges 파서 구현 예정' }
}

// ── 메인 ──
async function main(): Promise<void> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const monthStartIso = monthStart.toISOString()
  const monthStartUnix = Math.floor(monthStart.getTime() / 1000)

  const results = await Promise.all([
    getAnthropicCost(monthStartIso),
    getOpenAICost(monthStartUnix),
    getVercelCost(),
  ])

  console.log(`\n===== 비용 감시 리포트 (${now.toISOString().slice(0, 10)}, 월 누계) =====`)
  let knownTotal = 0
  for (const r of results) {
    const amt = r.monthUsd != null ? usd(r.monthUsd) : '—'
    const tag = r.source === 'api' ? '실측' : r.source === 'botlog-est' ? '추정' : r.source === 'error' ? '오류' : '스킵'
    console.log(`[${tag}] ${r.service}: ${amt}  ${r.detail}`)
    if (r.monthUsd != null) knownTotal += r.monthUsd
  }
  console.log(`-------------------------------------------`)
  console.log(`측정된 합계(추정+실측): ${usd(knownTotal)}  ※ 구독(Claude Max·ChatGPT Pro)·미연결 서비스 제외`)

  const alerts = results.map(r => r.alert).filter(Boolean) as string[]
  if (alerts.length) {
    console.log(`\n🔴 경고 ${alerts.length}건:`)
    alerts.forEach(a => console.log('  - ' + a))
    await notifySlack({
      level: 'critical',
      agent: 'CFO',
      title: `💰 비용 경고 ${alerts.length}건`,
      body: alerts.join('\n'),
    }).catch(() => {})
  } else {
    console.log('\n✅ 임계 초과 없음')
  }

  const skipped = results.filter(r => r.source === 'skipped').map(r => r.service)
  if (skipped.length) console.log(`\nℹ️ 키 미연결(대시보드 확인 필요): ${skipped.join(', ')}`)
}

main()
  .then(() => disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[CFO cost-monitor] 오류:', err)
    process.exit(1)
  })
