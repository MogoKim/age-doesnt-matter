/**
 * Creative Optimizer
 * 광고 성과 데이터 → 성과 미달 소재 교체 의사결정 → 창업자 승인 요청
 * 승인 후 새 소재 자동 생성 (Graphic Designer 호출)
 *
 * 실행: design:ads-loop 핸들러에서 ads-data-agent.ts 이후 호출
 * 크론: 매일 09:00 KST — agents-design.yml
 *
 * 비용: Gemini Imagen $0.03/장 × 생성 소재 수 (성과 미달 시만 발생)
 *
 * // LOCAL ONLY — 이미지 생성 API 비용 발생
 */

import Anthropic from '@anthropic-ai/sdk'
import * as path from 'path'
import type { AdsReport, AdCreativePerformance } from './ads-data-agent.js'
import { runVariationEngine } from '../design/graphic-designer/variation-engine.js'

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const PROJECT_ROOT = path.join(__dirname, '../..')

const OPTIMIZER_SYSTEM_PROMPT = `당신은 우나어 광고 최적화 전문가입니다.

성과 기준:
- CTR 위험: 1% 미만 (교체 필요)
- CTR 경고: 1.5% 미만 (개선 권장)
- CPC 위험: 500원 초과 (교체 필요)
- CPC 경고: 300원 초과 (개선 권장)

역할:
1. 성과 미달 소재 분석
2. 교체 이유 설명 (창업자가 이해하기 쉽게)
3. 새 소재 방향 제안 (어떤 메시지, 어떤 비주얼로 개선할지)
4. AdminQueue에 승인 요청 등록`

export interface OptimizationDecision {
  action: 'replace' | 'improve' | 'keep'
  creativeId: string
  reason: string
  newCampaignSpec?: {
    subject: string
    messages: [string, string, string]
  }
}

/**
 * 성과 데이터 분석 → 최적화 결정
 */
export async function analyzeAndOptimize(report: AdsReport): Promise<void> {
  if (report.underperforming.length === 0) {
    console.log('[Creative Optimizer] 성과 미달 소재 없음 — 현재 소재 유지')
    return
  }

  console.log(`[Creative Optimizer] 성과 미달 ${report.underperforming.length}개 분석 중...`)

  // Claude로 최적화 전략 수립
  const analysisResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: OPTIMIZER_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `오늘 날짜: ${report.date}

성과 미달 소재 목록:
${report.underperforming.map(c => `
- 소재명: ${c.creativeName}
  CTR: ${c.ctr}% | CPC: ${c.cpc}원 | 노출: ${c.impressions}회 | 클릭: ${c.clicks}회
  상태: ${c.status}
`).join('')}

전체 계정 평균:
- CTR: ${report.avgCTR}% | CPC: ${report.avgCPC}원

각 성과 미달 소재에 대해 교체 전략을 JSON으로 제시해주세요:
{
  "decisions": [
    {
      "action": "replace|improve|keep",
      "creativeId": "소재ID",
      "reason": "교체 이유 (창업자 이해용, 2줄 이내)",
      "newCampaignSpec": {
        "subject": "새 이미지 주제 설명 (영어, Imagen용)",
        "messages": ["메시지1", "메시지2", "메시지3"]
      }
    }
  ]
}`,
    }],
  })

  const content = analysisResponse.content[0]
  if (content.type !== 'text') return

  const jsonMatch = content.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return

  const { decisions } = JSON.parse(jsonMatch[0]) as { decisions: OptimizationDecision[] }

  // 교체 필요 소재만 처리
  const toReplace = decisions.filter(d => d.action === 'replace')

  if (toReplace.length === 0) {
    console.log('[Creative Optimizer] 교체 필요 소재 없음')
    return
  }

  console.log(`\n[Creative Optimizer] ${toReplace.length}개 소재 교체 결정:`)
  toReplace.forEach(d => {
    console.log(`  - ${d.creativeId}: ${d.reason}`)
  })

  // Slack 알림 (창업자 승인 요청)
  await notifyFounderForApproval(toReplace, report)

  // NOTE: 실제 새 소재 생성은 창업자 Slack 승인 후 수동 트리거
  // (AdminQueue 패턴 — CLAUDE.md 규칙: 창업자 승인 없이 자동 생성 금지)
}

/**
 * Slack #에이전트 채널로 창업자 승인 요청
 */
async function notifyFounderForApproval(
  decisions: OptimizationDecision[],
  report: AdsReport
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    console.warn('[Creative Optimizer] SLACK_WEBHOOK_URL 없음 — Slack 알림 건너뜀')
    console.log('\n[창업자 승인 필요] 아래 소재 교체를 승인해주세요:')
    decisions.forEach(d => {
      console.log(`\n📊 ${d.creativeId}`)
      console.log(`이유: ${d.reason}`)
      if (d.newCampaignSpec) {
        console.log(`새 메시지: ${d.newCampaignSpec.messages.join(' / ')}`)
      }
    })
    return
  }

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 광고 소재 교체 승인 요청' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${report.date}* 기준 성과 미달 소재 ${decisions.length}개 교체 제안`,
      },
    },
    ...decisions.map(d => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*소재:* ${d.creativeId}\n*이유:* ${d.reason}\n*새 메시지:* ${d.newCampaignSpec?.messages.join(' / ') ?? '미정'}`,
      },
    })),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '승인하려면: `npx tsx agents/marketing-loop/creative-optimizer.ts --approve`',
      },
    },
  ]

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  })

  console.log('[Creative Optimizer] Slack 승인 요청 전송 완료')
}

/**
 * 창업자 승인 후 새 소재 생성 (--approve 플래그 사용)
 */
async function runApprovedGeneration(): Promise<void> {
  const reportPath = process.argv[3] ?? ''
  if (!reportPath) {
    console.error('사용법: npx tsx creative-optimizer.ts --approve [report.json 경로]')
    process.exit(1)
  }

  const { default: fs } = await import('fs/promises')
  const reportData = JSON.parse(await fs.readFile(reportPath, 'utf-8')) as {
    decisions: OptimizationDecision[]
  }

  for (const decision of reportData.decisions) {
    if (decision.action !== 'replace' || !decision.newCampaignSpec) continue

    await runVariationEngine({
      campaign: `교체_${decision.creativeId}`,
      subject: decision.newCampaignSpec.subject,
      messages: decision.newCampaignSpec.messages,
      style: 'photorealistic',
    })
  }
}

// 진입점
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--approve') {
    runApprovedGeneration().catch(console.error)
  } else {
    // 독립 실행 시: ads-data-agent에서 데이터 받아서 최적화
    import('./ads-data-agent.js')
      .then(({ collectAdsData }) => collectAdsData())
      .then(analyzeAndOptimize)
      .catch(console.error)
  }
}
