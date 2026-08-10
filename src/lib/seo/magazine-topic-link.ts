export type MagazineTopicHubId = 'menopause' | 'second-act'

export interface MagazineTopicHubLink {
  kind: 'topic-hub'
  id: MagazineTopicHubId
  href: string
  label: string
  badge: string
}

interface MagazineTopicInput {
  title: string
  seoTitle?: string | null
  preview?: string | null
  seoDescription?: string | null
  category?: string | null
}

const TOPIC_LINKS: Record<MagazineTopicHubId, MagazineTopicHubLink> = {
  menopause: {
    kind: 'topic-hub',
    id: 'menopause',
    href: '/topic/menopause',
    label: '갱년기 관련 글 더 보기',
    badge: '주제 모아보기',
  },
  'second-act': {
    kind: 'topic-hub',
    id: 'second-act',
    href: '/topic/second-act',
    label: '인생 2막과 일 이야기 더 보기',
    badge: '주제 모아보기',
  },
}

const MENOPAUSE_TITLE_KEYWORDS = [
  '갱년기', '폐경', '완경', '호르몬', '안면홍조', '상열', '식은땀', '불면', '수면',
  '관절', '골다공증', '여성호르몬', '소변 냄새', '질건조', '몸의 변화', '몸 신호',
] as const

const MENOPAUSE_BODY_KEYWORDS = [
  '생리불순', '생리 불순', '열감', '화끈', '새벽에 깨', '잠을 못', '잠이 안',
  '땀이 나', '짜증', '감정 기복', '호르몬 치료',
] as const

const SECOND_ACT_TITLE_KEYWORDS = [
  '재취업', '일자리', '구직', '이력서', '면접', '자격증', '쿠팡', '알바', '아르바이트',
  '퇴직', '은퇴', '퇴직금', '연금', '국민연금', '생활비', '노후', '건강보험', '건보료',
  'IRP', '연금저축', 'ISA', '요양보호사', '간병', '돌봄', '부업', '인생 2막', '인생2막',
] as const

const SECOND_ACT_BODY_KEYWORDS = [
  '다시 일', '일을 시작', '직장가입자', '지역가입자', '현금흐름', '은퇴 후',
  '퇴직 후', '50대 취업', '60대 취업', '노후 준비',
] as const

const CATEGORY_HINTS: Record<MagazineTopicHubId, readonly string[]> = {
  menopause: ['건강'],
  'second-act': ['은퇴준비', '일자리', '재테크'],
}

function includesAny(text: string, keywords: readonly string[]): number {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0)
}

function scoreTopic(input: MagazineTopicInput, topic: MagazineTopicHubId): number {
  const titleText = `${input.title} ${input.seoTitle ?? ''}`.toLowerCase()
  const bodyText = `${input.preview ?? ''} ${input.seoDescription ?? ''}`.toLowerCase()
  const category = input.category ?? ''

  if (topic === 'menopause') {
    return includesAny(titleText, MENOPAUSE_TITLE_KEYWORDS) * 4
      + includesAny(bodyText, MENOPAUSE_BODY_KEYWORDS) * 2
      + (CATEGORY_HINTS.menopause.includes(category) ? 1 : 0)
  }

  return includesAny(titleText, SECOND_ACT_TITLE_KEYWORDS) * 4
    + includesAny(bodyText, SECOND_ACT_BODY_KEYWORDS) * 2
    + (CATEGORY_HINTS['second-act'].includes(category) ? 1 : 0)
}

export function resolveMagazineTopicHubLink(input: MagazineTopicInput): MagazineTopicHubLink | null {
  const menopauseScore = scoreTopic(input, 'menopause')
  const secondActScore = scoreTopic(input, 'second-act')
  const bestScore = Math.max(menopauseScore, secondActScore)

  if (bestScore < 4) return null
  return menopauseScore >= secondActScore ? TOPIC_LINKS.menopause : TOPIC_LINKS['second-act']
}

export function isMagazineTopicHubLink(item: unknown): item is MagazineTopicHubLink {
  return typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'topic-hub'
}

export function appendTopicHubLinkToRelated<T>(
  relatedPosts: readonly T[],
  topicHubLink: MagazineTopicHubLink | null,
  limit = 5,
): Array<T | MagazineTopicHubLink> {
  if (limit <= 0) return []
  if (!topicHubLink) return relatedPosts.slice(0, limit)
  return [...relatedPosts.slice(0, Math.max(0, limit - 1)), topicHubLink]
}
