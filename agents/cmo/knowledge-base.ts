/**
 * CMO Knowledge Base — 공유 컨텍스트 빌더
 *
 * CMO 하위 에이전트(social-poster, trend-analyzer 등)가 호출하여
 * 최근 성과/실험/트렌드/전략 컨텍스트를 AI 프롬프트에 주입할 수 있습니다.
 */

import { prisma } from '../core/db.js'

interface MetricsJson {
  impressions?: number
  likes?: number
  comments?: number
  shares?: number
  clicks?: number
}

export interface CMOContext {
  topPerformingContent: Array<{ platform: string; contentType: string; avgEngagement: number }>
  activeExperiment: { variable: string; controlValue: string; testValue: string; week: number } | null
  latestTrends: string[]
  strategyMemo: string | null
  recentLearnings: string[]
}

export async function getCMOContext(): Promise<CMOContext> {
  // 1. Top 3 performing content types from last 7 days SocialPost
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const recentPosts = await prisma.socialPost.findMany({
    where: { createdAt: { gte: sevenDaysAgo } },
    select: { platform: true, contentType: true, metrics: true },
  })

  // Aggregate by platform:contentType using metrics Json field
  const typeMap = new Map<string, { total: number; count: number; platform: string }>()
  for (const p of recentPosts) {
    const m = (p.metrics ?? {}) as MetricsJson
    const engagement = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0)
    const key = `${p.platform}:${p.contentType}`
    const existing = typeMap.get(key) ?? { total: 0, count: 0, platform: p.platform }
    existing.total += engagement
    existing.count += 1
    typeMap.set(key, existing)
  }
  const topPerformingContent = [...typeMap.entries()]
    .map(([key, v]) => ({
      platform: v.platform,
      contentType: key.split(':')[1],
      avgEngagement: v.count > 0 ? v.total / v.count : 0,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, 3)

  // 2. Active experiment
  const experiment = await prisma.socialExperiment.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { variable: true, controlValue: true, testValue: true, weekNumber: true },
  })
  const activeExperiment = experiment
    ? { variable: experiment.variable, controlValue: experiment.controlValue, testValue: experiment.testValue, week: experiment.weekNumber }
    : null

  // 3. Latest trends from BotLog (CMO trend analyzer)
  const trendLog = await prisma.botLog.findFirst({
    where: { botType: 'CMO', action: { contains: 'trend' } },
    orderBy: { createdAt: 'desc' },
    select: { details: true },
  })
  const latestTrends = trendLog?.details ? [trendLog.details.slice(0, 500)] : []

  // 4. Strategy memo from BotLog
  const strategyLog = await prisma.botLog.findFirst({
    where: { botType: 'CMO', action: { contains: 'strategy' } },
    orderBy: { createdAt: 'desc' },
    select: { details: true },
  })
  const strategyMemo = strategyLog?.details?.slice(0, 1000) ?? null

  // 5. Recent 3 experiment learnings
  const experimentLearnings = await prisma.socialExperiment.findMany({
    where: { learnings: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { learnings: true, variable: true, weekNumber: true },
  })
  const recentLearnings = experimentLearnings
    .filter(e => e.learnings)
    .map(e => `Week ${e.weekNumber} (${e.variable}): ${String(e.learnings).slice(0, 200)}`)

  return { topPerformingContent, activeExperiment, latestTrends, strategyMemo, recentLearnings }
}
