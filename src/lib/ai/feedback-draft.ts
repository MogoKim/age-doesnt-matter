import Anthropic from '@anthropic-ai/sdk'

/**
 * 의견수렴형(FEEDBACK) 이벤트 — **본문(안내글)** AI 초안 (light-only, vote-post-draft와 동일 하드가드).
 * - 어드민 버튼 클릭 1회 = Claude API 호출 정확히 1회.
 * - CLAUDE_MODEL_LIGHT(haiku 계열)만 허용 — env 없거나 light가 아니면 호출 거부.
 * - 실패 시 에러 문자열만 반환 — 직접 입력/템플릿 유지는 호출부가 담당(이벤트 생성과 무관).
 * - AI는 초안만 채운다. 자동 발행 없음.
 */
export type FeedbackDraftResult = { ok: true; body: string } | { ok: false; error: string }

const BODY_SCHEMA = {
  type: 'object',
  properties: { body: { type: 'string' } },
  required: ['body'],
  additionalProperties: false,
} as const

export async function generateFeedbackDraft(input: {
  title: string
  description?: string
}): Promise<FeedbackDraftResult> {
  const model = process.env.CLAUDE_MODEL_LIGHT
  if (!model) return { ok: false, error: 'AI 초안 생성 실패 — 직접 입력해 주세요 (CLAUDE_MODEL_LIGHT 없음)' }
  if (!model.includes('haiku')) return { ok: false, error: `AI 초안 생성 실패 — CLAUDE_MODEL_LIGHT(${model})가 light 모델이 아닙니다` }
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'AI 초안 생성 실패 — 직접 입력해 주세요 (ANTHROPIC_API_KEY 없음)' }

  const desc = input.description?.trim() ? `\n안내문: "${input.description.trim()}"` : ''

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model,
      max_tokens: 600,
      output_config: {
        format: { type: 'json_schema', schema: BODY_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `40~60대 한국 여성 커뮤니티 운영자가 회원들에게 **의견을 부탁하는 안내 본문**을 써줘.

의견수렴 제목: "${input.title}"${desc}

규칙:
- 투표가 아니라 자유 의견을 편하게 남기도록 부탁하는 톤.
- 3~5줄. 각 줄은 <p>...</p> 한 문단.
- 왜 의견을 구하는지 → 어떤 이야기든 괜찮다는 안심 → "편하게 남겨주세요 / 다 읽고 반영할게요"류 마무리.
- 따뜻한 존댓말·구어체. "시니어" 단어 금지. 과한 이모지 금지.
- 제목을 본문에서 그대로 반복하지 말 것.
- body 필드에 <p>문단</p>들을 이어붙인 HTML 문자열로 반환.`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return { ok: false, error: 'AI 초안 생성 실패 — 응답이 비어 있습니다' }
    const parsed = JSON.parse(textBlock.text) as { body: string }
    if (!parsed.body || typeof parsed.body !== 'string') return { ok: false, error: 'AI 초안 생성 실패 — 형식 오류' }
    return { ok: true, body: parsed.body }
  } catch (e) {
    console.error('[feedback-draft] AI 본문 초안 실패:', e)
    const msg =
      e instanceof Anthropic.RateLimitError
        ? '호출 한도 초과 — 잠시 후 다시 시도해 주세요'
        : 'AI 초안 생성 실패 — 직접 입력해 주세요'
    return { ok: false, error: msg }
  }
}
