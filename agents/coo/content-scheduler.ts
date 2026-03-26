import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import type { AgentResult } from '../core/types.js'

/**
 * COO 에이전트 — 콘텐츠 스케줄러
 * 에디터스 픽 후보 선정 + 수다방 발제
 */
class COOContentScheduler extends BaseAgent {
  constructor() {
    super({
      name: 'COO_CONTENT',
      botType: 'COO',
      role: 'COO (운영총괄 — 콘텐츠)',
      model: 'light',
      tasks: '에디터스 픽 후보 선정, 수다방 발제 주제 생성',
      canWrite: true,
    })
  }

  protected async run(): Promise<Omit<AgentResult, 'durationMs' | 'timestamp'>> {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

    // 1. 에디터스 픽 후보: 지난 24시간 인기글
    const candidates = await prisma.post.findMany({
      where: {
        createdAt: { gte: yesterday },
        status: 'PUBLISHED',
        boardType: { in: ['STORY', 'HUMOR'] },
        likeCount: { gte: 5 },
      },
      orderBy: { likeCount: 'desc' },
      take: 5,
      select: { id: true, title: true, boardType: true, likeCount: true, viewCount: true, commentCount: true },
    })

    // AI로 에디터스 픽 추천
    let pickRecommendation = ''
    if (candidates.length > 0) {
      pickRecommendation = await this.chat(`
다음 인기글 중 에디터스 픽으로 추천할 글을 최대 2개 골라주세요.
선정 기준: 따뜻한 공감, 유용한 정보, 커뮤니티 가치에 부합

${candidates.map((p, i) => `${i + 1}. [${p.boardType}] "${p.title}" — 공감 ${p.likeCount}, 조회 ${p.viewCount}, 댓글 ${p.commentCount}`).join('\n')}

응답 형식 (JSON):
{ "picks": [{"index": 1, "reason": "추천 이유"}] }
`)

      // 어드민 승인 큐에 등록 (실제 핀은 창업자 승인 후)
      await notifyAdmin({
        level: 'info',
        agent: 'COO',
        title: '에디터스 픽 후보',
        body: `${candidates.length}개 후보 중 추천:\n${pickRecommendation}\n\n→ 어드민에서 승인해주세요.`,
      })
    }

    // 2. 수다방 발제 주제 생성 (월요일만)
    const dayOfWeek = new Date().getDay()
    let topicSuggestion = ''
    if (dayOfWeek === 1) {
      topicSuggestion = await this.chat(`
50~60대 커뮤니티 "사는 이야기" 게시판에 올릴 이번 주 수다방 발제 주제를 2개 제안해주세요.
- 톤: 따뜻하고 편안한 수다 주제
- 예시: "요즘 아침에 일어나면 제일 먼저 뭐 하세요?", "올해 꼭 가보고 싶은 여행지 있으세요?"
- 정치/종교/혐오 절대 금지

응답 형식 (JSON):
{ "topics": [{"title": "발제 제목", "body": "발제 본문 (2-3문장)"}] }
`)

      await notifyAdmin({
        level: 'info',
        agent: 'COO',
        title: '이번 주 수다방 발제 제안',
        body: topicSuggestion,
      })
    }

    return {
      agent: 'COO_CONTENT',
      success: true,
      summary: `에디터스 픽 후보 ${candidates.length}건${dayOfWeek === 1 ? ' + 수다방 발제 생성' : ''}`,
      data: { candidates: candidates.length, isMonday: dayOfWeek === 1 },
    }
  }
}

const agent = new COOContentScheduler()
agent.execute().then((result) => {
  console.log('[COO] 콘텐츠:', result.summary)
  process.exit(0)
})
