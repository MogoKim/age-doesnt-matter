import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

/**
 * CMO 에이전트 — 소스 분석 (Weekly)
 * 크롤링 소스 확장 대신, 기존 4개 소스의 성과 분석 + config 최적화 제안
 * (창업자 결정: 소스 확장 보류, 기존 소스 최적화에 집중)
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

async function main() {
  console.log('[CMO] 소스 분석 시작')
  const start = Date.now()

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // 1. 소스별 크롤링 로그 분석
    const crawlerLogs = await prisma.botLog.findMany({
      where: {
        botType: 'CAFE_CRAWLER',
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        action: true,
        status: true,
        details: true,
        itemCount: true,
        createdAt: true,
      },
    })

    // 2. 소스별 성과 집계
    const sourceStats = new Map<string, {
      total: number
      success: number
      failed: number
      totalItems: number
    }>()

    for (const log of crawlerLogs) {
      const source = log.action // action에 소스 정보 포함
      const stat = sourceStats.get(source) ?? { total: 0, success: 0, failed: 0, totalItems: 0 }
      stat.total++
      if (log.status === 'SUCCESS') {
        stat.success++
        stat.totalItems += log.itemCount ?? 0
      } else {
        stat.failed++
      }
      sourceStats.set(source, stat)
    }

    // 3. CafePost 품질 분석 (소스별)
    const cafePostQuality = await prisma.cafePost.groupBy({
      by: ['sourceCafe'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _avg: { qualityScore: true },
      _count: { _all: true },
    })

    const usableByCafe = await prisma.cafePost.groupBy({
      by: ['sourceCafe'],
      where: {
        createdAt: { gte: sevenDaysAgo },
        isUsable: true,
      },
      _count: { _all: true },
    })

    const usableMap = new Map(usableByCafe.map(u => [u.sourceCafe, u._count._all]))

    // 4. 보드/카테고리별 품질 분석
    const boardQuality = await prisma.cafePost.groupBy({
      by: ['boardName'],
      where: { createdAt: { gte: sevenDaysAgo } },
      _avg: { qualityScore: true },
      _count: { _all: true },
    })

    // 5. AI 최적화 제안
    const sourceReport = cafePostQuality.map(s => {
      const usable = usableMap.get(s.sourceCafe) ?? 0
      const ratio = s._count._all > 0 ? ((usable / s._count._all) * 100).toFixed(1) : '0'
      return `${s.sourceCafe}: ${s._count._all}건, 평균품질 ${(s._avg.qualityScore ?? 0).toFixed(2)}, 사용률 ${ratio}%`
    }).join('\n')

    const boardReport = boardQuality
      .sort((a, b) => (b._avg.qualityScore ?? 0) - (a._avg.qualityScore ?? 0))
      .slice(0, 10)
      .map(b => `${b.boardName}: ${b._count._all}건, 품질 ${(b._avg.qualityScore ?? 0).toFixed(2)}`)
      .join('\n')

    const optimization = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `크롤링 소스 성과를 분석하고 config.ts 최적화를 제안하세요.

소스별 성과:
${sourceReport}

보드별 품질 (상위 10):
${boardReport}

크롤링 실행 통계:
${Array.from(sourceStats.entries()).map(([action, s]) => `${action}: 성공 ${s.success}/${s.total}, 수집 ${s.totalItems}건`).join('\n')}

분석 후 다음을 제안하세요:
1. 우선순위를 높여야 할 보드
2. 우선순위를 낮춰야 할 보드
3. 품질 임계값 조정 제안
4. 기타 config.ts 최적화 아이디어

간결하게 핵심만 응답하세요.`,
      }],
    })

    const optimizationText = optimization.content[0].type === 'text'
      ? optimization.content[0].text
      : '분석 실패'

    // 6. 슬랙 리포트
    const body = `*주간 크롤링 소스 분석*

*소스별 성과:*
${sourceReport || '데이터 없음'}

*보드별 품질 (상위):*
${boardReport || '데이터 없음'}

*AI 최적화 제안:*
${optimizationText.slice(0, 800)}`

    await notifySlack({
      level: 'info',
      agent: 'CMO',
      title: '주간 크롤링 소스 분석',
      body,
    })

    const summary = `소스 분석 완료: ${cafePostQuality.length}개 소스, ${boardQuality.length}개 보드 분석`

    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'SOURCE_ANALYSIS',
        status: 'SUCCESS',
        details: summary,
        itemCount: crawlerLogs.length,
        executionTimeMs: Date.now() - start,
      },
    })

    console.log(`[CMO] ${summary}`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[CMO] 소스 분석 실패:', errorMsg)

    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'SOURCE_ANALYSIS',
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
