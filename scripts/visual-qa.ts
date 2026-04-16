#!/usr/bin/env tsx
/**
 * Visual QA — Claude Haiku로 주요 페이지 시각적 이상 감지
 *
 * 사용법: npx tsx scripts/visual-qa.ts --url https://age-doesnt-matter.com
 *
 * 체크 항목:
 *   - 텍스트 잘림 / 레이아웃 깨짐
 *   - 터치 타겟 너무 작음 (최소 52×52px)
 *   - 폰트 크기 너무 작음 (최소 15px, 본문 18px)
 *   - 브랜드 컬러 (#FF6F61) 적용 여부
 *   - 명백한 UI 버그
 *
 * 비용: claude-haiku-4-5 기준 ~$0.02/실행 (10개 스크린샷)
 * 월 30배포 × $0.02 = ~$0.60
 */

import Anthropic from '@anthropic-ai/sdk'
import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const DEFAULT_URL = 'https://age-doesnt-matter.com'
const RESULT_FILE = 'visual-qa-result.json'

interface VisualCheckResult {
  page: string
  viewport: 'mobile' | 'desktop'
  url: string
  passed: boolean
  score: number
  issues: string[]
  warnings: string[]
  summary: string
}

interface VisualQAReport {
  version: string
  baseUrl: string
  timestamp: string
  totalPages: number
  passed: number
  warned: number
  failed: number
  results: VisualCheckResult[]
}

function parseArgs(): string {
  const idx = process.argv.indexOf('--url')
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : DEFAULT_URL
}

const PAGES = [
  { path: '/', name: '홈' },
  { path: '/community', name: '커뮤니티' },
  { path: '/magazine', name: '매거진' },
  { path: '/jobs', name: '일자리' },
  { path: '/best', name: '베스트' },
]

const VIEWPORTS = [
  { name: 'mobile' as const, width: 390, height: 844, deviceScaleFactor: 2 },
  { name: 'desktop' as const, width: 1440, height: 900, deviceScaleFactor: 1 },
]

const CLAUDE_PROMPT = `이 웹페이지 스크린샷을 QA 관점에서 분석해주세요.
서비스 정보: "우리 나이가 어때서" — 50·60대 커뮤니티/일자리 플랫폼. 시니어 친화 UI 원칙 적용.

체크 항목:
1. 텍스트가 잘려있거나 요소끼리 겹치는 곳이 있나요?
2. 버튼/링크의 터치 타겟이 너무 작아 보이는 곳이 있나요? (최소 52×52px 원칙)
3. 레이아웃이 깨진 곳이 있나요? (overflow, 비정렬, 흘러넘침 등)
4. 폰트 크기가 너무 작아 가독성이 떨어지는 곳이 있나요? (본문 최소 18px 원칙)
5. 브랜드 컬러(주황-빨간 계열 #FF6F61)가 전혀 보이지 않거나 이상하게 적용됐나요?
6. 이미지가 깨져있거나 alt 텍스트만 보이는 곳이 있나요?
7. 명백한 UI 버그나 이상한 점이 있나요?

응답은 반드시 아래 JSON 형식으로만 답하세요 (설명 없이 JSON만):
{
  "passed": true,
  "score": 85,
  "issues": ["심각한 문제점 목록 (passed=false 원인)"],
  "warnings": ["경미한 경고 목록 (passed=true지만 주의 필요)"],
  "summary": "한 줄 요약"
}`

async function analyzeScreenshot(
  client: Anthropic,
  screenshot: Buffer,
  pageName: string,
  viewport: 'mobile' | 'desktop',
  pageUrl: string,
): Promise<VisualCheckResult> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.toString('base64'),
              },
            },
            {
              type: 'text',
              text: CLAUDE_PROMPT,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        page: pageName,
        viewport,
        url: pageUrl,
        passed: false,
        score: 0,
        issues: ['Claude 응답 파싱 실패'],
        warnings: [],
        summary: '분석 실패',
      }
    }

    const result = JSON.parse(jsonMatch[0])
    return {
      page: pageName,
      viewport,
      url: pageUrl,
      passed: result.passed ?? false,
      score: result.score ?? 0,
      issues: result.issues ?? [],
      warnings: result.warnings ?? [],
      summary: result.summary ?? '',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      page: pageName,
      viewport,
      url: pageUrl,
      passed: false,
      score: 0,
      issues: [`분석 중 오류: ${msg}`],
      warnings: [],
      summary: '오류 발생',
    }
  }
}

