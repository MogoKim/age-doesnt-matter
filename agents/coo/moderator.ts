import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * COO 에이전트 — 모더레이션
 * AI 필터에 걸린 콘텐츠 2차 판단 + 신고 3회 자동 숨김
 */
class COOModerator extends BaseAgent {
  constructor() {
    super({
      name: 'COO_MODERATE',
      botType: 'COO',
      role: 'COO (운영총괄 — 모더레이션)',
      model: 'light',
      tasks: '콘텐츠 모더레이션: AI 필터 2차 판단, 신고 처리, 자동 숨김',
      canWrite: true,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    let hiddenCount = 0
    let reviewedCount = 0

    // 1. 신고 3회 이상 게시글 자동 숨김
    const reportedPosts = await prisma.post.findMany({
      where: {
        reportCount: { gte: 3 },
        status: 'PUBLISHED',
      },
      select: { id: true, title: true, reportCount: true },
    })

    for (const post of reportedPosts) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: 'HIDDEN' },
      })
      hiddenCount++
    }

    // 2. 신고 3회 이상 댓글 자동 숨김
    const reportedComments = await prisma.comment.findMany({
      where: {
        reportCount: { gte: 3 },
        status: 'ACTIVE',
      },
      select: { id: true, content: true, reportCount: true },
    })

    for (const comment of reportedComments) {
      await prisma.comment.update({
        where: { id: comment.id },
        data: { status: 'HIDDEN' },
      })
      hiddenCount++
    }

    // 3. AI 필터에 걸린 콘텐츠 2차 판단
    const filteredComments = await prisma.comment.findMany({
      where: { isFiltered: true, status: 'ACTIVE' },
      select: { id: true, content: true },
      take: 20,
    })

    for (const comment of filteredComments) {
      const verdict = await this.chat(`
다음 댓글이 우리 커뮤니티 규정에 위반되는지 판단하세요.

금지 항목:
- 정치적 발언/선동
- 종교 갈등 유발
- 혐오 표현 (세대/성별/지역/인종)
- 성인 콘텐츠
- 도박/다단계/불법 광고
- 타인 비방/명예훼손

댓글: "${comment.content}"

응답: "HIDE" (위반) 또는 "KEEP" (무해) 한 단어만
`)

      const action = verdict.trim().toUpperCase()
      if (action.includes('HIDE')) {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { status: 'HIDDEN', isFiltered: true },
        })
        hiddenCount++
      } else {
        await prisma.comment.update({
          where: { id: comment.id },
          data: { isFiltered: false },
        })
      }
      reviewedCount++
    }

    const summary = `모더레이션 완료: 숨김 ${hiddenCount}건, AI 리뷰 ${reviewedCount}건`

    if (hiddenCount > 0) {
      await notifyAdmin({
        level: 'important',
        agent: 'COO',
        title: '모더레이션 액션',
        body: `${hiddenCount}건 숨김 처리 (신고 ${reportedPosts.length + reportedComments.length}건 + AI 판단 ${filteredComments.length}건)`,
      })
    }

    return {
      agent: 'COO_MODERATE',
      success: true,
      summary,
      data: { hiddenCount, reviewedCount, reportedPosts: reportedPosts.length, reportedComments: reportedComments.length },
    }
  }
}

const agent = new COOModerator()
agent.execute().then((result) => {
  console.log('[COO] 모더레이션:', result.summary)
  process.exit(0)
})
