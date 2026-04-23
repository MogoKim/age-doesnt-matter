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
const LOCK_MAX_AGE_MS = 30 * 60 * 1000 // 30분 (크롤링 최대 23분 + 여유 7분)

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

const CRAWL_MAX_RETRIES = 3
const CRAWL_RETRY_WAIT_MS = 60_000 // 재시도 간격 1분 (네이버 차단 완화)

/**
 * 크롤링 전용 재시도 래퍼
 * 실패 감지 기준:
 *   1. 스크립트 자체 에러 (ETIMEDOUT, 브라우저 크래시)
 *   2. 스크립트 정상 종료지만 특정 카페 오늘 저장 0건
 * 최대 3회 재시도 후 모두 실패 시 Slack #시스템 경고
 */
async function runCrawlWithRetry(script: string, label: string): Promise<void> {
  console.log(`\n${'='.repeat(50)}`)
  console.log(`[Pipeline] ${label} 시작`)
  console.log('='.repeat(50))

  const CONFIGURED_CAFE_IDS = ['wgang', 'dlxogns01']
  let lastError = ''
  let lastFailedCafes: string[] = []

  for (let attempt = 1; attempt <= CRAWL_MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      console.log(`[Pipeline] ${label} — ${CRAWL_RETRY_WAIT_MS / 1000}초 후 재시도 (${attempt}/${CRAWL_MAX_RETRIES})`)
      await new Promise(r => setTimeout(r, CRAWL_RETRY_WAIT_MS))
    }
    if (attempt > 1) console.log(`[Pipeline] ${label} 재시도 ${attempt}회차`)

    // 스크립트 실행
    let scriptFailed = false
    try {
      execFileSync('npx', ['tsx', resolve(__dirname, script)], {
        env: { ...process.env },
        timeout: 900000,
        stdio: 'inherit',
      })
      lastError = ''
    } catch (err: unknown) {
      scriptFailed = true
      lastError = (err as { message?: string }).message ?? String(err)
      console.error(`[Pipeline] ${label} 스크립트 오류 (${attempt}회차):`, lastError.slice(0, 200))
    }

    // 오늘 카페별 저장 수 확인 (CafePost 직접 조회)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const perCafe = await prisma.cafePost.groupBy({
      by: ['cafeId'],
      where: { crawledAt: { gte: todayStart } },
      _count: { id: true },
    })
    lastFailedCafes = CONFIGURED_CAFE_IDS.filter(id => {
      const r = perCafe.find(p => p.cafeId === id)
      return !r || r._count.id === 0
    })

    // 성공: 스크립트 정상 + 모든 카페 1건 이상 저장
    if (!scriptFailed && lastFailedCafes.length === 0) {
      console.log(`[Pipeline] ${label} ✅ 완료 (${attempt}회 시도)`)
      return
    }

    const reason = [
      scriptFailed ? `스크립트 오류: ${lastError.slice(0, 100)}` : null,
      lastFailedCafes.length > 0 ? `저장 0건 카페: ${lastFailedCafes.join(', ')}` : null,
    ].filter(Boolean).join(' / ')
    console.warn(`[Pipeline] ⚠️ ${attempt}회차 실패 — ${reason}`)
  }

  // 3회 모두 실패 → 카페별 최종 현황 조회 후 Slack 경고
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const finalCounts = await Promise.all(
    CONFIGURED_CAFE_IDS.map(async id => {
      const r = await prisma.cafePost.aggregate({
        where: { cafeId: id, crawledAt: { gte: todayStart } },
        _count: { id: true },
      })
      return `${id}: ${r._count.id}건`
    })
  )

  await notifySlack({
    level: 'critical',
    agent: 'CAFE_CRAWLER',
    title: `카페 크롤링 ${CRAWL_MAX_RETRIES}회 연속 실패`,
    body: [
      `실패 카페: ${lastFailedCafes.join(', ') || '전체'}`,
      `카페별 오늘 저장: ${finalCounts.join(' / ')}`,
      lastError ? `마지막 오류: ${lastError.slice(0, 200)}` : '',
      '사유: Playwright 브라우저 크래시 또는 네이버 일시 차단 의심',
      '조치: npx tsx agents/cafe/export-cookies.ts 로 쿠키 재발급 확인',
    ].filter(Boolean).join('\n'),
  })
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
    // 쿠키 만료 사전 알림 — 파이프라인 시작 시 1회 (만료 7일·3일 전 Slack 경고)
    await checkCookieExpiryWarning()

    // ── DEEP 모드 (08:30 KST) — 전체 크롤 + 심리 분석 + 풀 트렌드 + 인텔리전스 브리프 ──
    if (step === 'deep') {
      await runCrawlWithRetry('crawler.ts', '1단계: 딥다이브 크롤링 (댓글 포함)')
      await checkCookieExpiry()
      await reportPipelineStage('crawl')
      await run('external-crawler.ts', '2단계: 외부 크롤링 (비활성 — 빈 배열)')
      await run('psych-analyzer.ts', '3단계: AI 심리 분석')
      await reportPipelineStage('psych')
      await run('trend-analyzer.ts', '4단계: 풀 트렌드 생성 (욕망/감정 집계 포함)')
      await reportPipelineStage('trend')
      await run('daily-brief.ts', '5단계: 욕망 지도 → DailyIntelligenceBrief 생성')
      await reportPipelineStage('brief')
      await run('content-curator.ts', '6단계: 콘텐츠 큐레이션')
      await reportPipelineStage('curate')
    }

    // ── QUICK 모드 (12:30 KST) — 빠른 크롤 + 경량 트렌드 업데이트 + midDayPatch ──
    else if (step === 'quick') {
      process.env.CRAWL_MODE = 'quick'
      await runCrawlWithRetry('crawler.ts', '1단계: 퀵 크롤링 (HIGH 게시판 1페이지)')
      await checkCookieExpiry()
      // 심리 분석은 스킵 (제목만 수집)
      process.env.TREND_MODE = 'quick'
      await run('trend-analyzer.ts', '2단계: 퀵 트렌드 업데이트')
      await runWithArgs('daily-brief.ts', ['--patch'], '3단계: 점심 midDayPatch 업데이트')
    }

    // ── ALL 모드 — deep + curate (수동 실행용, 기본값) ──
    else if (step === 'all') {
      await runCrawlWithRetry('crawler.ts', '1단계: 카페 크롤링')
      await checkCookieExpiry()
      await reportPipelineStage('crawl')
      await run('external-crawler.ts', '2단계: 외부 크롤링 (비활성)')
      await run('psych-analyzer.ts', '3단계: AI 심리 분석')
      await reportPipelineStage('psych')
      await run('trend-analyzer.ts', '4단계: 트렌드 분석')
      await reportPipelineStage('trend')
      await run('daily-brief.ts', '5단계: DailyIntelligenceBrief 생성')
      await reportPipelineStage('brief')
      await run('content-curator.ts', '6단계: 콘텐츠 큐레이션')
      await reportPipelineStage('curate')
    }

    // ── 단계별 실행 ──
    else {
      if (step === 'crawl') { await runCrawlWithRetry('crawler.ts', '카페 크롤링'); await checkCookieExpiry() }
      if (step === 'analyze') await run('psych-analyzer.ts', 'AI 심리 분석')
      if (step === 'trend') await run('trend-analyzer.ts', '트렌드 분석')
      if (step === 'curate') await run('content-curator.ts', '콘텐츠 큐레이션')
      if (step === 'external') await run('external-crawler.ts', '외부 크롤링 (비활성)')
    }
  } finally {
    // 락파일 항상 삭제
    try {
      rmSync(LOCK_FILE, { force: true })
    } catch (err) {
      console.error('[Pipeline] 락파일 삭제 실패 — 수동 삭제 필요:', LOCK_FILE, err)
      await notifySlack({
        level: 'critical',
        agent: 'CAFE_CRAWLER',
        title: '락파일 삭제 실패 — 다음 실행 차단 위험',
        body: `수동 삭제 필요: rm ${LOCK_FILE}\n오류: ${String(err).slice(0, 200)}`,
      }).catch(() => {})
    }
    await disconnect()
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log(`\n[Pipeline] 전체 완료 — ${elapsed}초`)
}

