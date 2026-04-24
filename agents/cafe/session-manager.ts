// LOCAL ONLY — 네이버 카페 세션 자동 갱신 (launchd 매일 02:00 KST)
/**
 * 세션 매니저 — NID_AUT(~1년)로 NID_SES(~30일) 자동 갱신
 *
 * 실행 모드:
 *   1. launchd 독립 실행 (매일 02:00 KST) — main() 진입
 *   2. crawler.ts에서 ensureSession() 호출 — 최후 방어선
 *   3. runner.ts 핸들러 'cafe:session-refresh' — ensureSession() 직접 호출
 *
 * 갱신 흐름:
 *   checkSessionStatus() → needsRefresh=true → refreshNidSes() → verifyLoginAccess()
 *   실패 시 → .session-halted 플래그 생성 → 3채널 강력 알림 → 크롤러 전면 차단
 *
 * 리스크 헷징:
 *   - NID_SES ≤5일: 자동 갱신
 *   - 갱신 3회 실패: SESSION_HALTED + #대시보드/#시스템/#qa 동시 알림
 *   - NID_AUT ≤30일: 매일 2채널 경보
 *   - NID_AUT ≤60일: SYSTEM 경보
 *   - 크롤러 재실행 시 차단 중: 매번 2채널 재알림
 */
import {
  readFileSync,
  existsSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')

// ── 환경변수 로드 (launchd 독립 실행 시 .env.local 미설정) ──
// run-pipeline.ts와 동일한 패턴: DB/Slack import 전 반드시 실행
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
  } catch {
    // 파일 없으면 무시
  }
}
loadEnvFile(resolve(projectRoot, '.env.local'))
loadEnvFile(resolve(projectRoot, '.env'))

// DB / Slack — env 로드 후 동적 import (ESM top-level await)
const { prisma, disconnect } = await import('../core/db.js')
const { sendSlackMessage } = await import('../core/notifier.js')

// ── 경로 상수 ──
const STORAGE_STATE_PATH = resolve(__dirname, 'storage-state.json')
const BACKUP_DIR = resolve(__dirname, 'session-backups')
/** SESSION_HALTED 플래그 — crawler.ts에서도 import해서 사용 */
export const SESSION_HALTED_FLAG = resolve(__dirname, '.session-halted')

// ── 임계값 상수 ──
const NID_SES_REFRESH_THRESHOLD_DAYS = 5  // NID_SES 이 일수 이하면 갱신
const NID_AUT_WARNING_DAYS = 60           // NID_AUT 60일 이하: #시스템 경보
const NID_AUT_CRITICAL_DAYS = 30          // NID_AUT 30일 이하: 매일 #대시보드+#시스템
const MAX_REFRESH_RETRIES = 3
const RETRY_DELAY_MS = 30_000

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── 타입 ──
interface CookieEntry {
  name: string
  value: string
  domain: string
  path: string
  expires: number   // Unix seconds
  httpOnly: boolean
  secure: boolean
  sameSite: string
}

interface StorageState {
  cookies: CookieEntry[]
  origins: unknown[]
}

interface SessionStatus {
  nidAutDaysRemaining: number  // -1 = 쿠키 없음
  nidSesDaysRemaining: number  // -1 = 쿠키 없음
  needsRefresh: boolean        // NID_SES ≤ NID_SES_REFRESH_THRESHOLD_DAYS
  autExpiringSoon: boolean     // NID_AUT ≤ NID_AUT_WARNING_DAYS
  autCritical: boolean         // NID_AUT ≤ NID_AUT_CRITICAL_DAYS
  isHalted: boolean            // .session-halted 파일 존재
}

// ── 유틸 ──
function daysUntil(unixSeconds: number): number {
  return (unixSeconds * 1000 - Date.now()) / 86_400_000
}

function kstNow(): string {
  return new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}

