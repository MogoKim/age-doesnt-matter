// popular-seo.ts — POPULAR_CURATOR 전용 SEO 메타 생성 (추출적 · AI 미사용)
//
// 인기글 본문(content)은 절대 건드리지 않는다. 이 모듈은 오직 검색 노출에 영향을 주는
// title / seoTitle / seoDescription / summary 를 원문 title·content의 "단어만" 사용해 보수적으로 개선한다.
// 새 사실·숫자·제품명·지역명·인물명을 추가하지 않도록 추출적(substring/어절)으로만 생성하고,
// 숫자/영문 토큰은 원문 포함 여부를 명시 검증한다(withinSource). 실패·정책위반 시 원문 title + 기존 summary로 fallback.
//
// 호출부(popular-curator.ts)는 반환된 meta의 title/seoTitle/seoDescription/summary만 Post.create에 사용한다.
// topComments · commentWaveQueue · cafePost 업데이트와는 무관하다.

const SEO_TITLE_MAX = 55
const SEO_DESC_MAX = 120
const SEO_DESC_MIN = 20
const SUMMARY_MAX = 150

export interface PopularSeoMeta {
  title: string                    // 화면에 보이는 제목 (보수적 다듬기)
  seoTitle: string | null          // 검색용 제목 (55자 이내, 원문 단어만)
  seoDescription: string | null    // 원문 본문 추출 요약 (120자 이내). null이면 미제공(구글 본문 스니펫 자동생성)
  summary: string                  // 목록/카드 요약 (원문 내용만)
  transformed: boolean             // true=SEO 메타 생성 적용, false=fallback
}

/** max 이내에서 마지막 공백 경계로 자름(어절 보존). 적당한 공백이 없으면 하드컷. */
function cutAtWord(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  const head = t.slice(0, max)
  const sp = head.lastIndexOf(' ')
  return (sp >= max * 0.6 ? head.slice(0, sp) : head).trim()
}

/** 화면 제목 보수적 다듬기 — 연속공백 압축 + 양끝 잉여 구두점/따옴표 정리. 의미는 바꾸지 않는다. */
function tidyTitle(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’·・\-–—]+|[\s"'“”‘’·・]+$/g, '')
    .trim()
}

/** 후보 문자열의 숫자/영문 토큰이 모두 원문에 존재하는지 — 새 사실/숫자/제품명 유입 차단 */
function withinSource(candidate: string, source: string): boolean {
  const tokens = candidate.match(/[A-Za-z]{2,}|\d+/g) ?? []
  return tokens.every(tok => source.includes(tok))
}

/** 본문에서 문장 단위 추출 요약(추출적) — 첫 유의미 문장부터 max자 이내로 누적. 제목 복붙은 회피. */
function extractDescription(rawContent: string, title: string, max: number): string {
  const flat = rawContent.replace(/\s+/g, ' ').trim()
  if (!flat) return ''
  const sentences = flat
    .split(/(?<=[.!?。…])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 4)
  const titleKey = title.replace(/\s+/g, '').slice(0, 20)
  let out = ''
  for (const s of sentences) {
    // 제목을 그대로 반복하는 첫 문장은 건너뜀(메타 description=제목 복붙 방지)
    if (out === '' && titleKey && s.replace(/\s+/g, '').startsWith(titleKey)) continue
    const next = out ? `${out} ${s}` : s
    if (next.length > max) { if (!out) out = cutAtWord(s, max); break }
    out = next
    if (out.length >= max * 0.7) break
  }
  if (!out) out = cutAtWord(flat, max)
  return out.trim()
}

/**
 * 원문 title / content 만으로 SEO 메타를 생성한다.
 * @param input.title      이미 replaceCafeReferences+stripMarkdown 된 정제 제목
 * @param input.rawContent 이미 replaceCafeReferences+stripMarkdown 된 원문 본문(plain text)
 * @param input.summary    기존 toCuratedSummary 결과(fallback 및 기본 summary)
 */
export function buildPopularSeoMeta(input: {
  title: string
  rawContent: string
  summary: string
}): PopularSeoMeta {
  const fallbackTitle = (input.title ?? '').trim()
  const fallback: PopularSeoMeta = {
    title: fallbackTitle,
    seoTitle: null,
    seoDescription: null,
    summary: (input.summary ?? '').trim(),
    transformed: false,
  }
  try {
    const title = tidyTitle(input.title ?? '')
    if (!title || !(input.rawContent ?? '').trim()) return fallback
    const source = `${input.title ?? ''} ${input.rawContent ?? ''}`

    // seoTitle: title 기반, 55자 이내. title 자체가 원문이라 새 단어 유입 없음.
    const seoTitle = cutAtWord(title, SEO_TITLE_MAX)
    if (!seoTitle || !withinSource(seoTitle, source)) return fallback

    // seoDescription: 본문 문장 추출, 120자 이내. 부실하거나 정책위반이면 null(미제공 — 안전).
    let seoDescription: string | null = extractDescription(input.rawContent, title, SEO_DESC_MAX)
    if (seoDescription.length < SEO_DESC_MIN || !withinSource(seoDescription, source)) {
      seoDescription = null
    }

    // summary: 기존 summary를 자연스러운 길이로 마무리(원문만). 없으면 seoDescription/title로 보강.
    const summaryBase = (input.summary ?? '').trim() || seoDescription || title
    const summary = cutAtWord(summaryBase, SUMMARY_MAX) || fallbackTitle

    return { title, seoTitle, seoDescription, summary, transformed: true }
  } catch {
    return fallback
  }
}
