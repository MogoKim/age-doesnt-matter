/**
 * 콘텐츠 큐레이터
 * 카페 트렌드 분석 결과를 기반으로 우나어 페르소나가 쓸 글/댓글을 생성
 * 원본 복붙 X → 주제와 감정만 참고해 오리지널 콘텐츠 작성
 */
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import type { CuratedContent, TrendAnalysis } from './types.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

/** 페르소나별 적합 매칭 */
interface PersonaMatch {
  id: string
  nickname: string
  board: string
  style: string
  patterns: string[]
  topics: string[]
}

const PERSONAS: PersonaMatch[] = [
  { id: 'A', nickname: '영숙이맘', board: 'STORY', style: '일상 수다, 손주 자랑', patterns: ['~해요', '~더라고요'], topics: ['시장', '손주', '요리', '건강', '날씨'] },
  { id: 'B', nickname: '은퇴신사', board: 'STORY', style: '정보형, 차분', patterns: ['~합니다', '~이더군요'], topics: ['퇴직', '건강관리', '재테크', '산책', '독서'] },
  { id: 'C', nickname: '웃음보', board: 'HUMOR', style: '유쾌, 짧은 리액션', patterns: ['ㅋㅋㅋ', '😂'], topics: ['유머', '재미'] },
  { id: 'E', nickname: '동네언니', board: 'STORY', style: '공감, 다정', patterns: ['맞아요~', '저도 그래요'], topics: ['공감', '위로', '경험'] },
  { id: 'F', nickname: '텃밭아저씨', board: 'STORY', style: '텃밭, 자연, 요리', patterns: ['~했지요', '~입니다'], topics: ['텃밭', '요리', '자연', '농사'] },
  { id: 'G', nickname: '여행매니아', board: 'STORY', style: '여행, 맛집 탐방', patterns: ['~했어요!', '강추!'], topics: ['여행', '맛집', '산책', '드라이브'] },
  { id: 'H', nickname: '건강박사', board: 'STORY', style: '건강 정보, 운동', patterns: ['~하세요', '~좋습니다'], topics: ['건강', '운동', '관절', '영양제', '수면'] },
  { id: 'I', nickname: '책벌레', board: 'STORY', style: '독서, 문화생활', patterns: ['~읽었는데', '~추천합니다'], topics: ['독서', '영화', '전시', '음악'] },
  { id: 'J', nickname: '요리왕', board: 'STORY', style: '레시피, 반찬', patterns: ['~만들었어요', '~맛있어요'], topics: ['요리', '반찬', '레시피', '장보기'] },
  { id: 'K', nickname: '패션언니', board: 'STORY', style: '패션, 쇼핑, 자기관리', patterns: ['~했어요', '완전~'], topics: ['패션', '화장품', '쇼핑', '피부'] },
  { id: 'L', nickname: '손주바보', board: 'STORY', style: '손주 이야기, 육아 경험', patterns: ['우리 손주가~', '~더라구요'], topics: ['손주', '가족', '명절', '육아'] },
  { id: 'M', nickname: '등산러버', board: 'STORY', style: '등산, 트레킹, 자연 풍경', patterns: ['~다녀왔습니다', '~추천합니다'], topics: ['등산', '둘레길', '산행', '자연'] },
  { id: 'N', nickname: '살림9단', board: 'STORY', style: '살림 노하우, 절약, 정리정돈', patterns: ['~하면 돼요', '~해보세요'], topics: ['살림', '절약', '정리', '세탁', '재활용'] },
  { id: 'O', nickname: '음악사랑', board: 'STORY', style: '음악, 추억의 노래, 콘서트', patterns: ['~들으니까', '~생각나요'], topics: ['음악', '노래', '콘서트', '라디오'] },
  { id: 'P', nickname: '커피한잔', board: 'STORY', style: '카페, 일상, 감성 에세이', patterns: ['~있잖아요', '~좋더라고요'], topics: ['카페', '일상', '산책', '계절'] },
  { id: 'Q', nickname: '반려견아빠', board: 'STORY', style: '반려동물, 산책, 일상', patterns: ['우리 멍이가~', '~하더라고요'], topics: ['반려견', '산책', '동물병원', '공원'] },
  { id: 'R', nickname: '드라마덕후', board: 'HUMOR', style: '드라마/예능 감상, 연예인', patterns: ['어제 본 거~', '~완전 재밌어요!'], topics: ['드라마', '예능', '영화', '연예인'] },
  { id: 'S', nickname: '텃밭할머니', board: 'STORY', style: '텃밭, 꽃, 시골 일상', patterns: ['~피었어요', '~심었는데'], topics: ['꽃', '텃밭', '시골', '계절'] },
  { id: 'T', nickname: '은퇴교사', board: 'STORY', style: '교육, 인생 조언, 배움', patterns: ['~하시면 좋겠어요', '~해보시는 건 어떨까요'], topics: ['교육', '봉사', '자격증', '배움'] },
]

