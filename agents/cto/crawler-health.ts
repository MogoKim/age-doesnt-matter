import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

/**
 * CTO 에이전트 — 크롤링 헬스체크
 * 크롤링 성공률/에러 진단 + 데이터 품질 메트릭
 */

/** 쿠키 만료 시그널 패턴 */
const COOKIE_EXPIRY_PATTERNS = [
  '401', 'Unauthorized', 'login required', '로그인',
  'cookie expired', 'session expired', 'CAPTCHA',
]

async function main() {
  console.log('[CTO] 크롤러 헬스체크 시작')
  const start = Date.now()

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // 1. 크롤러 BotLog 조회
    const crawlerLogs = await prisma.botLog.findMany({
      where: {
        botType: 'CAFE_CRAWLER',
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: {
        action: true,
        status: true,
        details: true,
        itemCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (crawlerLogs.length === 0) {
      const summary = '크롤러 로그 없음 (24시간 내 실행 기록 없음)'
      await notifySlack({
        level: 'important',
        agent: 'CTO',
        title: '크롤러 헬스체크 경고',
        body: summary,
      })
      await prisma.botLog.create({
        data: {
          botType: 'CTO',
          action: 'CRAWLER_HEALTH',
          status: 'SUCCESS',
          details: summary,
          itemCount: 0,
          executionTimeMs: Date.now() - start,
        },
      })
      return
    }

    // 2. 액션별 성공률 계산
    const actionStats = new Map<string, { total: number; success: number; failed: number }>()

    for (const log of crawlerLogs) {
      const stat = actionStats.get(log.action) ?? { total: 0, success: 0, failed: 0 }
      stat.total++
      if (log.status === 'SUCCESS') stat.success++
      else stat.failed++
      actionStats.set(log.action, stat)
    }

    // 3. 연속 실패 패턴 감지
    let consecutiveFailures = 0
    let maxConsecutiveFailures = 0
    for (const log of crawlerLogs) {
      if (log.status === 'FAILED') {
        consecutiveFailures++
        maxConsecutiveFailures = Math.max(maxConsecutiveFailures, consecutiveFailures)
      } else {
        consecutiveFailures = 0
      }
    }

    // 4. 쿠키 만료 시그널 감지
    const cookieExpiredLogs = crawlerLogs.filter(log =>
      log.details && COOKIE_EXPIRY_PATTERNS.some(p =>
        log.details!.toLowerCase().includes(p.toLowerCase()),
      ),
    )

    // 5. 낮은 수집량 감지
    const lowCollectionLogs = crawlerLogs.filter(log =>
      log.status === 'SUCCESS' && log.itemCount !== null && log.itemCount < 3,
    )

    // 6. CafePost 데이터 품질 메트릭
    const cafePostStats = await prisma.cafePost.aggregate({
      where: { createdAt: { gte: twentyFourHoursAgo } },
      _avg: { qualityScore: true },
      _count: { _all: true },
    })

    const usablePosts = await prisma.cafePost.count({
      where: {
        createdAt: { gte: twentyFourHoursAgo },
        isUsable: true,
      },
    })

    const totalCafePosts = cafePostStats._count._all
    const avgQuality = cafePostStats._avg.qualityScore ?? 0
    const usableRatio = totalCafePosts > 0 ? (usablePosts / totalCafePosts * 100).toFixed(1) : '0'

    // 7. 품질 추세 분석: 7일 평균 대비 오늘 품질 비교
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentHealthLogs = await prisma.botLog.findMany({
      where: {
        botType: 'CTO',
        action: 'CRAWLER_HEALTH',
        status: 'SUCCESS',
        createdAt: { gte: sevenDaysAgo },
      },
      select: { details: true },
      orderBy: { createdAt: 'desc' },
      take: 7,
    })
    // details 형식: "크롤러 성공률 X%, 품질 Y.YY, 경고 Z건"
    const historicalQualities = recentHealthLogs
      .map((l) => { const m = /품질 ([\d.]+)/.exec(l.details ?? ''); return m ? parseFloat(m[1]) : null })
      .filter((v): v is number => v !== null)
    const historicalAvg = historicalQualities.length > 0
      ? historicalQualities.reduce((a, b) => a + b, 0) / historicalQualities.length
      : 0
    const qualityDrop = historicalAvg > 0 ? ((avgQuality - historicalAvg) / historicalAvg * 100) : 0

    // 8. 리포트 구성
    const totalLogs = crawlerLogs.length
    const successLogs = crawlerLogs.filter(l => l.status === 'SUCCESS').length
    const overallSuccessRate = ((successLogs / totalLogs) * 100).toFixed(1)

    const actionReport = Array.from(actionStats.entries())
      .map(([action, stat]) => {
        const rate = ((stat.success / stat.total) * 100).toFixed(0)
        return `  ${action}: ${rate}% (${stat.success}/${stat.total})`
      })
      .join('\n')

    const alerts: string[] = []
    if (maxConsecutiveFailures >= 3) {
      alerts.push(`연속 실패 ${maxConsecutiveFailures}회 감지`)
    }
    if (cookieExpiredLogs.length > 0) {
      alerts.push(`쿠키 만료 의심 ${cookieExpiredLogs.length}건`)
    }
    if (lowCollectionLogs.length > 3) {
      alerts.push(`낮은 수집량 ${lowCollectionLogs.length}건`)
    }
    // 품질 추세 경고: 7일 평균 대비 10% 이상 하락
    if (qualityDrop < -10 && historicalAvg > 0) {
      alerts.push(`품질점수 7일 평균(${historicalAvg.toFixed(2)}) 대비 ${Math.abs(qualityDrop).toFixed(1)}% 하락`)
    }

    const isHealthy = alerts.length === 0 && parseFloat(overallSuccessRate) >= 80

    const body = `*크롤러 성공률*: ${overallSuccessRate}% (${successLogs}/${totalLogs})

*액션별 현황:*
${actionReport}

*데이터 품질:*
  수집량: ${totalCafePosts}건
  평균 품질점수: ${avgQuality.toFixed(2)}
  사용 가능 비율: ${usableRatio}%

${alerts.length > 0 ? `*경고:*\n${alerts.map(a => `  - ${a}`).join('\n')}` : '경고 없음'}`

    await notifySlack({
      level: isHealthy ? 'info' : 'important',
      agent: 'CTO',
      title: `크롤러 헬스체크 ${isHealthy ? '정상' : '주의'}`,
      body,
    })

    const summary = `크롤러 성공률 ${overallSuccessRate}%, 품질 ${avgQuality.toFixed(2)}, 경고 ${alerts.length}건`

    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'CRAWLER_HEALTH',
        status: isHealthy ? 'SUCCESS' : 'FAILED',
        details: summary,
        itemCount: totalLogs,
        executionTimeMs: Date.now() - start,
      },
    })

    console.log(`[CTO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[CTO] 크롤러 헬스체크 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'CTO',
        action: 'CRAWLER_HEALTH',
        status: 'FAILED',
        details: errorMsg,
        itemCount: 0,
        executionTimeMs: Date.now() - start,
      },
    })
  } finally {
    await disconnect()
  }
}

main()