async function notifySlackQA(report: VisualQAReport): Promise<void> {
  const slackToken = process.env.SLACK_BOT_TOKEN
  const channelQA = process.env.SLACK_CHANNEL_QA
  if (!slackToken || !channelQA) return

  const failed = report.results.filter((r) => !r.passed)
  const warned = report.results.filter((r) => r.passed && r.warnings.length > 0)

  const emoji = failed.length > 0 ? ':x:' : warned.length > 0 ? ':warning:' : ':white_check_mark:'
  const status = failed.length > 0 ? 'FAIL' : warned.length > 0 ? 'WARN' : 'PASS'

  const lines = [
    `${emoji} *Visual QA ${status}* — ${report.baseUrl}`,
    `페이지: ${report.totalPages}개 | 통과: ${report.passed} | 경고: ${report.warned} | 실패: ${report.failed}`,
  ]

  if (failed.length > 0) {
    lines.push('\n*실패 항목:*')
    for (const r of failed) {
      lines.push(`• ${r.page} (${r.viewport}): ${r.issues.join(', ')}`)
    }
  }
  if (warned.length > 0) {
    lines.push('\n*경고 항목:*')
    for (const r of warned) {
      lines.push(`• ${r.page} (${r.viewport}): ${r.warnings.join(', ')}`)
    }
  }

  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channelQA,
        text: lines.join('\n'),
      }),
    })
  } catch {
    console.warn('Slack 알림 전송 실패 (계속 진행)')
  }
}

async function main() {
  const baseUrl = parseArgs()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  console.log(`🔍 Visual QA 시작: ${baseUrl}`)
  console.log(`   페이지: ${PAGES.length}개 × 뷰포트: ${VIEWPORTS.length}개 = ${PAGES.length * VIEWPORTS.length}개 스크린샷\n`)

  const results: VisualCheckResult[] = []
  const browser = await chromium.launch({ args: ['--no-sandbox'] })

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
    })
    const page = await context.newPage()

    for (const { path: pagePath, name } of PAGES) {
      const pageUrl = `${baseUrl}${pagePath}`
      process.stdout.write(`  ${viewport.name.padEnd(8)} ${name.padEnd(10)} `)

      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await page.waitForTimeout(2000) // 광고/이미지 로딩 대기
        const screenshot = await page.screenshot({ fullPage: false })

        const result = await analyzeScreenshot(client, screenshot, name, viewport.name, pageUrl)
        results.push(result)

        if (!result.passed) {
          console.log(`❌ (${result.score}/100) ${result.summary}`)
        } else if (result.warnings.length > 0) {
          console.log(`⚠️  (${result.score}/100) ${result.summary}`)
        } else {
          console.log(`✅ (${result.score}/100) ${result.summary}`)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.log(`❌ 페이지 접근 실패: ${msg}`)
        results.push({
          page: name,
          viewport: viewport.name,
          url: pageUrl,
          passed: false,
          score: 0,
          issues: [`페이지 접근 실패: ${msg}`],
          warnings: [],
          summary: '접근 불가',
        })
      }
    }

    await context.close()
    console.log()
  }

  await browser.close()

  // 리포트 생성
  const passed = results.filter((r) => r.passed && r.warnings.length === 0).length
  const warned = results.filter((r) => r.passed && r.warnings.length > 0).length
  const failed = results.filter((r) => !r.passed).length

  const report: VisualQAReport = {
    version: new Date().toISOString().slice(0, 10),
    baseUrl,
    timestamp: new Date().toISOString(),
    totalPages: results.length,
    passed,
    warned,
    failed,
    results,
  }

  fs.writeFileSync(RESULT_FILE, JSON.stringify(report, null, 2))
  console.log(`\n📊 결과: 통과 ${passed} | 경고 ${warned} | 실패 ${failed}`)
  console.log(`📄 상세 리포트: ${path.resolve(RESULT_FILE)}`)

  // Slack 알림 (토큰 있을 때만)
  await notifySlackQA(report)

  // 실패 항목 있으면 exit 1
  if (failed > 0) {
    console.error('\n❌ Visual QA 실패 — 위 항목 확인 필요')
    process.exit(1)
  }

  if (warned > 0) {
    console.warn('\n⚠️  Visual QA 경고 — 배포 차단하지 않지만 확인 권장')
  } else {
    console.log('\n✅ Visual QA 전체 통과')
  }
}

main().catch((e) => {
  console.error('Visual QA 오류:', e)
  process.exit(1)
})
