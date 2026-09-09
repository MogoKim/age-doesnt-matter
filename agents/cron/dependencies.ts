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
  // 비어 있는 게 정상이다. 규칙은 전부 CAFE_CRAWLER 산출(CAFE_CRAWL·TREND_ANALYSIS)을
  // 기다리던 것이었고, 그 생산자는 R4 B-3 에서 제거됐다(2026-09-09).
  // 규칙이 없으면 waitForDependencies 는 true 를 돌려주므로 실행을 막지 않는다.
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
