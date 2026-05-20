import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import type { AgentResult } from '../core/types.js'

// agents/ → src/ 런타임 import 금지 원칙에 따라 인라인 정의
// 공식 변경 시 src/lib/utils/trending.ts와 동기화 필요
function calculateTrendingScore(likeCount: number, commentCount: number, viewCount: number, createdAt: Date): number {
  const postAge = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60)
  const kstHour = (new Date().getUTCHours() + 9) % 24
  const bonus = kstHour < 6 ? 1.5 : kstHour < 12 ? 1.2 : 1.0
  return Math.round((likeCount * 3 + commentCount * 5 + viewCount * 0.1) * bonus / Math.pow(postAge + 2, 1.5) * 1000) / 1000
}

/**
 * COO 에이전트 — 트렌딩 스코어러
 * GHA 하루 2회 실행 (KST 12:11, 18:11):
 * 1. 최근 7일 게시글의 trendingScore 계산 (실시간과 동일 공식)
 * 2. HOT 게시글 중 활동 없는 오래된 글 → NORMAL 강등
 * 3. HALL_OF_FAME 절대 강등하지 않음
 */
class COOTrendingScorer extends BaseAgent {
  constructor() {
    super({
      name: 'COO_TRENDING',
      botType: 'COO',
      role: 'COO (운영총괄 — 트렌딩)',
      model: 'light',
      tasks: '트렌딩 점수 계산, HOT 게시글 강등 판단',
      canWrite: true,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const now = Date.now()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

    // 1. 트렌딩 점수 계산 — 최근 7일 게시글
    const posts = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        likeCount: true,
        commentCount: true,
        viewCount: true,
        createdAt: true,
      },
    })

    let scored = 0
    for (const post of posts) {
      const score = calculateTrendingScore(post.likeCount, post.commentCount, post.viewCount, post.createdAt)

      await prisma.post.update({
        where: { id: post.id },
        data: { trendingScore: score },
      })
      scored++
    }

    // 2. HOT 강등 로직 (HALL_OF_FAME 절대 건드리지 않음)
    const seventyTwoHoursAgo = new Date(now - 72 * 60 * 60 * 1000)
    const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)

    // 케이스 A: HOT + lastEngagedAt < 72시간 전 + createdAt < 7일 전
    // HOT 강등 시 hotPromotedAt 건드리지 않음 — 의도된 동작.
    // 강등된 글도 뜨는이야기 탭에 영구 잔류해야 하기 때문.
    // (hotPromotedAt 불변성 규칙 → src/lib/actions/promotion.ts 참조)
    const demotedA = await prisma.post.updateMany({
      where: {
        promotionLevel: 'HOT',
        createdAt: { lt: sevenDaysAgo },
        lastEngagedAt: { lt: seventyTwoHoursAgo },
      },
      data: { promotionLevel: 'NORMAL' },  // hotPromotedAt 미포함 — 의도된 동작
    })

    // 케이스 B: HOT + createdAt < 30일 전 + lastEngagedAt < 14일 전
    const demotedB = await prisma.post.updateMany({
      where: {
        promotionLevel: 'HOT',
        createdAt: { lt: thirtyDaysAgo },
        lastEngagedAt: { lt: fourteenDaysAgo },
      },
      data: { promotionLevel: 'NORMAL' },
    })

    // 케이스 C: HOT + lastEngagedAt이 null인 오래된 글 (7일 이상)
    const demotedC = await prisma.post.updateMany({
      where: {
        promotionLevel: 'HOT',
        createdAt: { lt: sevenDaysAgo },
        lastEngagedAt: null,
      },
      data: { promotionLevel: 'NORMAL' },
    })

    const totalDemoted = demotedA.count + demotedB.count + demotedC.count
    const summary = `트렌딩 점수 ${scored}개 업데이트, HOT→NORMAL 강등 ${totalDemoted}개 (A:${demotedA.count} B:${demotedB.count} C:${demotedC.count})`

    console.log(`[COO_TRENDING] ${summary}`)

    return {
      agent: 'COO_TRENDING',
      success: true,
      summary,
      data: { scored, totalDemoted },
    }
  }
}

// 직접 실행
const agent = new COOTrendingScorer()
agent.execute().then((result) => {
  console.log('[COO_TRENDING] 완료:', JSON.stringify(result, null, 2))
})
