// LOCAL ONLY — 크롤링 데이터 의존, 로컬 실행
/**
 * AI 심리 분석기 (Psych Analyzer)
 *
 * 크롤링된 CafePost를 Claude Haiku로 배치 분석:
 *   - emotionTags: 감정 상태 (ANXIOUS, LONELY, ANGRY, HOPEFUL, RESIGNED, GRATEFUL, PROUD)
 *   - desireCategory: 욕망 카테고리 (HEALTH, FAMILY, MONEY, RETIRE, JOB, RELATION, HOBBY, MEANING)
 *   - desireType: 욕망 유형 (big_desire, need, want, demerit)
 *   - psychInsight: 1줄 심리 요약
 *   - urgencyLevel: 긴급도 1-5
 *
 * 분류 기준: docs/desire_taxonomy.md 참고
 *
 * 사용법:
 *   npx tsx agents/cafe/psych-analyzer.ts          # 오늘 미분석 글 전체
 *   npx tsx agents/cafe/psych-analyzer.ts --test   # 샘플 5개 테스트 출력
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const BATCH_SIZE = 10 // 한 번에 Haiku에 전송할 글 수
const client = new Anthropic()

const isTest = process.argv.includes('--test')

// ── 타입 정의 ──

export interface PsychResult {
  index: number
  emotionTags: string[]     // ["ANXIOUS", "LONELY"]
  desireCategory: string    // "HEALTH"
  desireType: string        // "big_desire" | "need" | "want" | "demerit"
  psychInsight: string      // "갱년기 증상 불안, 정보 갈증"
  urgencyLevel: number      // 1-5
  qualitySignals: string[]  // ["불안하다", "어떡하나"]
}

interface PostForAnalysis {
  id: string
  title: string
  content: string
  topComments: { author: string; content: string; likeCount: number }[] | null
}

// ── Haiku 배치 분석 ──

const SYSTEM_PROMPT = `당신은 50-60대 여성 커뮤니티 심리 분석 전문가입니다.
아래 분류 체계로 각 글을 분석하고 JSON 배열만 반환하세요.

[욕망 카테고리 (desireCategory) — 하나 선택]
HEALTH: 건강/증상/병원/약
FAMILY: 가족/자녀/남편/손주/부모
MONEY: 돈/재테크/연금/보험/생활비
RETIRE: 은퇴/노후/인생2막/퇴직
JOB: 일자리/자격증/부업/재취업
RELATION: 관계/외로움/소통/친구
HOBBY: 취미/여가/귀농귀촌/활동
MEANING: 삶의 의미/철학/감사/보람

[욕망 유형 (desireType) — 하나 선택]
big_desire: 궁극적으로 원하는 상태 ("건강하게 살고 싶다")
need: 지금 당장 필요한 정보/조건 ("이 증상이 뭔지 알고 싶다")
want: 선호하는 방식/형태 ("복잡하지 않게 해결되면 좋겠다")
demerit: 현재의 마찰/불만 ("아무도 알려주지 않는다", "너무 어렵다")

[심리 상태 (emotionTags) — 최대 3개]
LONELY: "혼자다", "아무도", "서럽다"
ANXIOUS: "불안하다", "걱정이다", "무섭다", "어떡하나"
ANGRY: "화난다", "억울하다", "짜증난다"
HOPEFUL: "이제라도", "혹시", "해보고 싶다"
RESIGNED: "이 나이에", "어쩌겠어", "포기"
GRATEFUL: "그래도", "감사하다", "괜찮아진 것 같다"
PROUD: "해냈다", "뿌듯하다", "잘됐다"

[긴급도 (urgencyLevel)]
5: 즉각 위기 ("오늘 병원", "당장 돈이")
4: 근 미래 불안 ("이번 주", "다음 달이 걱정")
3: 중기 고민 ("올해 안에", "언젠가는")
2: 막연한 걱정 ("나중에 어떡하지", "그냥 불안")
1: 일상 관심 (정보공유, 수다, 자랑)

[분석 원칙]
- 제목 < 본문 < 댓글 순으로 진짜 감정이 강함 (댓글이 있으면 댓글 우선)
- 정보 공유글은 urgencyLevel=1, 고민/불안글은 3-5
- emotionTags 없으면 [] 반환 (GRATEFUL 또는 PROUD만 있을 수 있음)
- qualitySignals: 분석 근거가 된 실제 표현들 (최대 3개)`

export async function analyzeBatch(posts: PostForAnalysis[]): Promise<PsychResult[]> {
  if (posts.length === 0) return []

  const postTexts = posts.map((p, i) => {
    const commentText = p.topComments && p.topComments.length > 0
      ? `\n댓글: ${p.topComments.slice(0, 3).map(c => c.content).join(' / ')}`
      : ''
    return `[글 ${i + 1}] 제목: ${p.title}\n본문: ${p.content.slice(0, 600)}${commentText}`
  }).join('\n\n---\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `다음 ${posts.length}개 글을 분석하세요.

${postTexts}

응답 형식 (JSON 배열만, 마크다운 없이):
[
  {
    "index": 1,
    "emotionTags": ["ANXIOUS", "LONELY"],
    "desireCategory": "HEALTH",
    "desireType": "need",
    "psychInsight": "갱년기 증상 불안, 의학적 정보 갈증",
    "urgencyLevel": 4,
    "qualitySignals": ["어떡하나", "무서워"]
  }
]`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)

  try {
    const results = JSON.parse(arrMatch ? arrMatch[0] : cleaned) as PsychResult[]
    return results
  } catch {
    console.warn('[PsychAnalyzer] JSON 파싱 실패, 배치 스킵:', text.slice(0, 200))
    return []
  }
}

// ── 오늘 미분석 글 조회 ──

async function getUnanalyzedPosts(limit = 200) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return prisma.cafePost.findMany({
    where: {
      aiAnalyzed: false,
      crawledAt: { gte: todayStart },
      qualityScore: { gte: 30 },
    },
    orderBy: { qualityScore: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      content: true,
      topComments: true,
    },
  })
}

// ── 분석 결과 DB 저장 ──

async function saveResults(posts: PostForAnalysis[], results: PsychResult[]) {
  const resultMap = new Map(results.map(r => [r.index, r]))

  await Promise.all(
    posts.map(async (post, i) => {
      const result = resultMap.get(i + 1)
      if (!result) return

      await prisma.cafePost.update({
        where: { id: post.id },
        data: {
          emotionTags: result.emotionTags ?? [],
          desireCategory: result.desireCategory ?? null,
          desireType: result.desireType ?? null,
          psychInsight: result.psychInsight ?? null,
          urgencyLevel: result.urgencyLevel ?? null,
          aiAnalyzed: true,
        },
      })
    }),
  )
}

// ── 메인 실행 ──

async function main() {
  if (isTest) {
    console.log('[PsychAnalyzer] 테스트 모드 — 샘플 5개 분석')
    const samples: PostForAnalysis[] = [
      {
        id: 'test-1',
        title: '갱년기 증상인지 모르겠어요 가슴이 너무 두근두근해서',
        content: '요즘 갑자기 심장이 막 두근거리고 얼굴이 화끈거려요. 병원을 가야 하는 건지, 갱년기인지 아니면 다른 이유인지 너무 불안하네요.',
        topComments: [{ author: '익명', content: '저도 그랬어요! 갱년기 시작인 것 같아요 빨리 병원 가보세요', likeCount: 3 }],
      },
      {
        id: 'test-2',
        title: '퇴직하고 나서 하루가 너무 길어요',
        content: '남편은 아직 출근하고 저 혼자 집에 있으니까 뭘 해야 할지 모르겠어요. 친구들은 다들 바빠서 연락하기도 미안하고...',
        topComments: [],
      },
      {
        id: 'test-3',
        title: '국민연금 납부 중단하면 어떻게 되나요?',
        content: '형편이 어려워서 이번 달부터 못 낼 것 같아요. 나중에 문제 생기나요? 아시는 분 계세요?',
        topComments: [{ author: '연금전문가', content: '임의계속가입 신청하시면 돼요', likeCount: 5 }],
      },
      {
        id: 'test-4',
        title: '딸이 취업했어요 ㅠㅠ 너무 기뻐서',
        content: '3년 동안 고생했는데 드디어 좋은 회사에 취업했네요. 눈물이 앞을 가리네요. 다들 힘내세요 언젠가는 좋은 날이 올 거예요!',
        topComments: [],
      },
      {
        id: 'test-5',
        title: '이 나이에 뭘 배울 수 있을까요',
        content: '60대인데 뭔가 배우고 싶은데 막막해요. 컴퓨터도 잘 모르고 체력도 예전 같지 않고... 그냥 이렇게 사는 건지',
        topComments: [{ author: '언니', content: '저는 60에 요가 시작했어요! 할 수 있어요', likeCount: 8 }],
      },
    ]

    const results = await analyzeBatch(samples)
    console.log('\n[PsychAnalyzer] 분석 결과:')
    results.forEach(r => {
      const p = samples[r.index - 1]
      console.log(`\n제목: ${p.title}`)
      console.log(`  감정: ${r.emotionTags.join(', ')} | 욕망: ${r.desireCategory} (${r.desireType}) | 긴급도: ${r.urgencyLevel}`)
      console.log(`  인사이트: ${r.psychInsight}`)
      console.log(`  신호: ${r.qualitySignals.join(', ')}`)
    })
    return
  }

  console.log('[PsychAnalyzer] 시작')
  const startTime = Date.now()

  const posts = await getUnanalyzedPosts()
  if (posts.length === 0) {
    console.log('[PsychAnalyzer] 오늘 분석할 글 없음 — 스킵')
    await disconnect()
    return
  }

  console.log(`[PsychAnalyzer] ${posts.length}개 글 분석 시작 (배치 크기: ${BATCH_SIZE})`)

  let analyzed = 0
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE)
    const results = await analyzeBatch(batch as PostForAnalysis[])
    await saveResults(batch as PostForAnalysis[], results)
    analyzed += results.length
    console.log(`[PsychAnalyzer] ${Math.min(i + BATCH_SIZE, posts.length)}/${posts.length} 완료`)
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  console.log(`[PsychAnalyzer] 완료 — ${analyzed}개 분석, ${elapsed}초`)

  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'PSYCH_ANALYSIS',
      status: 'SUCCESS',
      details: JSON.stringify({ postsAnalyzed: analyzed }),
      itemCount: analyzed,
      executionTimeMs: Date.now() - startTime,
    },
  })

  await disconnect()
}

main().catch(async (err) => {
  console.error('[PsychAnalyzer] 오류:', err)
  await disconnect()
  process.exit(1)
})
