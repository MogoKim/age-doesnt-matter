// LOCAL ONLY — 네이버 카페 인기글 sync. Mac launchd 전용. GHA 실행 불가 (네이버 Playwright IP 차단).
import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// ⚠️ launchd 실행 시 .env.local 없으므로 직접 로드 (run-pipeline.ts와 동일 패턴)
// DB/Slack 의존 모듈 import 전 반드시 실행
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch {
    // 파일 없으면 무시
  }
}

loadEnvFile(resolve(projectRoot, '.env.local'))
loadEnvFile(resolve(projectRoot, '.env'))

const { prisma, disconnect } = await import('../core/db.js')
const { sendSlackMessage, notifySlack } = await import('../core/notifier.js')
const { syncPopularPosts } = await import('./crawler.js')
const { CAFE_CONFIGS } = await import('./config.js')

const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state.json')
const TIMEOUT_MS = 10 * 60 * 1000 // 10분 하드 타임아웃 — 21:25 전 강제 종료 보장

async function main() {
  const startTime = Date.now()
  console.log('[PopularSync] 시작 —', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))

  const timeoutId = setTimeout(() => {
    console.error('[PopularSync] 타임아웃 (10분) — 강제 종료')
    process.exit(1)
  }, TIMEOUT_MS)

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  try {
    const context = await browser.newContext({
      ...(existsSync(STORAGE_STATE_PATH) ? { storageState: STORAGE_STATE_PATH } : {}),
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    const results: string[] = []

    for (const cafe of CAFE_CONFIGS) {
      try {
        const { updated, created } = await syncPopularPosts(page, cafe)
        const line = `${cafe.id}: 업데이트 ${updated}건, 신규 ${created}건`
        results.push(line)
        console.log(`[PopularSync] ${line}`)
      } catch (err) {
        console.error(`[PopularSync] ${cafe.id} 실패 (계속 진행):`, err)
        results.push(`${cafe.id}: 실패`)
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000)
    await sendSlackMessage('REPORT', `[PopularSync] 완료 (${elapsed}초)\n${results.join('\n')}`)

    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        action: 'POPULAR_SYNC',
        status: 'SUCCESS',
        details: JSON.stringify({ results }),
        executionTimeMs: Date.now() - startTime,
      },
    })
  } catch (err) {
    console.error('[PopularSync] 치명적 오류:', err)
    await notifySlack({
      level: 'critical',
      agent: 'CAFE_CRAWLER',
      title: 'PopularSync 실패',
      body: String(err).slice(0, 300),
    })
  } finally {
    clearTimeout(timeoutId)
    await browser.close()
    await disconnect()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
