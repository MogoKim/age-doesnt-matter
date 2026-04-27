/**
 * 매거진 로컬 실행기
 * launchd에서 호출 — Playwright 기반 이미지 생성 + 매거진 발행 + Slack 알림
 *
 * // LOCAL ONLY — launchd (macOS) 전용, GitHub Actions 실행 불가
 *
 * 환경변수 (launchd plist에서 설정):
 *   SESSION_TIME=morning|evening
 *   IMAGE_GENERATOR=gemini|chatgpt
 *
 * 스케줄:
 *   morning (12:30 KST) — Gemini Imagen
 *   evening (21:00 KST) — ChatGPT
 *
 * 결과 파일: agents/cafe/.magazine-daily-YYYYMMDD.json (gitignore 포함)
 * Slack 채널: #매거진 (C0ARZET1X63)
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { WebClient } from '@slack/web-api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Slack #매거진 채널 ────────────────────────────────────────────────────────

const SLACK_CHANNEL_MAGAZINE = process.env.SLACK_CHANNEL_MAGAZINE ?? 'C0ARZET1X63'
const slack = process.env.SLACK_BOT_TOKEN
  ? new WebClient(process.env.SLACK_BOT_TOKEN)
  : null

async function sendMagazineSlack(text: string): Promise<void> {
  if (!slack) {
    console.log('[MagazineRunner] Slack 미설정:', text)
    return
  }
  try {
    await slack.chat.postMessage({
      channel: SLACK_CHANNEL_MAGAZINE,
      text,
      unfurl_links: false,
    })
  } catch (err) {
    console.error('[MagazineRunner] Slack 전송 실패:', err)
  }
}

// ─── 일일 결과 파일 ───────────────────────────────────────────────────────────

interface DailyStatus {
  date: string
  morningDone: boolean
  morningArticles: SessionArticle[]
  eveningDone: boolean
  eveningArticles: SessionArticle[]
}

interface SessionArticle {
  title: string
  category: string
  postId: string
  engine: string
}

function getDailyFilePath(): string {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dateStr = kstDate.toISOString().split('T')[0]  // YYYY-MM-DD
  return path.join(__dirname, `.magazine-daily-${dateStr}.json`)
}

async function readDailyStatus(): Promise<DailyStatus | null> {
  try {
    const raw = await fs.readFile(getDailyFilePath(), 'utf-8')
    return JSON.parse(raw) as DailyStatus
  } catch {
    return null
  }
}

async function saveDailyStatus(status: DailyStatus): Promise<void> {
  await fs.writeFile(getDailyFilePath(), JSON.stringify(status, null, 2), 'utf-8')
}

async function deleteDailyStatus(): Promise<void> {
  try {
    await fs.unlink(getDailyFilePath())
  } catch {
    // 파일 없으면 무시
  }
}

// ─── Slack 메시지 포맷 ────────────────────────────────────────────────────────

function formatSuccessMessage(status: DailyStatus): string {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dateStr = `${kstDate.getMonth() + 1}/${kstDate.getDate()}`

  const morningSection = status.morningDone && status.morningArticles.length > 0
    ? `📰 *오전 (12:30)*\n${status.morningArticles.map(a =>
        `• ${a.title} — ${a.category}\n  이미지: ${a.engine === 'gemini' ? 'Gemini Imagen' : 'ChatGPT'} × 2장`
      ).join('\n')}`
    : `📰 *오전 (12:30)*\n• 발행 없음`

  const eveningSection = status.eveningDone && status.eveningArticles.length > 0
    ? `📰 *저녁 (21:00)*\n${status.eveningArticles.map(a =>
        `• ${a.title} — ${a.category}\n  이미지: ${a.engine === 'gemini' ? 'Gemini Imagen' : 'ChatGPT'} × 2장`
      ).join('\n')}`
    : `📰 *저녁 (21:00)*\n• 발행 없음`

  const totalCount = status.morningArticles.length + status.eveningArticles.length

  return `✅ *${dateStr} 매거진 ${totalCount}건 발행 완료*\n──────────────────────────\n${morningSection}\n\n${eveningSection}\n──────────────────────────\n🔗 https://www.age-doesnt-matter.com/magazine`
}

function formatFailureMessage(session: 'morning' | 'evening', engine: string, stage: string, error: string): string {
  const sessionLabel = session === 'morning' ? '오전 (12:30)' : '저녁 (21:00)'
  return `❌ *매거진 발행 실패 — ${sessionLabel} 세션*\n단계: ${stage}\n엔진: ${engine}\n원인: ${error}\n→ 이번 회차 건너뜀`
}

// ─── 메인 실행 ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sessionTime = (process.env.SESSION_TIME ?? 'morning') as 'morning' | 'evening'
  const engine = (process.env.IMAGE_GENERATOR ?? 'gemini') as 'gemini' | 'chatgpt'

  console.log(`\n[MagazineRunner] 시작 — ${sessionTime} 세션 (${engine})`)

  // 이미지 엔진 확인
  if (engine !== 'gemini' && engine !== 'chatgpt') {
    const msg = `IMAGE_GENERATOR 값 오류: "${engine}" (gemini 또는 chatgpt 필요)`
    console.error('[MagazineRunner]', msg)
    await sendMagazineSlack(formatFailureMessage(sessionTime, engine, '환경변수 검사', msg))
    process.exit(0)
  }

  // magazine-generator.ts main() 호출
  let articles: { title: string; category: string; postId: string }[] = []
  try {
    const { main: runMagazine } = await import('./magazine-generator.js')
    articles = await runMagazine()
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[MagazineRunner] 매거진 생성 예외:', errMsg)
    await sendMagazineSlack(
      formatFailureMessage(sessionTime, engine, '매거진 생성', errMsg)
    )
    process.exit(0)
  }

  if (articles.length === 0) {
    console.warn('[MagazineRunner] 발행된 기사 없음 — 트렌드 부족 또는 이미지 생성 실패')
    await sendMagazineSlack(
      formatFailureMessage(sessionTime, engine, '매거진 발행', '발행된 기사 0건 (트렌드 점수 미달 또는 이미지 생성 실패)')
    )
    process.exit(0)
  }

  console.log(`[MagazineRunner] 발행 완료 — ${articles.length}건`)

  const sessionArticles: SessionArticle[] = articles.map(a => ({
    ...a,
    engine,
  }))

  // 일일 결과 파일 업데이트
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const dateStr = kstDate.toISOString().split('T')[0]

  const status = await readDailyStatus() ?? {
    date: dateStr,
    morningDone: false,
    morningArticles: [],
    eveningDone: false,
    eveningArticles: [],
  }

  if (sessionTime === 'morning') {
    status.morningDone = true
    status.morningArticles = sessionArticles
    await saveDailyStatus(status)
    console.log(`[MagazineRunner] 오전 결과 저장 완료 (${getDailyFilePath()})`)
    // 오전 세션은 저녁 알림 대기 — 개별 알림 없음
  } else {
    // 저녁 세션: 오전 결과와 합산 → 최종 Slack 알림
    status.eveningDone = true
    status.eveningArticles = sessionArticles
    await saveDailyStatus(status)

    const successMsg = formatSuccessMessage(status)
    await sendMagazineSlack(successMsg)
    console.log('[MagazineRunner] 일일 요약 Slack 전송 완료')

    // 결과 파일 삭제
    await deleteDailyStatus()
  }

  console.log('[MagazineRunner] 종료')
  process.exit(0)
}

main().catch(async (err) => {
  const errMsg = err instanceof Error ? err.message : String(err)
  console.error('[MagazineRunner] 치명적 오류:', errMsg)
  const session = (process.env.SESSION_TIME ?? 'morning') as 'morning' | 'evening'
  const engine = process.env.IMAGE_GENERATOR ?? 'unknown'
  await sendMagazineSlack(formatFailureMessage(session, engine, '런타임 오류', errMsg))
  process.exit(0)  // exit 0 — launchd가 재시작하지 않도록
})
