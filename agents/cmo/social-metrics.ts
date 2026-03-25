import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import * as xClient from './platforms/x-client.js'
import * as threadsClient from './platforms/threads-client.js'

/**
 * CMO Social Metrics — 매일 20:00 KST 실행
 *
 * 최근 48시간 내 게시된 SocialPost의 메트릭을 플랫폼 API에서 수집하여 DB 업데이트.
 * AI 불필요 — 순수 API 호출 + DB 업데이트.
 */

async function main() {
  console.log('[SocialMetrics] 시작')
  const startTime = Date.now()

  // 최근 48시간 내 게시된 포스트 (메트릭 수집 대상)
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const posts = await prisma.socialPost.findMany({
    where: {
      status: 'POSTED',
      platformPostId: { not: null },
      postedAt: { gte: cutoff },
    },
    select: {
      id: true,
      platform: true,
      platformPostId: true,
      metrics: true,
    },
  })

  if (posts.length === 0) {
    console.log('[SocialMetrics] 수집 대상 없음')
    await disconnect()
    return
  }

  let updated = 0
  let failed = 0

  for (const post of posts) {
    try {
      let metrics: Record<string, number> | null = null

      if (post.platform === 'THREADS' && threadsClient.isConfigured() && post.platformPostId) {
        const raw = await threadsClient.getThreadMetrics(post.platformPostId)
        metrics = {
          views: raw.views ?? 0,
          likes: raw.likes ?? 0,
          replies: raw.replies ?? 0,
          reposts: raw.reposts ?? 0,
          quotes: raw.quotes ?? 0,
        }
      } else if (post.platform === 'X' && xClient.isConfigured() && post.platformPostId) {
        const raw = await xClient.getTweetMetrics(post.platformPostId)
        metrics = {
          impressions: raw.impressions ?? 0,
          likes: raw.likes ?? 0,
          retweets: raw.retweets ?? 0,
          replies: raw.replies ?? 0,
          quotes: raw.quotes ?? 0,
          bookmarks: raw.bookmarks ?? 0,
        }
      }

      if (metrics) {
        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            metrics: JSON.parse(JSON.stringify(metrics)),
            metricsUpdatedAt: new Date(),
          },
        })
        updated++
      }
    } catch (err) {
      console.error(`[SocialMetrics] ${post.platform} ${post.platformPostId} 실패:`, err)
      failed++
    }
  }

  const durationMs = Date.now() - startTime

  // BotLog 기록
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'SOCIAL_METRICS',
      status: failed === 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({ total: posts.length, updated, failed }),
      itemCount: updated,
      executionTimeMs: durationMs,
    },
  })

  // 이상치 감지 — 특별히 성과가 좋은 게시물 알림
  const hotPosts = await prisma.socialPost.findMany({
    where: {
      postedAt: { gte: cutoff },
      status: 'POSTED',
      metricsUpdatedAt: { not: null },
    },
    orderBy: { metricsUpdatedAt: 'desc' },
    take: 50,
  })

  for (const hp of hotPosts) {
    const m = hp.metrics as Record<string, number> | null
    if (!m) continue

    const engagement = (m.likes ?? 0) + (m.replies ?? 0) + (m.reposts ?? m.retweets ?? 0)
    if (engagement >= 10) {
      await notifySlack({
        level: 'info',
        agent: 'CMO_SOCIAL',
        title: `SNS 성과 이상치 감지 — ${hp.platform}`,
        body: `*게시물*: ${hp.postText.slice(0, 80)}...\n*참여*: 좋아요 ${m.likes ?? 0} | 댓글 ${m.replies ?? 0} | 공유 ${m.reposts ?? m.retweets ?? 0}\n*페르소나*: ${hp.personaId} | *유형*: ${hp.contentType} | *홍보*: ${hp.promotionLevel}`,
      })
    }
  }

  // Slack 알림
  await notifySlack({
    level: 'info',
    agent: 'CMO_SOCIAL',
    title: `SNS 메트릭 수집 완료 — ${updated}/${posts.length}개`,
    body: `수집: ${updated}개 | 실패: ${failed}개 | 소요: ${Math.round(durationMs / 1000)}초`,
  })

  console.log(`[SocialMetrics] 완료 — ${updated}/${posts.length}개 업데이트, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[SocialMetrics] 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO_SOCIAL',
    title: 'SNS 메트릭 수집 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