// ── 세션 상태 확인 ──
function checkSessionStatus(): SessionStatus {
  const isHalted = existsSync(SESSION_HALTED_FLAG)

  if (!existsSync(STORAGE_STATE_PATH)) {
    return { nidAutDaysRemaining: -1, nidSesDaysRemaining: -1, needsRefresh: true, autExpiringSoon: false, autCritical: false, isHalted }
  }

  let state: StorageState
  try {
    state = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8')) as StorageState
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

// ── 백업 ──
function backupStorageState(): void {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = resolve(BACKUP_DIR, `storage-state-${ts}.json`)
  copyFileSync(STORAGE_STATE_PATH, dest)

  // 최근 7개 백업만 유지 (오래된 순 삭제)
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('storage-state-'))
    .sort()
  for (const old of files.slice(0, Math.max(0, files.length - 7))) {
    unlinkSync(resolve(BACKUP_DIR, old))
  }
}

// ── NID_SES 갱신 (핵심) ──
// NID_AUT만 들고 headless Playwright로 naver.com 접속 → 새 NID_SES 획득
// headless: true — naver.com 로그인 페이지는 headless OK (카페 본문과 다름)
async function refreshNidSes(): Promise<boolean> {
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error('[SessionManager] storage-state.json 없음 — 갱신 불가')
    writeFileSync(SESSION_HALTED_FLAG, kstNow())
    return false
  }

  let state: StorageState
  try {
    state = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8')) as StorageState
  } catch {
    console.error('[SessionManager] storage-state.json 파싱 실패')
    writeFileSync(SESSION_HALTED_FLAG, kstNow())
    return false
  }

  const nidAutCookie = state.cookies.find(c => c.name === 'NID_AUT')
  if (!nidAutCookie) {
    console.error('[SessionManager] NID_AUT 쿠키 없음 — 연간 수동 갱신 필요')
    writeFileSync(SESSION_HALTED_FLAG, kstNow())
    return false
  }

  for (let attempt = 1; attempt <= MAX_REFRESH_RETRIES; attempt++) {
    console.log(`[SessionManager] NID_SES 갱신 시도 ${attempt}/${MAX_REFRESH_RETRIES}...`)
    let browser = null
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--no-first-run'],
      })
      const context = await browser.newContext({
        storageState: { cookies: [nidAutCookie], origins: [] },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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
        console.warn(`[SessionManager] 시도 ${attempt}: NID_SES 미발급 (쿠키 목록: ${cookies.map(c => c.name).join(', ')})`)
        await browser.close()
        browser = null
        if (attempt < MAX_REFRESH_RETRIES) await sleep(RETRY_DELAY_MS)
        continue
      }

      // 성공: 백업 → 저장
      backupStorageState()

      // NID_SES만 새 값으로 교체, 나머지 쿠키 유지
      const hasExistingSes = state.cookies.some(c => c.name === 'NID_SES')
      const updatedCookies: CookieEntry[] = hasExistingSes
        ? state.cookies.map(c =>
            c.name === 'NID_SES'
              ? { ...c, value: newNidSes.value, expires: Math.floor(newNidSes.expires) }
              : c
          )
        : [
            ...state.cookies,
            {
              name: 'NID_SES',
              value: newNidSes.value,
              domain: '.naver.com',
              path: '/',
              expires: Math.floor(newNidSes.expires),
              httpOnly: false,
              secure: true,
              sameSite: 'Lax',
            },
          ]

      const newState: StorageState = { cookies: updatedCookies, origins: [] }
      writeFileSync(STORAGE_STATE_PATH, JSON.stringify(newState, null, 2))

      const newExpiry = new Date(newNidSes.expires * 1000)
        .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
      console.log(`[SessionManager] ✅ NID_SES 갱신 완료 — 새 만료일: ${newExpiry}`)
      await browser.close()
      return true

    } catch (err) {
      console.error(`[SessionManager] 시도 ${attempt} 오류:`, err instanceof Error ? err.message : err)
      if (browser) await browser.close().catch(() => {})
      if (attempt < MAX_REFRESH_RETRIES) await sleep(RETRY_DELAY_MS)
    }
  }

  // 3회 모두 실패
  writeFileSync(SESSION_HALTED_FLAG, kstNow())
  return false
}

