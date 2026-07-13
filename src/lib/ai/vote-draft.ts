import Anthropic from '@anthropic-ai/sdk'

/**
 * 오늘의 투표 — 봇 댓글 초안 일괄 생성 (MVP 전용, light-only)
 *
 * 비용 가드 (절대 준수):
 * - 어드민 버튼 클릭 1회 = Claude API 호출 정확히 1회 (row별 개별 호출 금지 — batch 프롬프트)
 * - 모델은 CLAUDE_MODEL_LIGHT(haiku 계열)만 허용 — env 없거나 light가 아니면 호출 거부
 * - 기존 generateComment() 재사용 금지 (페르소나에 따라 heavy 라우팅 가능성)
 * - 실패 시 에러 문자열만 반환 — 직접 입력 등록은 이 함수와 무관하게 항상 동작
 */

export interface VoteDraftRow {
  personaName: string
  camp: 'A' | 'B'
}

export interface VoteDraftInput {
  question: string
  optionA: string
  optionB: string
  rows: VoteDraftRow[]
}

export type VoteDraftResult =
  | { ok: true; drafts: string[] }
  | { ok: false; error: string }

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    drafts: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['drafts'],
  additionalProperties: false,
} as const

export async function generateVoteDraftBatch(input: VoteDraftInput): Promise<VoteDraftResult> {
  const model = process.env.CLAUDE_MODEL_LIGHT
  // 하드 가드: light(haiku) 계열이 아니면 호출 자체를 거부 — Sonnet/Opus 경로 없음
  if (!model) {
    return { ok: false, error: 'CLAUDE_MODEL_LIGHT 환경변수가 없습니다 — 직접 입력으로 등록해 주세요' }
  }
  if (!model.includes('haiku')) {
    return { ok: false, error: `CLAUDE_MODEL_LIGHT(${model})가 light 모델이 아니라 호출을 차단했습니다` }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'ANTHROPIC_API_KEY가 없습니다 — 직접 입력으로 등록해 주세요' }
  }
  if (input.rows.length === 0 || input.rows.length > 5) {
    return { ok: false, error: '초안 요청은 1~5개 row만 가능합니다' }
  }

  const rowLines = input.rows
    .map((r, i) => {
      const campLabel = r.camp === 'A' ? input.optionA : input.optionB
      return `${i + 1}. 닉네임 "${r.personaName}" — ${campLabel}파 입장`
    })
    .join('\n')

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model,
      max_tokens: 800,
      output_config: {
        format: { type: 'json_schema', schema: DRAFT_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `40~60대 한국 여성 커뮤니티의 밸런스 투표 게시글에 달릴 댓글 초안을 써줘.

투표 질문: "${input.question}"
선택지: A=${input.optionA} / B=${input.optionB}

아래 각 인물이 자기 진영 입장에서 남길 댓글을 1~2문장씩, 순서대로 ${input.rows.length}개 작성해줘:
${rowLines}

규칙: 따뜻하고 유쾌한 존댓말 또는 자연스러운 구어체, 생활 경험담 느낌, 서로 문체가 겹치지 않게, 이모지는 있어도 되고 없어도 됨. "시니어"라는 단어 금지. drafts 배열에 순서대로 담아 반환.`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return { ok: false, error: 'AI 응답이 비어 있습니다 — 직접 입력으로 등록해 주세요' }
    }
    const parsed = JSON.parse(textBlock.text) as { drafts: string[] }
    if (!Array.isArray(parsed.drafts) || parsed.drafts.length === 0) {
      return { ok: false, error: 'AI 초안 형식이 올바르지 않습니다 — 직접 입력으로 등록해 주세요' }
    }
    return { ok: true, drafts: parsed.drafts.slice(0, input.rows.length) }
  } catch (e) {
    console.error('[vote-draft] AI 초안 생성 실패:', e)
    const msg =
      e instanceof Anthropic.RateLimitError
        ? '호출 한도 초과 — 잠시 후 다시 시도하거나 직접 입력해 주세요'
        : 'AI 초안 생성에 실패했습니다 — 직접 입력으로 등록해 주세요'
    return { ok: false, error: msg }
  }
}
