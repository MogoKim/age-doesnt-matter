/**
 * 페르소나 드라이런 테스트
 * DB 저장 없이 특정 페르소나의 글 생성 결과를 콘솔에 출력
 *
 * 실행: cd agents && npx tsx scripts/test-persona.ts BC
 *       cd agents && npx tsx scripts/test-persona.ts BD
 *       cd agents && npx tsx scripts/test-persona.ts A (기존 강화 확인)
 */

import Anthropic from '@anthropic-ai/sdk'
import { getPersona } from '../seed/persona-data.js'
import { DESIRE_PERSONA_MAP } from '../seed/generator.js'
import { prisma, disconnect } from '../core/db.js'

const personaId = process.argv[2] ?? 'BC'
const persona = getPersona(personaId)

// 욕망 카테고리 찾기
let personaDesire = ''
for (const [desire, { personas }] of Object.entries(DESIRE_PERSONA_MAP)) {
  if (personas.includes(personaId)) { personaDesire = desire; break }
}

// 최신 트렌드 조회
const trend = await prisma.cafeTrend.findFirst({
  orderBy: { createdAt: 'desc' },
  select: {
    dominantDesire: true, dominantEmotion: true, urgentTopics: true,
    cafeSummary: true, hotTopics: true, keywords: true,
    desireMap: true, emotionDistribution: true, createdAt: true,
  },
})
await disconnect()

console.log('\n' + '═'.repeat(60))
console.log(`🎭 페르소나: ${personaId} — ${persona.nickname} (${persona.age}세 ${persona.gender})`)
console.log(`📌 욕망 카테고리: ${personaDesire || '미매핑'}`)
console.log(`🎲 게시판: ${persona.board}`)
console.log('═'.repeat(60))

// 트렌드 데이터 확인
if (!trend) {
  console.log('⚠️  CafeTrend 데이터 없음 — 크롤링이 아직 실행되지 않았거나 DB 연결 문제')
} else {
  console.log(`\n📊 오늘의 트렌드 (${trend.createdAt.toLocaleString('ko-KR')})`)
  console.log(`  - dominantDesire: ${trend.dominantDesire}`)
  console.log(`  - dominantEmotion: ${trend.dominantEmotion}`)
  const hotTopics = Array.isArray(trend.hotTopics)
    ? (trend.hotTopics as Array<{ topic: string }>).slice(0, 5).map(t => t.topic)
    : []
  const keywords = Array.isArray(trend.keywords)
    ? (trend.keywords as Array<{ word: string }>).slice(0, 8).map(k => k.word)
    : []
  console.log(`  - hotTopics: ${hotTopics.join(', ') || '없음'}`)
  console.log(`  - keywords: ${keywords.join(', ') || '없음'}`)
  const desireMap = (trend.desireMap ?? {}) as Record<string, number>
  console.log(`  - desireMap[${personaDesire}]: ${desireMap[personaDesire] ?? 'N/A'}%`)
}

// 실제 글 생성
console.log('\n📝 글 생성 중...\n')

const client = new Anthropic()
const model = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

const topicHint = personaDesire ? DESIRE_PERSONA_MAP[personaDesire]?.topicHint : persona.topics[0]

const prompt = `당신은 ${persona.nickname}입니다.
나이: ${persona.age}세 ${persona.gender}
성격: ${persona.personality}
게시판: ${persona.board}
말투 습관: ${persona.speech_patterns.join(', ')}
글쓰기 버릇:
${persona.quirks.map(q => `- ${q}`).join('\n')}
절대 하지 않는 것: ${persona.never.join(', ')}

참고 예시:
${persona.examples.join('\n')}

---
오늘 주제 힌트: ${topicHint}
트렌드: ${trend?.dominantDesire ?? '없음'} / ${trend?.dominantEmotion ?? '없음'}

위 페르소나 그대로 커뮤니티에 짧은 글 1개 써주세요. (3-6줄, 한국어)
제목 없이 본문만.`

const response = await client.messages.create({
  model,
  max_tokens: 400,
  messages: [{ role: 'user', content: prompt }],
})

const text = response.content[0].type === 'text' ? response.content[0].text : ''
console.log('─'.repeat(60))
console.log(text)
console.log('─'.repeat(60))
console.log(`\n✅ 생성 완료 (토큰: ${response.usage.input_tokens}in / ${response.usage.output_tokens}out)`)
console.log('ℹ️  이 결과는 DB에 저장되지 않습니다.')
