import { prisma } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

export interface DependencyRule {
  /** 선행 작업의 botType */
  requiredBotType: string
  /** 선행 작업의 action (optional) */
  requiredAction?: string
  /** 날짜 오프셋: 0=오늘, -1=어제 */
  dateOffset: 0 | -1
  /** 최대 대기 시간 (분). 0이면 대기 없이 체크만 */
  maxWaitMinutes: number
  /** 폴링 간격 (분) */
  pollIntervalMinutes: number
}

export const DEPENDENCY_MAP: Record<string, DependencyRule[]> = {
  // 트렌드 분석 ← 카페 크롤러 완료 필요
  'cmo:trend-analyzer': [{
    requiredBotType: 'CAFE_CRAWLER',
    requiredAction: 'CAFE_CRAWL',
    dateOffset: 0,
    maxWaitMinutes: 60,
    pollIntervalMinutes: 5,
  }],
  // 콘텐츠 스케줄러 ← 트렌드 분석 완료 필요
  'coo:content-scheduler': [{
    requiredBotType: 'CAFE_CRAWLER',
    requiredAction: 'TREND_ANALYSIS',
    dateOffset: 0,
    maxWaitMinutes: 90,
    pollIntervalMinutes: 10,
  }],
  // 매거진 생성 ← 콘텐츠 큐레이션 완료 필요
  'cafe_crawler:magazine-generate': [{
    requiredBotType: 'CAFE_CRAWLER',
    requiredAction: 'CONTENT_CURATE',
    dateOffset: 0,
    maxWaitMinutes: 60,
    pollIntervalMinutes: 10,
  }],
  // CEO 모닝 ← 전날 CDO KPI (대기 없이)
  'ceo:morning-cycle': [{
    requiredBotType: 'CDO',
    requiredAction: 'KPI_DAILY',
    dateOffset: -1,
    maxWaitMinutes: 0,
    pollIntervalMinutes: 0,
  }],
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 선행 작업 완료 대기
 * @returns true=의존성 충족, false=미충족(스킵해야 함)
 */
export async function waitForDependencies(key: string): Promise<boolean> {
  const rules = DEPENDENCY_MAP[key]
  if (!rules || rules.length === 0) return true

  for (const rule of rules) {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + rule.dateOffset)
    targetDate.setHours(0, 0, 0, 0)

    const deadline = rule.maxWaitMinutes > 0
      ? Date.now() + rule.maxWaitMinutes * 60 * 1000
      : 0

    let found = false

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const log = await prisma.botLog.findFirst({
        where: {
          botType: rule.requiredBotType,
          status: 'SUCCESS',
          createdAt: { gte: targetDate },
          ...(rule.requiredAction ? { action: rule.requiredAction } : {}),
        },
        orderBy: { createdAt: 'desc' },
      })

      if (log) { found = true; break }
      if (rule.maxWaitMinutes === 0) break  // 대기 없이 체크만
      if (Date.now() >= deadline) break     // 타임아웃

      console.log(`[Dependencies] ${key}: ${rule.requiredBotType}:${rule.requiredAction ?? '*'} 대기 중... (${rule.pollIntervalMinutes}분 후 재확인)`)
      await sleep(rule.pollIntervalMinutes * 60 * 1000)
    }

    if (!found && rule.maxWaitMinutes > 0) {
      await notifySlack({
        level: 'important',
        agent: key.split(':')[0].toUpperCase(),
        title: `의존성 미충족 — ${key} 스킵`,
        body: `선행 작업 ${rule.requiredBotType}:${rule.requiredAction ?? '*'} 미완료 (${rule.maxWaitMinutes}분 대기 후 타임아웃)`,
      })
      return false
    }
  }
  return true
}
