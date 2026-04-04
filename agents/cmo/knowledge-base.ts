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

export interface UrgentTopic {
  topic: string
  count: number
  urgencyAvg: number
  psychInsight: string
}

export interface CMOContext {
  topPerformingContent: Array<{ platform: string; contentType: string; avgEngagement: number }>
  activeExperiment: { variable: string; controlValue: string; testValue: string; week: number } | null
  latestTrends: string[]
  strategyMemo: string | null
  recentLearnings: string[]
  // 오늘의 심리 프로파일 (psych-analyzer + trend-analyzer 결과)
  todayDominantDesire: string | null   // "HEALTH"
  todayDominantEmotion: string | null  // "ANXIOUS"
  desireMap: Record<string, number>    // {HEALTH: 35, FAMILY: 20, ...}
  urgentTopics: UrgentTopic[]          // 긴급도 높은 토픽 상위 3개
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

  // 6. 오늘의 심리 프로파일 (CafeTrend 최신)
  const latestTrend = await prisma.cafeTrend.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { dominantDesire: true, dominantEmotion: true, desireMap: true, urgentTopics: true },
  })
  const todayDominantDesire = latestTrend?.dominantDesire ?? null
  const todayDominantEmotion = latestTrend?.dominantEmotion ?? null
  const desireMap = (latestTrend?.desireMap as Record<string, number> | null) ?? {}
  const urgentTopics = Array.isArray(latestTrend?.urgentTopics)
    ? (latestTrend.urgentTopics as UrgentTopic[]).slice(0, 3)
    : []

  return {
    topPerformingContent,
    activeExperiment,
    latestTrends,
    strategyMemo,
    recentLearnings,
    todayDominantDesire,
    todayDominantEmotion,
    desireMap,
    urgentTopics,
  }
}
