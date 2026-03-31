/**
 * 전사적 이미지 프롬프트 빌더 — 공유 유틸리티
 * 규칙 문서: agents/core/image-generation-rules.md
 *
 * 모든 에이전트(카드뉴스, 매거진 등)가 이미지 생성 시 사용하는
 * 인물 묘사, 스타일 프리픽스, 네거티브 프롬프트를 통합 관리합니다.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageStyle =
  | 'warm-lifestyle'
  | 'clean-infographic'
  | 'cozy-community'
  | 'active-growth'

// ---------------------------------------------------------------------------
// Person Style Guide — 한국인 5060 인물 규칙
// ---------------------------------------------------------------------------

export const PERSON_STYLE_GUIDE = {
  femalePrompt:
    'elegant Korean woman in her early 50s, well-groomed, healthy and vibrant, '
    + 'natural dark hair with subtle highlights, confident smile, '
    + 'stylish casual outfit, warm natural lighting, '
    + 'similar vibe to a refined Korean actress in her 50s',

  malePrompt:
    'charismatic Korean man in his early 50s, well-maintained appearance, '
    + 'natural dark hair, warm genuine smile, '
    + 'smart casual style, confident posture, '
    + 'similar vibe to a distinguished Korean actor in his 50s',

  never: [
    'white hair', 'gray hair', 'wrinkled', 'elderly', 'senior citizen',
    'old person', 'frail', 'walking stick', 'cane', 'Western', 'Caucasian',
  ] as const,
} as const

// ---------------------------------------------------------------------------
// Style Prefixes — 통합 4종
// ---------------------------------------------------------------------------

export const STYLE_PREFIXES: Record<ImageStyle, string> = {
  'warm-lifestyle': '따뜻하고 밝은 톤의 일러스트레이션, 한국적 감성, 잡지 품질,',
  'clean-infographic': '깔끔하고 신뢰감 있는 인포그래픽 스타일, 미니멀,',
  'cozy-community': '포근하고 따뜻한 커뮤니티 분위기, 함께하는 장면,',
  'active-growth': '활기차고 에너지 넘치는, 도전과 성장의 분위기,',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PERSON_KEYWORDS = ['사람', '여성', '남성', '얼굴', '인물', '남자', '여자', '부부', '커플']
const NO_TEXT_DIRECTIVE = 'No text, no letters, no words, no numbers in the image.'

/** 프롬프트에 인물 관련 키워드가 포함되어 있는지 감지 */
export function containsPersonKeyword(prompt: string): boolean {
  return PERSON_KEYWORDS.some((kw) => prompt.includes(kw))
}

/** 네거티브 프롬프트 생성 (인물 이미지용) */
export function buildNegativePrompt(): string {
  return PERSON_STYLE_GUIDE.never.map((term) => `NOT ${term}`).join(', ')
}

/**
 * 최종 DALL-E 프롬프트를 조립합니다.
 *
 * 1. 스타일 프리픽스
 * 2. 인물 키워드 감지 시 → 인물 묘사 + 네거티브 프롬프트 자동 삽입
 * 3. 원본 프롬프트
 * 4. 텍스트 금지 디렉티브
 */
export function buildImagePrompt(prompt: string, style: ImageStyle): string {
  const parts: string[] = [STYLE_PREFIXES[style]]

  if (containsPersonKeyword(prompt)) {
    const personPrompt = prompt.length % 2 === 0
      ? PERSON_STYLE_GUIDE.femalePrompt
      : PERSON_STYLE_GUIDE.malePrompt
    parts.push(personPrompt)
    parts.push(buildNegativePrompt())
  }

  parts.push(prompt)
  parts.push(NO_TEXT_DIRECTIVE)

  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Magazine Style Mapping — 카테고리 → ImageStyle 변환
// ---------------------------------------------------------------------------

/** 매거진 카테고리를 통합 ImageStyle로 매핑 */
export function getMagazineImageStyle(category: string): ImageStyle {
  const map: Record<string, ImageStyle> = {
    '건강': 'clean-infographic',
    '재테크': 'clean-infographic',
    '일자리': 'clean-infographic',
    '유머': 'active-growth',
    '문화': 'active-growth',
    '여행': 'warm-lifestyle',
    '요리': 'warm-lifestyle',
    '생활': 'warm-lifestyle',
    '간병': 'warm-lifestyle',
  }
  return map[category] ?? 'warm-lifestyle'
}