/** 트렌드 주제에 가장 적합한 페르소나 매칭 */
function matchPersona(topic: string): PersonaMatch {
  const topicLower = topic.toLowerCase()

  // 토픽 키워드와 페르소나 관심사 매칭
  let bestMatch = PERSONAS[0]
  let bestScore = 0

  for (const persona of PERSONAS) {
    let score = 0
    for (const t of persona.topics) {
      if (topicLower.includes(t) || t.includes(topicLower)) {
        score += 2
      }
    }
    // 스타일 매칭
    if (persona.style.toLowerCase().includes(topicLower)) score += 1

    if (score > bestScore) {
      bestScore = score
      bestMatch = persona
    }
  }

  // 매칭 안 되면 랜덤 (A, E 중심 — 범용성 높음)
  if (bestScore === 0) {
    const generalPersonas = PERSONAS.filter(p => ['A', 'E', 'G'].includes(p.id))
    bestMatch = generalPersonas[Math.floor(Math.random() * generalPersonas.length)]
  }

  return bestMatch
}

/** 참고용 원본 글 가져오기 (isUsable = true) */
async function getReferencePosts(topic: string, limit: number) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return prisma.cafePost.findMany({
    where: {
      isUsable: true,
      crawledAt: { gte: todayStart },
      OR: [
        { title: { contains: topic, mode: 'insensitive' } },
        { topics: { has: topic.toLowerCase() } },
      ],
    },
    orderBy: { likeCount: 'desc' },
    take: limit,
    select: { id: true, title: true, content: true, cafeName: true },
  })
}

/** 큐레이션된 글 생성 */
async function generateCuratedPost(
  persona: PersonaMatch,
  topic: string,
  referencePosts: { title: string; content: string; cafeName: string }[],
): Promise<CuratedContent | null> {
  const references = referencePosts.map((p, i) =>
    `참고글 ${i + 1} (${p.cafeName}): "${p.title}"\n${p.content.slice(0, 300)}`,
  ).join('\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: `당신은 "${persona.nickname}" (50~60대 커뮤니티 회원)입니다.
성격/스타일: ${persona.style}
말투: ${persona.patterns.join(', ')}

아래 참고 글들의 "주제와 감정"만 참고해서, 완전히 새로운 오리지널 글을 작성하세요.
- 절대 원본 문장을 그대로 가져오지 마세요
- 자연스러운 구어체, 맞춤법 살짝 틀려도 됨
- 본인의 경험담처럼 자연스럽게
- "시니어", "액티브 시니어" 같은 표현 절대 금지
- 정치/종교/혐오/광고 절대 금지
- 카테고리: 일상, 건강, 고민, 자녀, 기타 중 하나 선택`,
    messages: [{
      role: 'user',
      content: `"${topic}" 주제로 글을 써주세요.

${references ? `참고 글들:\n${references}` : ''}

응답 형식:
제목: (15~30자)
카테고리: (일상/건강/고민/자녀/기타)
본문: (150~400자, 문단 2~3개)`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const categoryMatch = text.match(/카테고리:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  if (!titleMatch || !bodyMatch) return null

  const validCategories = ['일상', '건강', '고민', '자녀', '기타']
  const category = categoryMatch?.[1]?.trim()

  return {
    personaId: persona.id,
    title: titleMatch[1].trim(),
    content: bodyMatch[1].trim(),
    boardType: persona.board,
    category: validCategories.includes(category ?? '') ? category : '일상',
    sourceTopic: topic,
    sourcePostIds: referencePosts.map(() => 'ref'),
  }
}

/** 큐레이션 글을 DB에 게시 */
async function publishCuratedContent(curated: CuratedContent): Promise<void> {
  const userId = await getBotUser(curated.personaId)

  await prisma.post.create({
    data: {
      title: curated.title,
      content: `<p>${curated.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
      boardType: curated.boardType as 'STORY' | 'HUMOR',
      category: curated.category ?? '일상',
      authorId: userId,
      source: 'BOT',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })
}