// ── 로그인 검증 ──
// 실제 카페 회원 전용 게시판 URL로 로그인 상태를 검증
async function verifyLoginAccess(): Promise<boolean> {
  let browser = null
  try {
    const rawState = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf-8')) as StorageState
    // boolean 정규화 (Python 추출 시 number로 저장될 수 있음)
    for (const c of rawState.cookies) {
      if (typeof c.secure !== 'boolean') c.secure = Boolean(c.secure)
      if (typeof c.httpOnly !== 'boolean') c.httpOnly = Boolean(c.httpOnly)
    }

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    })
    const context = await browser.newContext({
      storageState: rawState,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    // 우아한갱년기 회원 전용 게시판 — 비로그인 시 리다이렉트됨
    const response = await page.goto(
      'https://cafe.naver.com/f-e/cafes/29349320/menus/8',
      { waitUntil: 'domcontentloaded', timeout: 20_000 }
    )
    await sleep(2_000)

    const status = response?.status() ?? 0
    const url = page.url()
    const linkCount = await page.locator('a[href*="/articles/"]').count()

    const ok = status === 200 && !url.includes('login') && linkCount > 0
    console.log(
      `[SessionManager] 로그인 검증: status=${status} 링크=${linkCount}개 → ${ok ? '✅ 성공' : '❌ 실패'}`
    )
    return ok
  } catch (err) {
    console.error('[SessionManager] 로그인 검증 오류:', err instanceof Error ? err.message : err)
    return false
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

// ── Slack 알림 헬퍼 ──

async function notifySessionHalted(reason: string): Promise<void> {
  const msg = [
    '🚨 *네이버 카페 크롤러 전면 중단*',
    '',
    `사유: ${reason}`,
    `시각: ${kstNow()}`,
    '',
    '📋 *조치 방법 (지금 즉시)*:',
    '1. Chrome 완전 종료 (Cmd+Q)',
    '2. `npx tsx agents/cafe/export-cookies.ts` 실행',
    '3. NID_AUT ✅ NID_SES ✅ 확인',
    '',
    '⚠️ 조치 전까지 크롤링 완전 정지 상태입니다',
  ].join('\n')

  // 3채널 동시 전송 (DASHBOARD, SYSTEM, QA)
  await Promise.all([
    sendSlackMessage('DASHBOARD', msg),
    sendSlackMessage('SYSTEM', msg),
    sendSlackMessage('QA', msg),
  ]).catch(e => console.error('[SessionManager] Slack 전면중단 알림 오류:', e))
}

async function notifyAlreadyHalted(): Promise<void> {
  let haltedAt = '알 수 없음'
  try {
    const content = readFileSync(SESSION_HALTED_FLAG, 'utf-8').trim()
    haltedAt = content || statSync(SESSION_HALTED_FLAG).mtime.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  } catch { /* ignore */ }

  const msg = [
    '🔴 *크롤러 차단 중 — 재실행 시도 감지*',
    '',
    `차단 시각: ${haltedAt}`,
    `현재 시각: ${kstNow()}`,
    '',
    '→ export-cookies.ts 미실행 상태입니다',
    '→ Chrome 닫고 `npx tsx agents/cafe/export-cookies.ts` 실행 필요',
  ].join('\n')

  // 2채널 동시 전송 (DASHBOARD, SYSTEM)
  await Promise.all([
    sendSlackMessage('DASHBOARD', msg),
    sendSlackMessage('SYSTEM', msg),
  ]).catch(e => console.error('[SessionManager] 재알림 오류:', e))
}

async function notifyAutWarning(autDays: number): Promise<void> {
  const isCritical = autDays <= NID_AUT_CRITICAL_DAYS
  const expiryDate = new Date(Date.now() + autDays * 86_400_000)
    .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })

  const msg = [
    `${isCritical ? '🚨' : '⚠️'} *NID_AUT 만료 ${Math.ceil(autDays)}일 전 — 연간 수동 갱신 필요*`,
    '',
    `만료일: ${expiryDate}`,
    '',
    '📋 *조치 방법*:',
    '1. Chrome 완전 종료 (Cmd+Q)',
    '2. `npx tsx agents/cafe/export-cookies.ts` 실행 (약 5분)',
    '3. NID_AUT ✅ NID_SES ✅ 확인',
    '',
    isCritical
      ? `⚠️ 미조치 시 약 ${Math.ceil(autDays)}일 후 크롤링 영구 중단`
      : `→ 30일 이내가 되면 매일 #대시보드 알림 발송 예정`,
  ].join('\n')

  if (isCritical) {
    // 30일 이내: 매일 2채널 경보
    await Promise.all([
      sendSlackMessage('DASHBOARD', msg),
      sendSlackMessage('SYSTEM', msg),
    ]).catch(e => console.error('[SessionManager] NID_AUT 위험 경보 오류:', e))
  } else {
    // 60일 이내: SYSTEM만
    await sendSlackMessage('SYSTEM', msg)
      .catch(e => console.error('[SessionManager] NID_AUT 경보 오류:', e))
  }
}

async function notifyRefreshSuccess(sesDays: number, autDays: number): Promise<void> {
  const newExpiry = new Date(Date.now() + sesDays * 86_400_000)
    .toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })

  const msg = [
    `✅ *NID_SES 자동 갱신 완료* — ${kstNow()}`,
    `새 NID_SES 만료일: ${newExpiry} (약 ${Math.round(sesDays)}일)`,
    `NID_AUT 남은 기간: ${Math.ceil(autDays)}일`,
  ].join('\n')

  await sendSlackMessage('SYSTEM', msg)
    .catch(e => console.error('[SessionManager] 갱신 성공 알림 오류:', e))
}

