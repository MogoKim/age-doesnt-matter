export type MenopauseCategory =
  | '나만 이런가요'
  | '몸의 변화'
  | '완경·호르몬'
  | '마음의 변화'
  | '가족·관계'

export type MenopauseSignalLevel = 'strong' | 'medium' | 'weak' | 'none'

export interface MenopauseClassification {
  shouldRoute: boolean
  level: MenopauseSignalLevel
  category: MenopauseCategory
  matchedKeywords: string[]
  reason:
    | 'TITLE_STRONG'
    | 'CONTENT_ONLY_STRONG'
    | 'WEAK_ONLY'
    | 'NO_SIGNAL'
}

const DEFAULT_CATEGORY: MenopauseCategory = '나만 이런가요'

const CATEGORY_KEYWORDS: Record<MenopauseCategory, readonly string[]> = {
  '완경·호르몬': ['폐경', '완경', '호르몬', '호르몬제', '에스트로겐', '생리불순', '생리가'],
  '몸의 변화': ['안면홍조', '홍조', '열감', '식은땀', '불면', '잠', '수면', '관절', '골다공', '체중', '뱃살', '피로', '통증', '방광염', '질건조'],
  '마음의 변화': ['우울', '예민', '짜증', '불안', '눈물', '화가', '감정기복', '외로'],
  '가족·관계': ['남편', '아내', '가족', '자녀', '딸', '아들', '며느리', '시댁', '친정', '직장', '관계'],
  '나만 이런가요': ['갱년기'],
}

// 자동 라우팅은 제목 강신호만 허용한다. 본문만 매치되면 dry-run 관찰 대상으로 남긴다.
const TITLE_STRONG_KEYWORDS = [
  '갱년기',
  '폐경',
  '완경',
  '호르몬',
  '호르몬제',
  '안면홍조',
  '열감',
  '식은땀',
  '생리불순',
]

const WEAK_KEYWORDS = [
  '우울',
  '불안',
  '외로',
  '잠',
  '불면',
  '피곤',
  '피로',
  '관절',
  '체중',
  '뱃살',
  '짜증',
  '예민',
  '눈물',
]

function keywordMatches(text: string, keyword: string): boolean {
  if (keyword !== '열감') return text.includes(keyword)

  let index = text.indexOf(keyword)
  while (index !== -1) {
    const previousChar = index > 0 ? text[index - 1] : ''
    if (previousChar !== '작') return true
    index = text.indexOf(keyword, index + keyword.length)
  }

  return false
}

function collectMatches(text: string, keywords: readonly string[]): string[] {
  return keywords.filter(keyword => keywordMatches(text, keyword))
}

function inferCategory(text: string): MenopauseCategory {
  const ranked: MenopauseCategory[] = ['완경·호르몬', '몸의 변화', '마음의 변화', '가족·관계', '나만 이런가요']
  let best: MenopauseCategory = DEFAULT_CATEGORY
  let bestScore = 0

  for (const category of ranked) {
    const score = collectMatches(text, CATEGORY_KEYWORDS[category]).length
    if (score > bestScore) {
      best = category
      bestScore = score
    }
  }

  return best
}

export function classifyMenopauseCandidate(input: {
  title: string | null | undefined
  content?: string | null | undefined
}): MenopauseClassification {
  const title = input.title?.trim() ?? ''
  const content = input.content?.trim() ?? ''
  const titleMatches = collectMatches(title, TITLE_STRONG_KEYWORDS)

  if (titleMatches.length > 0) {
    const combined = `${title} ${content}`
    return {
      shouldRoute: true,
      level: 'strong',
      category: inferCategory(combined),
      matchedKeywords: titleMatches,
      reason: 'TITLE_STRONG',
    }
  }

  const contentMatches = collectMatches(content, TITLE_STRONG_KEYWORDS)
  if (contentMatches.length > 0) {
    return {
      shouldRoute: false,
      level: 'medium',
      category: inferCategory(`${title} ${content}`),
      matchedKeywords: contentMatches,
      reason: 'CONTENT_ONLY_STRONG',
    }
  }

  const weakMatches = collectMatches(`${title} ${content}`, WEAK_KEYWORDS)
  if (weakMatches.length > 0) {
    return {
      shouldRoute: false,
      level: 'weak',
      category: DEFAULT_CATEGORY,
      matchedKeywords: weakMatches,
      reason: 'WEAK_ONLY',
    }
  }

  return {
    shouldRoute: false,
    level: 'none',
    category: DEFAULT_CATEGORY,
    matchedKeywords: [],
    reason: 'NO_SIGNAL',
  }
}
