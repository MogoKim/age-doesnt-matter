// LOCAL ONLY — 네이버 카페 크롤링은 Playwright + macOS launchd로 로컬 실행
/**
 * 카페 파이프라인 런처
 * 로컬 Mac에서 실행: 크롤링 → 심리분석 → 트렌드 분석 → 콘텐츠 큐레이션 순차 실행
 *
 * 실행 모드:
 *   deep    (08:30 KST) — 전체 크롤 + 댓글 + AI 심리 분석 + 풀 트렌드 생성
 *   quick   (12:30 KST) — 빠른 크롤 (제목/조회수만) + 경량 트렌드 업데이트
 *   all     — deep + curate (기본, 수동 실행용)
 *
 * 단계별 실행:
 *   crawl    — 크롤링만
 *   analyze  — 심리 분석만 (psych-analyzer)
 *   trend    — 트렌드 분석만 (trend-analyzer)
 *   curate   — 큐레이션만
 *   external — 외부 크롤링만 (82cook)
 *
 * 사용법:
 *   npx tsx agents/cafe/run-pipeline.ts deep     # 아침 08:30 launchd 호출
 *   npx tsx agents/cafe/run-pipeline.ts quick    # 점심 12:30 launchd 호출
 *   npx tsx agents/cafe/run-pipeline.ts all      # 수동 전체 실행
 *   npx tsx agents/cafe/run-pipeline.ts crawl    # 단계별 실행
 */
import { execFileSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync, writeFileSync, rmSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '../..')
const step = process.argv[2] ?? 'all'

// Bug 8: 중복 실행 방지 락파일
const LOCK_FILE = '/tmp/unao-crawler.lock'
const LOCK_MAX_AGE_MS = 30 * 60 * 1000 // 30분

// ⚠️ launchd 실행 시 .env.local 환경변수가 없으므로 직접 로드
// 반드시 notifier 등 DB 의존 모듈 import 전에 실행해야 함 (ESM top-level import 순서)
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

// notifier는 db.ts를 import하므로, 반드시 env 로드 후 동적 import
const { notifySlack, sendSlackMessage } = await import('../core/notifier.js')
const { prisma, disconnect } = await import('../core/db.js')

async function run(script: string, label: string) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`[Pipeline] ${label} 시작`)
  console.log('='.repeat(50))

  try {
    // stdio: 'inherit' — 자식 프로세스 출력을 부모에 직접 연결
    // execSync + pipe 조합은 출력 버퍼 초과 시 프로세스가 블로킹되어 ETIMEDOUT 발생
    execFileSync('npx', ['tsx', resolve(__dirname, script)], {
      env: { ...process.env },
      timeout: 900000, // 15분 — 크롤링은 카페당 2-3분 소요
      stdio: 'inherit',
    })
    console.log(`[Pipeline] ${label} ✅ 완료`)
  } catch (err: unknown) {
    const execErr = err as { status?: number; message?: string }
    const errorMsg = execErr.message ?? String(err)
    console.error(`[Pipeline] ${label} ❌ 실패:`, errorMsg)
    // Slack 알림 — 창업자가 파이프라인 실패를 즉시 인식할 수 있도록
    await notifySlack({
      level: 'critical',
      agent: 'CAFE_CRAWLER',
      title: `카페 파이프라인 실패: ${label}`,
      body: `단계: ${label}\n스크립트: ${script}\n오류: ${errorMsg.slice(0, 300)}`,
    })
    // 분석/큐레이션 실패해도 다음 단계 진행
  }
}

async function runWithArgs(script: string, args: string[], label: string) {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`[Pipeline] ${label} 시작`)
  console.log('='.repeat(50))

  try {
    execFileSync('npx', ['tsx', resolve(__dirname, script), ...args], {
      env: { ...process.env },
      timeout: 300000, // 5분
      stdio: 'inherit',
    })
    console.log(`[Pipeline] ${label} ✅ 완료`)
  } catch (err: unknown) {
    const execErr = err as { status?: number; message?: string }
    const errorMsg = execErr.message ?? String(err)
    console.error(`[Pipeline] ${label} ❌ 실패:`, errorMsg)
    await notifySlack({
      level: 'critical',
      agent: 'CAFE_CRAWLER',
      title: `카페 파이프라인 실패: ${label}`,
      body: `단계: ${label}\n스크립트: ${script}\n오류: ${errorMsg.slice(0, 300)}`,
    })
  }
}

