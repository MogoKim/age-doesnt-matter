/**
 * Ads Data Agent
 * Google Ads 성과 데이터 수집 (Playwright)
 * 성과 미달 소재 감지 → creative-optimizer.ts로 전달
 *
 * 실행: runner.ts 'design:ads-loop' 핸들러로 호출
 * 크론: 매일 09:00 KST (00:00 UTC) — agents-design.yml
 *
 * 비용: $0 (Playwright 로컬 실행)
 * 주의: Google Ads 계정 접속 자격증명 필요
 *       GOOGLE_ADS_EMAIL, GOOGLE_ADS_PASSWORD 환경변수
 *
 * // LOCAL ONLY — Playwright 브라우저 바이너리 필요, GitHub Actions 가능 (playwright install 필요)
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5-20251001'

export interface AdCreativePerformance {
  creativeId: string
  creativeName: string
  impressions: number
  clicks: number
  ctr: number         // %
  cpc: number         // 원
  conversions: number
  costPerConversion: number
  status: 'active' | 'paused' | 'removed'
  dateRange: string
}

export interface AdsReport {
  date: string
  accountName: string
  totalSpend: number
  totalImpressions: number
  totalClicks: number
  avgCTR: number
  avgCPC: number
  creatives: AdCreativePerformance[]
  underperforming: AdCreativePerformance[]
}

/** 성과 기준 (docs/design/GOOGLE_ADS_LOOP.md 기준) */
export const PERFORMANCE_THRESHOLDS = {
  ctrDanger: 1.0,        // CTR 1% 미만 → 위험
  ctrWarning: 1.5,       // CTR 1.5% 미만 → 경고
  cpcDanger: 500,        // CPC 500원 초과 → 위험
  cpcWarning: 300,       // CPC 300원 초과 → 경고
  minImpressions: 1000,  // 최소 노출수 (통계적 유의성)
}

/**
 * Google Ads 성과 데이터 수집
 * Playwright를 사용해 Google Ads 대시보드에서 데이터 스크래핑
 *
 * NOTE: 실제 운영 시 Google Ads API (OAuth2) 사용 권장
 * 현재는 Playwright UI 스크래핑으로 구현 (API 심사 기간 동안 임시)
 */
export async function collectAdsData(): Promise<AdsReport> {
  console.log('[Ads Data Agent] Google Ads 데이터 수집 시작')

  // Playwright 동적 import (미설치 환경 대비)
  let playwright: typeof import('playwright')
  try {
    playwright = await import('playwright')
  } catch {
    throw new Error('playwright 미설치. npm install playwright 후 npx playwright install chromium 실행 필요')
  }

  const email = process.env.GOOGLE_ADS_EMAIL
  const password = process.env.GOOGLE_ADS_PASSWORD

  if (!email || !password) {
    throw new Error('GOOGLE_ADS_EMAIL 또는 GOOGLE_ADS_PASSWORD 환경변수 없음')
  }

  const browser = await playwright.chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Google 로그인
    await page.goto('https://ads.google.com')
    await page.fill('input[type="email"]', email)
    await page.click('#identifierNext')
    await page.waitForSelector('input[type="password"]', { timeout: 5000 })
    await page.fill('input[type="password"]', password)
    await page.click('#passwordNext')
    await page.waitForNavigation({ timeout: 10000 })

    // 어제 날짜 범위 설정 및 데이터 수집
    // NOTE: Google Ads UI는 자주 변경되므로 셀렉터는 유지보수 필요
    await page.waitForTimeout(3000)

    // Claude에게 현재 화면 분석 위임 (Vision API 활용)
    const screenshot = await page.screenshot({ type: 'png', fullPage: false })
    const base64Screenshot = screenshot.toString('base64')

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Screenshot,
            },
          },
          {
            type: 'text',
            text: `이 Google Ads 대시보드 스크린샷에서 광고 소재별 성과 데이터를 추출해주세요.
JSON 형식으로 응답:
{
  "date": "YYYY-MM-DD",
  "accountName": "계정명",
  "totalSpend": 숫자(원),
  "totalImpressions": 숫자,
  "totalClicks": 숫자,
  "avgCTR": 숫자(%),
  "avgCPC": 숫자(원),
  "creatives": [
    {
      "creativeId": "ID",
      "creativeName": "소재명",
      "impressions": 숫자,
      "clicks": 숫자,
      "ctr": 숫자(%),
      "cpc": 숫자(원),
      "conversions": 숫자,
      "costPerConversion": 숫자,
      "status": "active|paused|removed",
      "dateRange": "날짜범위"
    }
  ]
}
데이터가 보이지 않으면 로그인이 필요하거나 다른 화면일 수 있습니다.`,
          },
        ],
      }],
    })

    const content = response.content[0]
    if (content.type !== 'text') throw new Error('스크린샷 분석 실패')

    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // 로그인 실패 또는 UI 변경 시 빈 리포트 반환
      console.warn('[Ads Data Agent] 데이터 파싱 실패 — Google Ads UI 구조 변경 또는 로그인 실패')
      return createEmptyReport()
    }

    const rawReport = JSON.parse(jsonMatch[0]) as AdsReport

    // 성과 미달 소재 필터링
    rawReport.underperforming = rawReport.creatives.filter(c =>
      c.impressions >= PERFORMANCE_THRESHOLDS.minImpressions &&
      (c.ctr < PERFORMANCE_THRESHOLDS.ctrDanger ||
       c.cpc > PERFORMANCE_THRESHOLDS.cpcDanger)
    )

    console.log(`[Ads Data Agent] 수집 완료: ${rawReport.creatives.length}개 소재, ${rawReport.underperforming.length}개 성과 미달`)
    return rawReport

  } finally {
    await browser.close()
  }
}

function createEmptyReport(): AdsReport {
  return {
    date: new Date().toISOString().slice(0, 10),
    accountName: '우나어',
    totalSpend: 0,
    totalImpressions: 0,
    totalClicks: 0,
    avgCTR: 0,
    avgCPC: 0,
    creatives: [],
    underperforming: [],
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  collectAdsData()
    .then(report => console.log(JSON.stringify(report, null, 2)))
    .catch(console.error)
}
