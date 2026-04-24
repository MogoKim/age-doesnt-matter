/**
 * DailyBrief 생성 모니터 — LOCAL ONLY 파이프라인 감시
 *
 * 실행: GHA agents-cafe.yml brief-monitor job (09:30 KST = 00:30 UTC)
 * 목적: Mac launchd 미실행으로 DailyBrief 미생성 시 창업자에게 즉시 알림
 *
 * 알림 조건:
 *   CRITICAL  — DailyBrief 없음 (run-pipeline 미실행)
 *   IMPORTANT — mode=fallback_yesterday (어제 데이터로 운영 중)
 *   없음       — mode=deep/quick_update (정상), BotLog만 기록
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
} catch { /* GHA: process.env 직접 사용 */ }

async function main() {
  const { prisma } = await import('../core/db.js')
  const { notifySlack } = await import('../core/notifier.js')
  const { safeBotLog } = await import('../core/safe-log.js')

  const todayStr = new Date().toISOString().slice(0, 10) // UTC 기준 (daily-brief.ts와 동일)
  const todayDate = new Date(todayStr)
  const start = Date.now()

  const brief = await prisma.dailyBrief.findUnique({
    where: { date: todayDate },
    select: { mode: true, createdAt: true },
  })

  const elapsed = Date.now() - start

  if (!brief) {
    // CRITICAL: run-pipeline 미실행 또는 daily-brief.ts 실패
    await notifySlack({
      level: 'critical',
      agent: 'CAFE_CRAWLER',
      title: `⚠️ DailyBrief 미생성 — ${todayStr}`,
      body: [
        '오늘 오전 run-pipeline이 실행되지 않았거나 daily-brief.ts가 실패했습니다.',
        '',
        '📌 조치 방법:',
        '1. Mac launchd 상태 확인: `launchctl list | grep pipeline`',
        '2. 수동 실행: `npx tsx agents/cafe/daily-brief.ts`',
        '3. 확인: `npx tsx scripts/_tmp_qa_brief.ts`',
      ].join('\n'),
    })
    await safeBotLog({
      botType: 'CAFE_CRAWLER',
      action: 'BRIEF_MONITOR_CHECK',
      status: 'FAILED',
      details: JSON.stringify({ todayStr, result: 'NO_BRIEF' }),
      executionTimeMs: elapsed,
    })
    console.log('[BriefMonitor] ❌ CRITICAL — DailyBrief 없음')

  } else if (brief.mode === 'fallback_yesterday') {
    // WARNING: 브리프는 있지만 어제 데이터 기반
    await notifySlack({
      level: 'important',
      agent: 'CAFE_CRAWLER',
      title: `⚡ DailyBrief fallback 운영 중 — ${todayStr}`,
      body: [
        '오늘 브리프가 어제 데이터로 대체 운영 중입니다 (mode=fallback_yesterday).',
        `생성: ${brief.createdAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`,
        '원인: 오늘 CafeTrend 없음 (크롤링 수집 부족 또는 분석 지연)',
      ].join('\n'),
    })
    await safeBotLog({
      botType: 'CAFE_CRAWLER',
      action: 'BRIEF_MONITOR_CHECK',
      status: 'PARTIAL',
      details: JSON.stringify({ todayStr, result: 'FALLBACK_YESTERDAY', mode: brief.mode }),
      executionTimeMs: elapsed,
    })
    console.log('[BriefMonitor] ⚡ IMPORTANT — fallback_yesterday')

  } else {
    // 정상: BotLog만 기록, Slack 알림 없음
    await safeBotLog({
      botType: 'CAFE_CRAWLER',
      action: 'BRIEF_MONITOR_CHECK',
      status: 'SUCCESS',
      details: JSON.stringify({ todayStr, result: 'OK', mode: brief.mode }),
      executionTimeMs: elapsed,
    })
    console.log(`[BriefMonitor] ✅ 정상 — mode=${brief.mode}`)
  }

  await prisma.$disconnect()
}

main().catch(e => { console.error('[BriefMonitor] 오류:', e.message); process.exit(1) })