async function main() {
  // Bug 8: 중복 실행 방지 — 30분 이내 락파일이 있으면 스킵
  if (existsSync(LOCK_FILE)) {
    try {
      const lockAge = Date.now() - parseInt(readFileSync(LOCK_FILE, 'utf-8'), 10)
      if (lockAge < LOCK_MAX_AGE_MS) {
        console.log(`[Pipeline] 이미 실행 중 (${Math.round(lockAge / 1000)}초 전 시작) — 스킵`)
        return
      }
      // 락파일이 너무 오래됐으면 (비정상 종료) 그냥 덮어씀
      console.warn('[Pipeline] 오래된 락파일 감지 — 이전 실행 비정상 종료로 간주, 계속 진행')
    } catch {
      // 파일 읽기 실패 → 그냥 진행
    }
  }

  // 락파일 생성
  writeFileSync(LOCK_FILE, String(Date.now()), 'utf-8')

  const startTime = Date.now()
  console.log(`[Pipeline] 카페 콘텐츠 파이프라인 시작 — ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`)
  console.log(`[Pipeline] 모드: ${step}`)

  try {
    // ── DEEP 모드 (08:30 KST) — 전체 크롤 + 심리 분석 + 풀 트렌드 + 인텔리전스 브리프 ──
    if (step === 'deep') {
      await run('crawler.ts', '1단계: 딥다이브 크롤링 (댓글 포함)')
      await checkCookieExpiry()
      await run('external-crawler.ts', '2단계: 외부 크롤링 (비활성 — 빈 배열)')
      await run('psych-analyzer.ts', '3단계: AI 심리 분석')
      await run('trend-analyzer.ts', '4단계: 풀 트렌드 생성 (욕망/감정 집계 포함)')
      await run('daily-brief.ts', '5단계: 욕망 지도 → DailyIntelligenceBrief 생성')
      await run('content-curator.ts', '6단계: 콘텐츠 큐레이션')
    }

    // ── QUICK 모드 (12:30 KST) — 빠른 크롤 + 경량 트렌드 업데이트 + midDayPatch ──
    else if (step === 'quick') {
      process.env.CRAWL_MODE = 'quick'
      await run('crawler.ts', '1단계: 퀵 크롤링 (HIGH 게시판 1페이지)')
      await checkCookieExpiry()
      // 심리 분석은 스킵 (제목만 수집)
      process.env.TREND_MODE = 'quick'
      await run('trend-analyzer.ts', '2단계: 퀵 트렌드 업데이트')
      await runWithArgs('daily-brief.ts', ['--patch'], '3단계: 점심 midDayPatch 업데이트')
    }

    // ── ALL 모드 — deep + curate (수동 실행용, 기본값) ──
    else if (step === 'all') {
      await run('crawler.ts', '1단계: 카페 크롤링')
      await checkCookieExpiry()
      await run('external-crawler.ts', '2단계: 외부 크롤링 (비활성)')
      await run('psych-analyzer.ts', '3단계: AI 심리 분석')
      await run('trend-analyzer.ts', '4단계: 트렌드 분석')
      await run('daily-brief.ts', '5단계: DailyIntelligenceBrief 생성')
      await run('content-curator.ts', '6단계: 콘텐츠 큐레이션')
    }

    // ── 단계별 실행 ──
    else {
      if (step === 'crawl') { await run('crawler.ts', '카페 크롤링'); await checkCookieExpiry() }
      if (step === 'analyze') await run('psych-analyzer.ts', 'AI 심리 분석')
      if (step === 'trend') await run('trend-analyzer.ts', '트렌드 분석')
      if (step === 'curate') await run('content-curator.ts', '콘텐츠 큐레이션')
      if (step === 'external') await run('external-crawler.ts', '외부 크롤링 (비활성)')
    }
  } finally {
    // 락파일 항상 삭제
    rmSync(LOCK_FILE, { force: true })
    await disconnect()
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log(`\n[Pipeline] 전체 완료 — ${elapsed}초`)
}

/** Bug 1: 쿠키 만료 감지 — 크롤링 직후 BotLog 확인 */
async function checkCookieExpiry() {
  try {
    const lastLog = await prisma.botLog.findFirst({
      where: { botType: 'CAFE_CRAWLER', action: 'CAFE_CRAWL' },
      orderBy: { createdAt: 'desc' },
    })
    if (!lastLog) return

    const details = lastLog.details ? JSON.parse(lastLog.details as string) : {}
    const saved = details.saved ?? lastLog.itemCount ?? 0
    const collected = details.collected ?? 0

    if (saved === 0 || (collected > 0 && saved / collected < 0.2)) {
      const successRate = collected > 0 ? Math.round(saved / collected * 100) : 0
      await sendSlackMessage('SYSTEM', `⚠️ *쿠키 만료 의심*
수집: ${collected}건 / 저장: ${saved}건 (성공률 ${successRate}%)
→ 로컬에서 \`npx tsx agents/cafe/export-cookies.ts\` 재실행 필요`)
      console.warn(`[Pipeline] ⚠️ 쿠키 만료 의심 — 저장 ${saved}건 (수율 ${successRate}%)`)
    }
  } catch (err) {
    console.warn('[Pipeline] 쿠키 만료 체크 실패 (무시):', err)
  }
}

main()