/** Phase 3-A: 파이프라인 단계별 Slack #리포트 자동 전송 */
async function reportPipelineStage(stage: 'crawl' | 'psych' | 'trend' | 'brief' | 'curate') {
  try {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const lines: string[] = []

    if (stage === 'crawl') {
      const perCafe = await prisma.cafePost.groupBy({
        by: ['cafeId'],
        where: { crawledAt: { gte: todayStart } },
        _count: { id: true },
      })
      const total = perCafe.reduce((s, r) => s + r._count.id, 0)
      const cafeStr = perCafe.map(r => `${r.cafeId} ${r._count.id}건`).join(' / ')
      lines.push(`1️⃣ 크롤 ${total >= 10 ? '✅' : '⚠️'}: ${total}건 수집 (${cafeStr || '없음'})`)

    }

    else if (stage === 'psych') {
      const [total, analyzed] = await Promise.all([
        prisma.cafePost.count({ where: { crawledAt: { gte: todayStart } } }),
        prisma.cafePost.count({ where: { crawledAt: { gte: todayStart }, aiAnalyzed: true } }),
      ])
      const rate = total > 0 ? Math.round((analyzed / total) * 100) : 0
      lines.push(`2️⃣ 심리분석 ${rate >= 95 ? '✅' : '⚠️'}: ${analyzed}/${total}건 완료 (${rate}%)`)
    }

    else if (stage === 'trend') {
      const trend = await prisma.cafeTrend.findFirst({
        where: { date: todayStart, period: 'daily' },
        select: { desireMap: true },
        orderBy: { id: 'desc' },
      })
      if (!trend?.desireMap) {
        lines.push('3️⃣ 트렌드 ❌: 오늘 CafeTrend 없음')
      } else {
        const dm = trend.desireMap as Record<string, number>
        const top5 = Object.entries(dm).sort((a, b) => b[1] - a[1]).slice(0, 5)
        const topStr = top5.map(([k, v]) => `${k} ${v}%`).join(' / ')
        const dominated = (top5[0]?.[1] ?? 0) >= 70
        lines.push(`3️⃣ 트렌드 ${dominated ? '⚠️' : '✅'}: ${topStr}`)
        if (dominated) lines.push(`⚠️ ${top5[0][0]} 단독 ${top5[0][1]}% — 편향 의심`)
      }
    }

    else if (stage === 'brief') {
      const brief = await prisma.dailyBrief.findFirst({
        where: { date: todayStart },
        select: { mode: true },
      })
      if (!brief) {
        lines.push('4️⃣ 브리프 ❌: 오늘 DailyBrief 없음')
      } else {
        const ok = brief.mode === 'deep'
        lines.push(`4️⃣ 브리프 ${ok ? '✅' : '⚠️'}: mode=${brief.mode}${ok ? '' : ' (어제 폴백)'}`)
        // 소비 에이전트 추적 (BRIEF_CONSUMED 로그)
        const consumedLogs = await prisma.botLog.findMany({
          where: { action: 'BRIEF_CONSUMED', executedAt: { gte: todayStart } },
          select: { details: true },
        })
        if (consumedLogs.length > 0) {
          const consumers = consumedLogs
            .map(l => { try { return (JSON.parse(l.details as string) as { consumedBy?: string }).consumedBy } catch { return null } })
            .filter(Boolean)
            .join(', ')
          lines.push(`   └ 소비 에이전트: ${consumers}`)
        }
      }
    }

    else if (stage === 'curate') {
      const log = await prisma.botLog.findFirst({
        where: { botType: 'CAFE_CRAWLER', action: 'CONTENT_CURATE' },
        orderBy: { executedAt: 'desc' },
        select: { itemCount: true },
      })
      const count = log?.itemCount ?? 0
      lines.push(`5️⃣ 큐레이션 ${count >= 2 ? '✅' : '⚠️'}: ${count}건 발행`)
    }

    if (lines.length > 0) {
      await sendSlackMessage('REPORT', lines.join('\n'))
    }
  } catch (err) {
    console.warn(`[Pipeline] reportPipelineStage(${stage}) 실패 (무시):`, err)
  }
}

