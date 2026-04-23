// LOCAL ONLY — 크롤링 데이터 의존, 로컬 실행
/**
 * AI 심리 분석기 (Psych Analyzer)
 *
 * 크롤링된 CafePost를 Claude Haiku로 배치 분석:
 *   - emotionTags: 감정 상태 10개 (ANXIOUS, LONELY, ANGRY, HOPEFUL, RESIGNED, GRATEFUL, PROUD, JEALOUS, CONFUSED, NOSTALGIC)
 *   - desireCategory: 욕망 카테고리 13개 (HEALTH, FAMILY, MONEY, RETIRE, JOB, RELATION, HOBBY, MEANING, DIGNITY, LEGACY, CARE, FREEDOM, ENTERTAIN)
 *   - desireType: 욕망 유형 (big_desire, need, want, demerit)
 *   - communitySignal: 글 쓴 이유 (question, complaint, confession, recommendation, celebration)
 *   - ageSignal: 추론 연령대 (50s, 60s, 70s+, unknown)
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
import { notifySlack } from '../core/notifier.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const BATCH_SIZE = 5  // Bug 5: 10 → 5 (본문 1200자 확대로 토큰 비용 균등 유지)
const client = new Anthropic()

/** 네이버 카페 텍스트의 lone surrogate 문자 제거 (Anthropic API JSON 직렬화 오류 방지) */
function sanitizeForApi(text: string): string {
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

const isTest = process.argv.includes('--test')

// ── 타입 정의 ──

export interface PsychResult {
  index: number
  emotionTags: string[]     // ["ANXIOUS", "LONELY"] — 최대 3개
  desireCategory: string    // "HEALTH" | "FAMILY" | "MONEY" | "RETIRE" | "JOB" | "RELATION" | "HOBBY" | "MEANING" | "DIGNITY" | "LEGACY" | "CARE" | "FREEDOM" | "ENTERTAIN"
  desireType: string        // "big_desire" | "need" | "want" | "demerit"
  communitySignal: string   // "question" | "complaint" | "confession" | "recommendation" | "celebration"
  ageSignal: string         // "50s" | "60s" | "70s+" | "unknown"
  psychInsight: string      // "갱년기 증상 불안, 정보 갈증"
  urgencyLevel: number      // 1-5
  qualitySignals: string[]  // ["불안하다", "어떡하나"]
  speechTone: {
    formality: 'formal' | 'casual' | 'mixed'
    emotionalIntensity: 'high' | 'medium' | 'low'
    keyPhrases: string[]      // 실제 쓰인 표현 최대 5개
    communityVocab: string[]  // 5060 특화 어휘 최대 5개
  }
}

interface PostForAnalysis {
  id: string
  title: string
  content: string
  topComments: { author: string; content: string; likeCount: number }[] | null
  boardName?: string | null
}

// ── Haiku 배치 분석 ──

const SYSTEM_PROMPT = `당신은 50-60대 여성 커뮤니티 심리 분석 전문가입니다.
아래 분류 체계로 각 글을 분석하고 JSON 배열만 반환하세요.

[욕망 카테고리 (desireCategory) — 하나 선택]
HEALTH: 건강/증상/병원/약/갱년기
FAMILY: 가족/자녀/남편/손주/부모 (감정적 관계 중심)
MONEY: 돈/재테크/연금/보험/생활비/절약
RETIRE: 은퇴/노후/인생2막/퇴직/할 일
JOB: 일자리/자격증/부업/재취업/알바
RELATION: 관계/외로움/소통/친구/대화 상대
HOBBY: 취미/여가/귀농귀촌/활동/등산/여행 (내가 직접 하는 활동)
MEANING: 삶의 의미/철학/감사/보람/이 나이에 왜 사나
DIGNITY: 존중/인정/자존감/무시/고부갈등/나이 차별
LEGACY: 자식에게 남기기/기억되고 싶다/내가 죽으면
CARE: 돌봄/간병/부모돌봄/배우자돌봄/내가 아프면 누가
FREEDOM: 자유/독립/나만의 시간/혼자 있고 싶다/남편에서 벗어나
ENTERTAIN: 연예/드라마/팬덤/임영웅/트로트/넷플릭스/콘서트/연예인

[욕망 유형 (desireType) — 하나 선택]
big_desire: 궁극적으로 원하는 상태 ("건강하게 살고 싶다")
need: 지금 당장 필요한 정보/조건 ("이 증상이 뭔지 알고 싶다")
want: 선호하는 방식/형태 ("복잡하지 않게 해결되면 좋겠다")
demerit: 현재의 마찰/불만 ("아무도 알려주지 않는다", "너무 어렵다")

[심리 상태 (emotionTags) — 최대 3개]
LONELY: "혼자다", "아무도", "서럽다", "대화 상대"
ANXIOUS: "불안하다", "걱정이다", "무섭다", "어떡하나"
ANGRY: "화난다", "억울하다", "짜증난다", "왜 나만"
HOPEFUL: "이제라도", "혹시", "해보고 싶다", "기대된다"
RESIGNED: "이 나이에", "어쩌겠어", "포기", "그냥 살지"
GRATEFUL: "그래도", "감사하다", "괜찮아진 것 같다", "위로"
PROUD: "해냈다", "뿌듯하다", "잘됐다", "보람있다"
JEALOUS: "저 사람은 되는데 나는", "부럽다", "상대적으로", "박탈감"
CONFUSED: "뭘 믿어야 할지", "너무 많다", "모르겠다", "정보 과부하"
NOSTALGIC: "그땐 좋았는데", "예전에는", "그리워", "돌아가고 싶다"

[글 쓴 이유 (communitySignal) — 하나 선택]
question: 무언가 물어보러 왔다 (정보 갈증, "아시는 분?", "어떻게 하나요?")
complaint: 하소연/불만 (감정 배출, "너무 힘들어요", "억울해요")
confession: 고백/털어놓기 (죄책감, 비밀, "사실 저는...")
recommendation: 추천/경험 공유 ("저는 이게 좋았어요", "이거 써보세요")
celebration: 자랑/기쁨 나누기 (성취, "드디어 됐어요!", "너무 기뻐요")

[추론 연령대 (ageSignal) — 하나 선택]
50s: 50대로 추정 ("오십대", "50대", "갱년기", "자녀 대학", "취업")
60s: 60대로 추정 ("육십대", "60대", "손주", "은퇴 후", "퇴직")
70s+: 70대 이상 추정 ("칠십", "70대", "노인", "요양")
unknown: 연령 추정 불가

[긴급도 (urgencyLevel)]
5: 즉각 위기 ("오늘 병원", "당장 돈이")
4: 근 미래 불안 ("이번 주", "다음 달이 걱정")
3: 중기 고민 ("올해 안에", "언젠가는")
2: 막연한 걱정 ("나중에 어떡하지", "그냥 불안")
1: 일상 관심 (정보공유, 수다, 자랑, 엔터 이야기)

[말투 분석 (speechTone)]
formality: "formal"(존댓말 위주), "casual"(반말 위주), "mixed"(혼용)
emotionalIntensity: "high"(느낌표/줄임말/감탄사 많음, 감정 폭발), "medium"(보통), "low"(차분한 서술)
keyPhrases: 글·댓글에서 실제 쓰인 인상적 표현 최대 5개 (예: "어머 진짜요?", "그러게 말이에요", "언니들 어때요?")
communityVocab: 5060 커뮤니티 특화 어휘 최대 5개 (예: "우리 나이", "갱년기야", "언니들", "이 나이에", "손주")

[분석 원칙]
- 제목 < 본문 < 댓글 순으로 진짜 감정이 강함 (댓글이 있으면 댓글 우선)
- 정보 공유글/자랑글은 urgencyLevel=1, 고민/불안글은 3-5
- ENTERTAIN: 연예인/드라마/트로트/콘서트 이야기면 urgencyLevel=1 고정
- emotionTags 없으면 [] 반환
- qualitySignals: 분석 근거가 된 실제 표현들 (최대 3개)
- keyPhrases/communityVocab: 없으면 빈 배열`

/** 단일 API 호출 — 파싱 실패 시 null 반환 */
async function callAnalyzeApi(posts: PostForAnalysis[]): Promise<PsychResult[] | null> {
  const postTexts = posts.map((p, i) => {
    const comments = p.topComments ?? []
    const commentText = comments.length > 0
      ? `\n댓글: ${comments.slice(0, 3).map((c: { content: string }) => c.content).join(' / ')}`
      : ''
    const boardHint = p.boardName ? `[게시판: ${p.boardName}]\n` : ''
    // Bug 5: 600 → 1200자 (5060 글은 사연이 길어 핵심이 후반부에 나옴)
    return `[글 ${i + 1}] ${boardHint}제목: ${sanitizeForApi(p.title)}\n본문: ${sanitizeForApi(p.content.slice(0, 1200))}${commentText}`
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
    "communitySignal": "question",
    "ageSignal": "50s",
    "psychInsight": "갱년기 증상 불안, 의학적 정보 갈증",
    "urgencyLevel": 4,
    "qualitySignals": ["어떡하나", "무서워"],
    "speechTone": {
      "formality": "formal",
      "emotionalIntensity": "high",
      "keyPhrases": ["어떡하나", "너무 불안해요"],
      "communityVocab": ["갱년기", "우리 나이"]
    }
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
    console.warn('[PsychAnalyzer] JSON 파싱 실패:', text.slice(0, 200))
    return null
  }
}

export async function analyzeBatch(posts: PostForAnalysis[]): Promise<PsychResult[]> {
  if (posts.length === 0) return []

  // 1차: 배치 전체 시도
  const batchResult = await callAnalyzeApi(posts)
  if (batchResult !== null) return batchResult

  // Bug 6: 배치 실패 → 1개씩 개별 재시도 (배치 전체 유실 방지)
  console.warn(`[PsychAnalyzer] 배치 파싱 실패 — ${posts.length}개 개별 재시도 시작`)
  const individualResults: PsychResult[] = []
  let consecutiveFails = 0

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]
    try {
      const result = await callAnalyzeApi([post])
      if (result !== null && result.length > 0) {
        // index를 배치 내 위치로 재설정
        individualResults.push({ ...result[0], index: i + 1 })
        consecutiveFails = 0
      } else {
        consecutiveFails++
      }
    } catch {
      consecutiveFails++
    }

    // 3회 연속 실패 시 Slack 경고 후 중단
    if (consecutiveFails >= 3) {
      await notifySlack({
        level: 'warning',
        agent: 'PSYCH_ANALYZER',
        title: 'AI 분석 3회 연속 실패',
        body: `개별 재시도 중 ${consecutiveFails}회 실패 — 글 "${post.title.slice(0, 30)}" 주변`,
      })
      break
    }
  }

  return individualResults
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
      boardName: true,
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
          communitySignal: result.communitySignal ?? null,
          ageSignal: result.ageSignal ?? null,
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
      console.log(`  신호: ${r.communitySignal} | 연령: ${r.ageSignal}`)
      console.log(`  인사이트: ${r.psychInsight}`)
      console.log(`  근거: ${r.qualitySignals.join(', ')}`)
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
