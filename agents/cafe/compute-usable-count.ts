// 공통 helper — usable 댓글 수 계산 기준 통일 (content-curator · popular-curator · crawler · psych-analyzer)

export function removeEmoji(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const USABLE_AI_REJECT_RE = /글 내용을|내용을 보여|볼 수가 없|상황을 모르|글의 내용을|어떤 상황인지|댓글을 작성할 수 없|내용 올려/

export function computeUsableCount(topComments: unknown): number {
  if (!Array.isArray(topComments)) return 0
  const seen = new Set<string>()
  let n = 0
  for (const item of topComments) {
    const raw = (item as { content?: string })?.content ?? ''
    const cleaned = removeEmoji(raw)
    if (cleaned.length < 10 || USABLE_AI_REJECT_RE.test(cleaned) || seen.has(cleaned)) continue
    seen.add(cleaned)
    n++
  }
  return n
}