/**
 * 쿠키 만료 사전 알림 — 7일·3일·당일 3단계
 * COOKIE_SET_DATE 환경변수 우선, 없으면 BotLog 최근 성공 스트릭으로 추정
 */
async function checkCookieExpiryWarning() {
  try {
    const COOKIE_TTL_DAYS = 30

    let cookieSetDate: Date | null = null

    if (process.env.COOKIE_SET_DATE) {
      cookieSetDate = new Date(process.env.COOKIE_SET_DATE)
    } else {
      // BotLog에서 최근 14일 내 가장 오래된 성공 크롤 레코드 조회 (스트릭 시작 추정)
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      const firstRecent = await prisma.botLog.findFirst({
        where: {
          botType: 'CAFE_CRAWLER',
          action: 'CAFE_CRAWL',
          status: 'SUCCESS',
          createdAt: { gte: twoWeeksAgo },
        },
        orderBy: { createdAt: 'asc' },
      })
      if (firstRecent) cookieSetDate = firstRecent.createdAt
    }

    if (!cookieSetDate) return

    const daysSince = (Date.now() - cookieSetDate.getTime()) / (1000 * 60 * 60 * 24)
    const daysRemaining = COOKIE_TTL_DAYS - daysSince

    if (daysRemaining > COOKIE_TTL_DAYS) return  // 미래 날짜 오입력 방어

    if (daysRemaining <= 0) {
      // 이미 만료 예상 — checkCookieExpiry()가 처리
    } else if (daysRemaining <= 3) {
      await sendSlackMessage('SYSTEM',
        `🔴 *쿠키 만료 임박* — 약 ${Math.floor(daysRemaining)}일 후 만료 예상\n` +
        `→ 지금 바로 로컬에서 \`npx tsx agents/cafe/export-cookies.ts\` 실행 후 \`.env.local\`의 COOKIE_SET_DATE 갱신`)
    } else if (daysRemaining <= 7) {
      await sendSlackMessage('SYSTEM',
        `⚠️ *쿠키 만료 예정* — 약 ${Math.floor(daysRemaining)}일 후 만료 예상\n` +
        `→ 이번 주 내 \`export-cookies.ts\` 실행 권장`)
    }
  } catch (err) {
    console.warn('[Pipeline] 쿠키 만료 사전 알림 실패 (무시):', err)
  }
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
      await sendSlackMessage('SYSTEM', `🚨 *쿠키 만료 의심 — 파이프라인 중단*
수집: ${collected}건 / 저장: ${saved}건 (성공률 ${successRate}%)
→ 로컬에서 \`npx tsx agents/cafe/export-cookies.ts\` 재실행 필요
→ 파이프라인은 빈 데이터 방지를 위해 즉시 중단됩니다`)
      console.error(`[Pipeline] 🚨 쿠키 만료 의심 — 파이프라인 중단 (저장 ${saved}건, 수율 ${successRate}%)`)
      throw new Error('COOKIE_EXPIRED')
    }
  } catch (err) {
    if ((err as Error).message === 'COOKIE_EXPIRED') throw err
    console.warn('[Pipeline] 쿠키 만료 체크 실패 (무시):', err)
  }
}

main()