/** 메인 실행 */
async function main() {
  console.log('[ContentCurator] 시작 — 트렌드 기반 콘텐츠 큐레이션')
  const startTime = Date.now()

  // 1) 오늘의 트렌드 분석 결과 조회
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const trend = await prisma.cafeTrend.findUnique({
    where: { date_period: { date: today, period: 'daily' } },
  })

  if (!trend) {
    console.log('[ContentCurator] 오늘 트렌드 분석 없음 — 크롤링/분석 먼저 실행 필요')
    await disconnect()
    return
  }

  const hotTopics = trend.hotTopics as unknown as TrendAnalysis['hotTopics']
  if (!hotTopics || hotTopics.length === 0) {
    console.log('[ContentCurator] 핫토픽 없음 — 스킵')
    await disconnect()
    return
  }

  // 2) UGC 비율 체크 (시드봇과 동일한 안전장치)
  const [totalPosts, userPosts] = await Promise.all([
    prisma.post.count({ where: { status: 'PUBLISHED' } }),
    prisma.post.count({ where: { source: 'USER', status: 'PUBLISHED' } }),
  ])
  const ugcRatio = totalPosts > 0 ? userPosts / totalPosts : 0
  if (ugcRatio >= 0.7) {
    console.log(`[ContentCurator] UGC ${(ugcRatio * 100).toFixed(0)}% — 자동 중단`)
    await disconnect()
    return
  }

  // 3) 상위 3개 핫토픽으로 글 생성
  const maxPosts = ugcRatio >= 0.5 ? 1 : 3
  let publishedCount = 0

  for (const topic of hotTopics.slice(0, maxPosts)) {
    const persona = matchPersona(topic.topic)
    const refs = await getReferencePosts(topic.topic, 3)

    console.log(`[ContentCurator] "${topic.topic}" → ${persona.nickname} (참고글 ${refs.length}개)`)

    const curated = await generateCuratedPost(persona, topic.topic, refs)
    if (curated) {
      await publishCuratedContent(curated)
      publishedCount++
      console.log(`[ContentCurator] 게시: "${curated.title}" by ${persona.nickname}`)
    }
  }

  const durationMs = Date.now() - startTime

  // BotLog
  await prisma.botLog.create({
    data: {
      botType: 'SEED',
      action: 'CONTENT_CURATION',
      status: publishedCount > 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({
        topicsUsed: hotTopics.slice(0, maxPosts).map(t => t.topic),
        published: publishedCount,
        ugcRatio,
      }),
      itemCount: publishedCount,
      executionTimeMs: durationMs,
    },
  })

  await notifySlack({
    level: 'info',
    agent: 'CONTENT_CURATOR',
    title: '트렌드 기반 콘텐츠 게시',
    body: `핫토픽 ${hotTopics.length}개 중 ${publishedCount}개 글 게시\nUGC 비율: ${(ugcRatio * 100).toFixed(0)}%`,
  })

  console.log(`[ContentCurator] 완료 — ${publishedCount}개 게시, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[ContentCurator] 치명적 오류:', err)
  await disconnect()
  process.exit(1)
})
