/**
 * 구글 애즈 일일 성과 리포트 → Slack #리포트 알림
 *
 * 수집 지표:
 *   - 캠페인별 노출수, 클릭수, CTR, CPC, 비용
 *   - 캠페인별 예산 소진율
 *   - 전일 대비 변화
 *
 * 크론: 매일 09:00 KST (GitHub Actions)
 * runner.ts 핸들러: 'cmo:google-ads-report'
 *
 * 비용 영향: Google Ads API 조회 → 무료
 */

import { createGoogleAdsClient } from '../lib/google-ads-client.js'

const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_REPORT ?? ''
const DAILY_BUDGET_TOTAL = 30000  // 원 (3개 캠페인 합계)

interface CampaignMetrics {
  name: string
  desireCode: string
  impressions: number
  clicks: number
  ctr: number         // %
  avgCpc: number      // 원
  cost: number        // 원
  budgetUsedPct: number
}

// ──────────────────────────────────────────────────────────────
// 어제 날짜 (YYYY-MM-DD)
// ──────────────────────────────────────────────────────────────

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

// ──────────────────────────────────────────────────────────────
// 구글 애즈 API로 성과 조회
// ──────────────────────────────────────────────────────────────

async function fetchMetrics(yesterday: string): Promise<CampaignMetrics[]> {
  const customer = await createGoogleAdsClient()

  const gaql = `
    SELECT
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.cost_micros,
      campaign_budget.amount_micros
    FROM campaign
    WHERE
      segments.date = '${yesterday}'
      AND campaign.name LIKE '우나어_%'
    ORDER BY metrics.cost_micros DESC
  `

  const rows = await customer.query(gaql) as Array<{
    campaign: { name: string }
    metrics: {
      impressions: number
      clicks: number
      ctr: number
      average_cpc: number
      cost_micros: number
    }
    campaign_budget: { amount_micros: number }
  }>

  return rows.map(row => {
    const costKrw = Math.round(row.metrics.cost_micros / 1_000_000)
    const budgetKrw = Math.round(row.campaign_budget.amount_micros / 1_000_000)
    const avgCpcKrw = Math.round(row.metrics.average_cpc / 1_000_000)
    const desireCode = row.campaign.name.includes('RELATION') ? 'RELATION'
      : row.campaign.name.includes('HEALTH') ? 'HEALTH'
      : 'RETIRE+MONEY'

    return {
      name: row.campaign.name,
      desireCode,
      impressions: row.metrics.impressions,
      clicks: row.metrics.clicks,
      ctr: Math.round(row.metrics.ctr * 1000) / 10,  // 소수점 1자리 %
      avgCpc: avgCpcKrw,
      cost: costKrw,
      budgetUsedPct: budgetKrw > 0 ? Math.round((costKrw / budgetKrw) * 100) : 0,
    }
  })
}

// ──────────────────────────────────────────────────────────────
// Slack 메시지 포맷
// ──────────────────────────────────────────────────────────────

function buildSlackMessage(metrics: CampaignMetrics[], date: string): object {
  const totalCost = metrics.reduce((sum, m) => sum + m.cost, 0)
  const totalClicks = metrics.reduce((sum, m) => sum + m.clicks, 0)
  const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0)
  const budgetUsedPct = Math.round((totalCost / DAILY_BUDGET_TOTAL) * 100)

  const statusEmoji = budgetUsedPct >= 90 ? '🔴'
    : budgetUsedPct >= 50 ? '🟡'
    : '🟢'

  const campaignLines = metrics.map(m => {
    const ctrIcon = m.ctr >= 3 ? '🔥' : m.ctr >= 1 ? '✅' : '⚠️'
    return [
      `*${m.desireCode}* | 노출 ${m.impressions.toLocaleString()} | 클릭 ${m.clicks} | CTR ${m.ctr}% ${ctrIcon}`,
      `예산 소진 ${m.budgetUsedPct}% | 평균CPC ₩${m.avgCpc.toLocaleString()} | 비용 ₩${m.cost.toLocaleString()}`,
    ].join('\n')
  }).join('\n\n')

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📊 구글 애즈 일일 리포트 — ${date}` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `${statusEmoji} *총 비용*: ₩${totalCost.toLocaleString()} / ₩${DAILY_BUDGET_TOTAL.toLocaleString()} (${budgetUsedPct}%)`,
            `총 노출: ${totalImpressions.toLocaleString()} | 총 클릭: ${totalClicks}`,
          ].join('\n'),
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: campaignLines || '데이터 없음 (캠페인 비활성 또는 예산 소진)' },
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: 'CTR 기준: 🔥 3%↑ 우수 | ✅ 1~3% 보통 | ⚠️ 1%↓ 점검 필요',
        }],
      },
    ],
  }
}

// ──────────────────────────────────────────────────────────────
// Slack 전송
// ──────────────────────────────────────────────────────────────

async function sendToSlack(message: object): Promise<void> {
  if (!SLACK_WEBHOOK) {
    console.log('[daily-report] SLACK_WEBHOOK_REPORT 미설정 — 콘솔 출력만')
    console.log(JSON.stringify(message, null, 2))
    return
  }

  const res = await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })

  if (!res.ok) {
    throw new Error(`Slack 전송 실패: ${res.status} ${await res.text()}`)
  }
  console.log('[daily-report] Slack #리포트 전송 완료')
}

// ──────────────────────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const yesterday = getYesterday()
  console.log(`[daily-report] ${yesterday} 성과 조회 시작`)

  const metrics = await fetchMetrics(yesterday)

  if (metrics.length === 0) {
    console.log('[daily-report] 조회된 캠페인 없음 — 캠페인 활성화 여부 확인 필요')
    return
  }

  const message = buildSlackMessage(metrics, yesterday)
  await sendToSlack(message)

  // 콘솔 요약
  for (const m of metrics) {
    console.log(`  ${m.desireCode}: 클릭 ${m.clicks} | CTR ${m.ctr}% | ₩${m.cost.toLocaleString()}`)
  }
}

main().catch(err => {
  console.error('[daily-report] 오류:', err)
  process.exit(1)
})