// ── 오케스트레이터 (named export) ──
// crawler.ts / runner.ts에서 import해서 호출
export async function ensureSession(): Promise<void> {
  const status = checkSessionStatus()

  // 1. 이미 차단된 상태 → 재알림 + throw
  if (status.isHalted) {
    console.error('[SessionManager] SESSION_HALTED — 크롤러 차단 상태. 조치 필요.')
    await notifyAlreadyHalted()
    throw new Error('SESSION_HALTED: 세션 갱신 실패로 크롤러가 차단됐습니다. export-cookies.ts 실행 필요.')
  }

  // 2. NID_AUT 만료 경보 (갱신과 무관, 알림만)
  if (status.autExpiringSoon || status.autCritical) {
    console.warn(`[SessionManager] NID_AUT 만료 경보 — ${Math.ceil(status.nidAutDaysRemaining)}일 남음`)
    await notifyAutWarning(status.nidAutDaysRemaining)
  }

  // 3. 세션 유효 → 갱신 불필요
  if (!status.needsRefresh) {
    console.log(
      `[SessionManager] 세션 유효 — NID_SES ${Math.ceil(status.nidSesDaysRemaining)}일 / NID_AUT ${Math.ceil(status.nidAutDaysRemaining)}일`
    )
    return
  }

  // 4. NID_SES 갱신 시작
  console.log(
    `[SessionManager] NID_SES 갱신 시작 — ${Math.ceil(status.nidSesDaysRemaining)}일 남음 (임계값: ${NID_SES_REFRESH_THRESHOLD_DAYS}일)`
  )

  await prisma.botLog.create({
    data: {
      botType: 'CTO',
      action: 'SESSION_REFRESH',
      status: 'STARTED',
      details: JSON.stringify({
        nidSesDaysRemaining: Math.round(status.nidSesDaysRemaining),
        nidAutDaysRemaining: Math.round(status.nidAutDaysRemaining),
      }),
    },
  }).catch(e => console.error('[SessionManager] BotLog(STARTED) 기록 실패:', e))

  const refreshed = await refreshNidSes()

  if (!refreshed) {
    // SESSION_HALTED 이미 생성됨 (refreshNidSes 내부)
    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'SESSION_REFRESH',
        status: 'FAILED',
        details: `NID_SES 갱신 ${MAX_REFRESH_RETRIES}회 실패 — SESSION_HALTED 플래그 생성`,
      },
    }).catch(e => console.error('[SessionManager] BotLog(FAILED) 기록 실패:', e))

    await notifySessionHalted(`NID_SES 자동 갱신 ${MAX_REFRESH_RETRIES}회 모두 실패`)
    throw new Error('SESSION_REFRESH_FAILED: NID_SES 갱신 실패')
  }

  // 5. 로그인 검증
  const verified = await verifyLoginAccess()
  if (!verified) {
    writeFileSync(SESSION_HALTED_FLAG, kstNow())

    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'SESSION_REFRESH',
        status: 'FAILED',
        details: 'NID_SES 갱신 성공했으나 카페 접근 검증 실패 — SESSION_HALTED (네이버 계정 이상 의심)',
      },
    }).catch(e => console.error('[SessionManager] BotLog(VERIFY_FAIL) 기록 실패:', e))

    await notifySessionHalted('NID_SES 갱신 성공했으나 카페 접근 검증 실패 (네이버 계정 이상 의심)')
    throw new Error('SESSION_VERIFY_FAILED: 로그인 검증 실패')
  }

  // 6. 성공
  const newStatus = checkSessionStatus()
  await prisma.botLog.create({
    data: {
      botType: 'CTO',
      action: 'SESSION_REFRESH',
      status: 'SUCCESS',
      details: JSON.stringify({
        newNidSesDays: Math.round(newStatus.nidSesDaysRemaining),
        nidAutDaysRemaining: Math.round(newStatus.nidAutDaysRemaining),
      }),
      executionTimeMs: 0,
    },
  }).catch(e => console.error('[SessionManager] BotLog(SUCCESS) 기록 실패:', e))

  await notifyRefreshSuccess(newStatus.nidSesDaysRemaining, newStatus.nidAutDaysRemaining)
  console.log('[SessionManager] ✅ 세션 갱신 및 검증 완료')
}

// ── 메인 진입점 (launchd / 수동 실행용) ──
async function main(): Promise<void> {
  console.log(`[SessionManager] 시작 — ${kstNow()}`)
  const startTime = Date.now()

  try {
    await ensureSession()
  } catch (err) {
    console.error('[SessionManager] 실패:', err instanceof Error ? err.message : err)
    await Promise.race([disconnect(), new Promise(r => setTimeout(r, 5000))])
    process.exit(1)
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log(`[SessionManager] 완료 (${elapsed}초)`)
  await Promise.race([disconnect(), new Promise(r => setTimeout(r, 5000))])
  process.exit(0)
}

// ESM: 직접 실행 시에만 main() 호출
// runner.ts에서 ensureSession()만 import하면 main() 실행 안 됨
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch(async (err) => {
    console.error('[SessionManager] 치명적 오류:', err)
    await Promise.race([disconnect(), new Promise(r => setTimeout(r, 5000))])
    process.exit(1)
  })
}
