import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { createApprovalRequest } from '../core/approval-helper.js'

/**
 * CMO Knowledge Responder — 네이버 지식iN 답변 초안 생성 에이전트
 *
 * 흐름:
 * 1. 타겟 키워드에서 2-3개 랜덤 선택
 * 2. 키워드 + 커뮤니티 트렌드 기반 Q&A 초안 생성
 * 3. ChannelDraft + AdminQueue 저장 (창업자 승인 대기)
 * 4. Slack 알림 + BotLog
 *
 * 주의: 실제 네이버 스크래핑은 하지 않음 (Playwright 미사용)
 * AI가 키워드 기반으로 현실적인 질문 + 도움되는 답변을 생성
 */

const MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const client = new Anthropic()
const TARGET_KEYWORDS = [
  '50대 일자리',
  '60대 취미',
  '은퇴 후 할일',
  '50대 커뮤니티',
  '60대 건강',
  '5060 모임',
  '인생 2막',
  '은퇴 후 생활',
]

interface AnswerDraft {
  keyword: string
  question: string
  answer: string
  searchUrl: string
}

// ─── 랜덤 키워드 선택 ───

function pickRandomKeywords(count: number): string[] {
  const shuffled = [...TARGET_KEYWORDS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

// ─── 트렌드 컨텍스트 수집 ───

async function fetchTrendContext(): Promise<string> {
  const recentTrends = await prisma.cafeTrend.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { keywords: true, cafeSummary: true },
  })

  if (recentTrends.length === 0) return '(트렌드 데이터 없음)'

  return recentTrends
    .map(t => {
      const kws = Array.isArray(t.keywords) ? (t.keywords as Array<{ word: string }>).slice(0, 3).map(k => k.word).join(', ') : ''
      return `- ${kws}: ${t.cafeSummary ?? ''}`
    })
    .join('\n')
}

// ─── 답변 초안 생성 ───

async function generateAnswerDrafts(
  keywords: string[],
  trendContext: string,
): Promise<AnswerDraft[]> {
  const response = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 4096,
    system: `당신은 50대 60대를 위한 커뮤니티 "우리 나이가 어때서"(age-doesnt-matter.com)의 마케팅 전문가입니다.
네이버 지식iN에 올릴 답변 초안을 작성합니다.

절대 규칙:
- "시니어", "액티브 시니어" 절대 사용 금지. 대신 "우리 또래", "50대 60대", "인생 2막" 사용
- 답변은 반드시 진심으로 도움이 되는 내용이 먼저 (200-400자)
- 사이트 언급은 답변 끝에 자연스럽게, 개인 추천처럼: "참고로 '우리 나이가 어때서'라는 커뮤니티에서도 이런 정보 공유가 활발하더라고요 (age-doesnt-matter.com)"
- 절대 답변 처음에 사이트 홍보하지 말 것
- 구체적이고 실행 가능한 조언 포함
- 한국어 구어체, 딱딱하지 않게`,
    messages: [
      {
        role: 'user',
        content: `아래 키워드별로 네이버 지식iN에 올릴 답변 초안을 만들어주세요.
각 키워드당 1개의 현실적인 질문 + 도움되는 답변을 생성해주세요.

[타겟 키워드]
${keywords.map(k => `- ${k} (검색 URL: https://kin.naver.com/search/list.naver?query=${encodeURIComponent(k)})`).join('\n')}

[최근 커뮤니티 트렌드 — 답변에 자연스럽게 활용]
${trendContext}

응답 형식 (JSON):
{
  "answers": [
    {
      "keyword": "키워드",
      "question": "지식iN에 올라올 법한 현실적 질문",
      "answer": "도움되는 답변 (200-400자, 끝에 자연스러운 사이트 언급)"
    }
  ]
}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()

  try {
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}') as {
      answers: Array<{ keyword: string; question: string; answer: string }>
    }
    return (parsed.answers ?? []).map(a => ({
      keyword: a.keyword,
      question: a.question,
      answer: a.answer,
      searchUrl: `https://kin.naver.com/search/list.naver?query=${encodeURIComponent(a.keyword)}`,
    }))
  } catch (err) {
    console.error('[KnowledgeResponder] JSON 파싱 실패:', err instanceof Error ? err.message : err)
    return []
  }
}

// ─── 메인 실행 ───

async function main() {
  console.log('[KnowledgeResponder] 시작')
  const startTime = Date.now()

  // 1. 키워드 2-3개 랜덤 선택
  const selectedKeywords = pickRandomKeywords(3)
  console.log(`[KnowledgeResponder] 선택 키워드: ${selectedKeywords.join(', ')}`)

  // 2. 트렌드 컨텍스트 수집
  const trendContext = await fetchTrendContext()

  // 3. AI 답변 초안 생성
  const drafts = await generateAnswerDrafts(selectedKeywords, trendContext)
  console.log(`[KnowledgeResponder] ${drafts.length}개 답변 초안 생성`)

  if (drafts.length === 0) {
    console.log('[KnowledgeResponder] 답변 초안 없음 — 종료')
    await prisma.botLog.create({
      data: {
        botType: 'CMO',
        action: 'KNOWLEDGE_RESPOND',
        status: 'PARTIAL',
        details: JSON.stringify({ keywords: selectedKeywords, reason: 'AI 응답 파싱 실패' }),
        itemCount: 0,
        executionTimeMs: Date.now() - startTime,
      },
    })
    await disconnect()
    return
  }

  // 4. ChannelDraft 저장
  const draftIds: string[] = []

  for (const draft of drafts) {
    const saved = await prisma.channelDraft.create({
      data: {
        channel: 'NAVER_KNOWLEDGE',
        targetName: `지식iN — ${draft.keyword}`,
        draftText: `[질문] ${draft.question}\n\n[답변]\n${draft.answer}`,
        linkUrl: draft.searchUrl,
        imageUrls: [],
        status: 'PENDING',
      },
    })
    draftIds.push(saved.id)
  }

  // 5. AdminQueue 등록 + Slack 승인 알림
  await createApprovalRequest({
    type: 'CONTENT_PUBLISH',
    title: `[지식iN] 답변 초안 ${drafts.length}건 — 키워드: ${selectedKeywords.join(', ')}`,
    payload: JSON.stringify({ draftIds, keywords: selectedKeywords }),
    requestedBy: 'CMO_KNOWLEDGE',
    status: 'PENDING',
  })

  // 6. Slack 알림
  const previewLines: string[] = [
    `*키워드*: ${selectedKeywords.join(', ')}`,
    '',
  ]
  for (const draft of drafts) {
    previewLines.push(`*Q. ${draft.question.slice(0, 50)}...*`)
    previewLines.push(`> ${draft.answer.slice(0, 100)}...`)
    previewLines.push(`🔗 ${draft.searchUrl}`)
    previewLines.push('')
  }

  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: `지식iN 답변 초안 ${drafts.length}건 생성 완료 — 승인 대기`,
    body: previewLines.join('\n'),
  })

  // 7. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'KNOWLEDGE_RESPOND',
      status: 'SUCCESS',
      details: JSON.stringify({
        keywords: selectedKeywords,
        draftsGenerated: drafts.length,
        draftIds,
      }),
      itemCount: drafts.length,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[KnowledgeResponder] 완료 — ${drafts.length}건 초안, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[KnowledgeResponder] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '지식iN 답변 생성 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
