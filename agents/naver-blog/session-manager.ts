/**
 * 네이버 블로그 세션 관리자
 * NID_AUT(~1년)로 NID_SES(~30일) 자동 갱신 — cafe/session-manager.ts 패턴 재사용
 *
 * // LOCAL ONLY — Chrome 필요, GitHub Actions 실행 불가
 *
 * 실행 모드:
 *   1. 독립 실행 (세션 상태 확인/갱신): npx tsx agents/naver-blog/session-manager.ts
 *   2. poster.ts에서 checkBlogSession() 호출 — pre-flight 검증
 *
 * BLOG_HALTED 플래그:
 *   갱신 3회 실패 시 .blog-halted 생성 → poster.ts 전면 차단
 *   해제: npx tsx agents/naver-blog/export-blog-cookies.ts (수동 쿠키 재추출)
 */

import { readFileSync, existsSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'
import {
  BLOG_STORAGE_STATE_PATH,
  BLOG_HALTED_FLAG,
  BROWSER_ARGS,
  USER_AGENT,
  sleep,
  kstNow,
} from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// ── 환경변수 로드 (launchd 독립 실행 시 .env.local 미상속) ──
function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
  } catch { /* 파일 없으면 무시 */ }
}
loadEnvFile(resolve(projectRoot, '.env.local'))
loadEnvFile(resolve(projectRoot, '.env'))

const { sendSlackMessage } = await import('../core/notifier.js')

// ── 경로 상수 ──
const BACKUP_DIR = resolve(__dirname, 'session-backups')

// ── 임계값 ──
const NID_SES_REFRESH_THRESHOLD_DAYS = 5
const NID_AUT_WARNING_DAYS = 60
const NID_AUT_CRITICAL_DAYS = 30
const MAX_REFRESH_RETRIES = 3
const RETRY_DELAY_MS = 30_000

// ── 타입 ──
interface CookieEntry {
  name: string; value: string; domain: string; path: string
  expires: number; httpOnly: boolean; secure: boolean; sameSite: string
}

interface StorageState {
  cookies: CookieEntry[]
  origins: unknown[]
}

interface SessionStatus {
  nidAutDaysRemaining: number
  nidSesDaysRemaining: number
  needsRefresh: boolean
  autExpiringSoon: boolean
  autCritical: boolean
  isHalted: boolean
}

function daysUntil(unixSeconds: number): number {
  return (unixSeconds * 1000 - Date.now()) / 86_400_000
}

// ── 세션 상태 확인 ──
export function checkSessionStatus(): SessionStatus {
  const isHalted = existsSync(BLOG_HALTED_FLAG)

  if (!existsSync(BLOG_STORAGE_STATE_PATH)) {
    return { nidAutDaysRemaining: -1, nidSesDaysRemaining: -1, needsRefresh: true, autExpiringSoon: false, autCritical: false, isHalted }
  }

  let state: StorageState
  try {
    state = JSON.parse(readFileSync(BLOG_STORAGE_STATE_PATH, 'utf-8')) as StorageState
  } catch {
    return { nidAutDaysRemaining: -1, nidSesDaysRemaining: -1, needsRefresh: true, autExpiringSoon: false, autCritical: false, isHalted }
  }

  const nidAut = state.cookies.find(c => c.name === 'NID_AUT')
  const nidSes = state.cookies.find(c => c.name === 'NID_SES')
  const autDays = nidAut ? daysUntil(nidAut.expires) : -1
  const sesDays = nidSes ? daysUntil(nidSes.expires) : -1

  return {
    nidAutDaysRemaining: autDays,
    nidSesDaysRemaining: sesDays,
    needsRefresh: sesDays < NID_SES_REFRESH_THRESHOLD_DAYS,
    autExpiringSoon: autDays >= 0 && autDays <= NID_AUT_WARNING_DAYS,
    autCritical: autDays >= 0 && autDays <= NID_AUT_CRITICAL_DAYS,
    isHalted,
  }
}

// ── 스토리지 백업 ──
function backupStorageState(): void {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  copyFileSync(BLOG_STORAGE_STATE_PATH, resolve(BACKUP_DIR, `blog-storage-state-${ts}.json`))

  const files = readdirSync(BACKUP_DIR).filter(f => f.startsWith('blog-storage-state-')).sort()
  for (const old of files.slice(0, Math.max(0, files.length - 7))) {
    unlinkSync(resolve(BACKUP_DIR, old))
  }
}

