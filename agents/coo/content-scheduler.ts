import { BaseAgent } from '../core/agent.js'
import { prisma } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import { loadTodayBrief } from '../core/intelligence.js'
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

    // 욕망 지도 로드 — 에디터스 픽 기준 및 발제 주제에 활용
    const brief = await loadTodayBrief({ fallbackToPrevious: true, consumedBy: 'coo-content' })
    const dominantDesire = brief?.dominantDesire ?? 'RELATION'
    const topDesires = brief?.desireRanking.slice(0, 3).map(d => d.label).join(', ') ?? 'RELATION, RETIRE, MONEY'

    // 전략 욕망 우선순위 (확정): RELATION(연결) → RETIRE(인생2막) → MONEY(노후자금) → HEALTH(건강)
    const DESIRE_BOARD_CONFIG: Record<string, { boardType: string; hint: string }> = {
      RELATION: { boardType: 'STORY',    hint: '사는이야기/웃음방 — 공감, 연결, 위로 글 우선' },
      RETIRE:   { boardType: 'LIFE2',    hint: '2막준비(LIFE2) — 은퇴, 인생2막, 의미 찾기 글 우선' },
      MONEY:    { boardType: 'LIFE2',    hint: '2막준비(LIFE2) — 재테크, 연금, 노후자금 글 우선' },
      HEALTH:   { boardType: 'MAGAZINE', hint: '사는이야기/매거진 — 건강 경험담, 정보 글 우선' },
    }
    const desireConfig = DESIRE_BOARD_CONFIG[dominantDesire] ?? DESIRE_BOARD_CONFIG['RELATION']
    const boardHint = `[boardType: ${desireConfig.boardType}] ${desireConfig.hint}`

    // 1. 에디터스 픽 후보: 지난 24시간 인기글 (LIFE2 포함)
    const candidates = await prisma.post.findMany({
      where: {
        createdAt: { gte: yesterday },
        status: 'PUBLISHED',
        boardType: { in: ['STORY', 'HUMOR', 'LIFE2'] },
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

[오늘의 커뮤니티 욕망: ${dominantDesire} / 상위 욕망: ${topDesires}]
[에디터스 픽 기준 힌트: ${boardHint}]

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
50~60대 커뮤니티에 올릴 이번 주 수다방 발제 주제를 3개 제안해주세요.
- 사는 이야기(STORY) 2개: 따뜻한 수다, 공감, 일상 연결 주제 (5060, 서로를 잇다 — 외로움·연결 욕망 반영)
- 2막 준비(LIFE2) 1개: 은퇴준비·연금·노후·인생2막 실용 주제

[오늘의 커뮤니티 욕망: ${dominantDesire} | 상위: ${topDesires}]
톤: "이 나이에 이런 얘기 어디서 하겠어요 — 여기서 하세요." 느낌
예시(STORY): "요즘 아침에 일어나면 제일 먼저 뭐 하세요?", "혼자라는 생각이 들 때 어떻게 하세요?"
예시(LIFE2): "퇴직 후 생활비 얼마나 드세요? 미리 계획하신 분 있으세요?"
정치/종교/혐오 절대 금지

응답 형식 (JSON):
{ "topics": [{"board": "STORY|LIFE2", "title": "발제 제목", "body": "발제 본문 (2-3문장)"}] }
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