// ── NID_SES 갱신 (NID_AUT로 headless Playwright) ──
async function refreshNidSes(): Promise<boolean> {
  if (!existsSync(BLOG_STORAGE_STATE_PATH)) {
    console.error('[BlogSession] blog-storage-state.json 없음')
    writeFileSync(BLOG_HALTED_FLAG, kstNow())
    return false
  }

  let state: StorageState
  try {
    state = JSON.parse(readFileSync(BLOG_STORAGE_STATE_PATH, 'utf-8')) as StorageState
  } catch {
    writeFileSync(BLOG_HALTED_FLAG, kstNow())
    return false
  }

  const nidAutCookie = state.cookies.find(c => c.name === 'NID_AUT')
  if (!nidAutCookie) {
    console.error('[BlogSession] NID_AUT 없음 — 연간 수동 갱신 필요')
    writeFileSync(BLOG_HALTED_FLAG, kstNow())
    await sendSlackMessage({
      channel: process.env.SLACK_CHANNEL_SYSTEM ?? '',
      level: 'critical',
      message: `🚨 *블로그 세션 — NID_AUT 만료*\n수동 쿠키 재추출 필요:\n\`npx tsx agents/naver-blog/export-blog-cookies.ts\``,
    })
    return false
  }

  for (let attempt = 1; attempt <= MAX_REFRESH_RETRIES; attempt++) {
    console.log(`[BlogSession] NID_SES 갱신 시도 ${attempt}/${MAX_REFRESH_RETRIES}`)
    let browser = null
    try {
      browser = await chromium.launch({ headless: true, args: BROWSER_ARGS })
      const context = await browser.newContext({
        storageState: { cookies: [nidAutCookie], origins: [] },
        userAgent: USER_AGENT,
      })
      const page = await context.newPage()
      await page.goto('https://nid.naver.com/user2/help/myInfo', {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      })
      await sleep(3_000)

      const cookies = await context.cookies()
      const newNidSes = cookies.find(c => c.name === 'NID_SES')

      if (!newNidSes?.value) {
        console.warn(`[BlogSession] 시도 ${attempt}: NID_SES 미발급`)
        await browser.close()
        browser = null
        if (attempt < MAX_REFRESH_RETRIES) await sleep(RETRY_DELAY_MS)
        continue
      }

      backupStorageState()

      const hasExisting = state.cookies.some(c => c.name === 'NID_SES')
      const updatedCookies: CookieEntry[] = hasExisting
        ? state.cookies.map(c =>
            c.name === 'NID_SES'
              ? { ...c, value: newNidSes.value, expires: Math.floor(newNidSes.expires) }
              : c,
          )
        : [
            ...state.cookies,
            {
              name: 'NID_SES', value: newNidSes.value, domain: '.naver.com',
              path: '/', expires: Math.floor(newNidSes.expires),
              httpOnly: false, secure: true, sameSite: 'Lax',
            },
          ]

      writeFileSync(BLOG_STORAGE_STATE_PATH, JSON.stringify({ cookies: updatedCookies, origins: [] }, null, 2))
      console.log(`[BlogSession] ✅ NID_SES 갱신 성공 (시도 ${attempt})`)
      await browser.close()
      return true
    } catch (err) {
      console.error(`[BlogSession] 시도 ${attempt} 오류:`, err)
      if (browser) { try { await browser.close() } catch { /* ignore */ } }
      if (attempt < MAX_REFRESH_RETRIES) await sleep(RETRY_DELAY_MS)
    }
  }

  // 3회 모두 실패
  writeFileSync(BLOG_HALTED_FLAG, kstNow())
  await sendSlackMessage({
    channel: process.env.SLACK_CHANNEL_SYSTEM ?? '',
    level: 'critical',
    message: `🚨 *블로그 세션 갱신 3회 실패 — BLOG_HALTED*\n${kstNow()}\n수동 복구: \`npx tsx agents/naver-blog/export-blog-cookies.ts\``,
  })
  return false
}

// ── 로그인 상태 검증 (poster.ts pre-flight용) ──
export async function checkBlogSession(): Promise<boolean> {
  if (existsSync(BLOG_HALTED_FLAG)) {
    console.error('[BlogSession] BLOG_HALTED 플래그 존재 — 발행 차단')
    return false
  }

  if (!existsSync(BLOG_STORAGE_STATE_PATH)) {
    console.error('[BlogSession] blog-storage-state.json 없음 — export-blog-cookies.ts 실행 필요')
    return false
  }

  const status = checkSessionStatus()

  // NID_AUT 만료 경보
  if (status.autCritical) {
    await sendSlackMessage({
      channel: process.env.SLACK_CHANNEL_SYSTEM ?? '',
      level: 'warning',
      message: `⚠️ *블로그 NID_AUT 만료 임박* — ${Math.floor(status.nidAutDaysRemaining)}일 남음\n연간 수동 갱신 필요: \`npx tsx agents/naver-blog/export-blog-cookies.ts\``,
    })
  } else if (status.autExpiringSoon) {
    await sendSlackMessage({
      channel: process.env.SLACK_CHANNEL_SYSTEM ?? '',
      level: 'info',
      message: `ℹ️ 블로그 NID_AUT ${Math.floor(status.nidAutDaysRemaining)}일 남음 (30일 이내 갱신 예정)`,
    })
  }

  // NID_SES 갱신 필요
  if (status.needsRefresh) {
    console.log('[BlogSession] NID_SES 갱신 필요 — 자동 갱신 시도')
    return await refreshNidSes()
  }

  console.log(`[BlogSession] ✅ 세션 정상 — NID_SES ${Math.floor(status.nidSesDaysRemaining)}일 남음`)
  return true
}

// ── 독립 실행 진입점 ──
async function main() {
  console.log('[BlogSession] 세션 상태 확인')
  const status = checkSessionStatus()
  console.log(`  NID_AUT: ${status.nidAutDaysRemaining >= 0 ? `${Math.floor(status.nidAutDaysRemaining)}일` : '없음'}`)
  console.log(`  NID_SES: ${status.nidSesDaysRemaining >= 0 ? `${Math.floor(status.nidSesDaysRemaining)}일` : '없음'}`)
  console.log(`  갱신 필요: ${status.needsRefresh}`)
  console.log(`  HALTED: ${status.isHalted}`)

  if (status.needsRefresh && !status.isHalted) {
    const ok = await refreshNidSes()
    process.exit(ok ? 0 : 1)
  }
  process.exit(0)
}

// 직접 실행 시만 main() 호출 (import 시 실행 안 함)
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch(err => {
    console.error('[BlogSession] 오류:', err)
    process.exit(1)
  })
}
