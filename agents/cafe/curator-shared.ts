/** popular-curator.ts 전용 공유 상수 + 순수 함수
 * content-curator.ts는 module-level auto-run(main().catch)이 있어 import 불가 (BUG-3).
 * 이 파일에는 side-effect 없는 순수 함수와 상수만 포함.
 */

/** 네이버 카페 텍스트의 lone surrogate 문자 제거 */
export function sanitizeForApi(text: string): string {
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/** 원문 출처 정규화 — 구현은 normalize-source-references.ts (순수 전용 모듈), 여기서 re-export */
export { normalizeSourceReferences, type NormalizedSourceResult } from './normalize-source-references.js'
import { normalizeSourceReferences as _norm } from './normalize-source-references.js'
import { classifyMenopauseCandidate } from '../core/menopause-classifier.js'

/** @deprecated 호환 유지용 — 내부적으로 normalizeSourceReferences를 사용 (기존 호출부 자동 커버) */
export function replaceCafeReferences(text: string): string {
  return _norm(text).text
}

/** 카페 게시판 안내/예절 보일러플레이트 — 본문 "맨 앞" 첫 줄만 제거 (원문 CafePost는 미수정, 발행 본문만 정화).
 *
 * 제거 대상: 게시판 상단 예절 안내 문구가 본문 첫 문단으로 딸려오는 케이스. 좁게 시작한다.
 *  - "서로 배려하는 마음으로 예쁜 글 부탁드려요" (앞뒤 하트/이모지/공백/제로폭 허용, 뒤따르는 빈 줄까지 제거)
 * 보존: 본문 중간에 같은 표현이 있어도 제거하지 않는다(^ 앵커). 문구 뒤에 실제 본문이 같은 줄에 이어지면 제거하지 않는다.
 *       "배려", "예쁜 글" 같은 단어 단독으로는 매칭하지 않는다(정확 구절만).
 * 주의: 원문 전체가 안내문뿐이면 빈 문자열이 될 수 있다 → 호출부 empty guard(!content)가 동작해야 한다.
 */
// 하트/이모지/기호/공백/제로폭 — 구절 앞뒤 장식 허용 문자군 (구절 앵커가 있어 broad해도 안전)
const BOILERPLATE_DECOR = '\\s\\u200B-\\u200D\\uFEFF\\uFE0F\\u2190-\\u21FF\\u2300-\\u27BF\\u2B00-\\u2BFF\\u{1F000}-\\u{1FAFF}'
const CAFE_BOILERPLATE_LEADING_PATTERNS: RegExp[] = [
  new RegExp(
    `^[${BOILERPLATE_DECOR}]*서로\\s*배려하는\\s*마음으로\\s*예쁜\\s*글\\s*부탁드려요[${BOILERPLATE_DECOR}]*(?:\\n+|$)`,
    'u',
  ),
]

export function stripCafeBoilerplate(text: string): string {
  if (!text) return text
  let out = text
  // 첫 줄에 안내 문구가 여러 줄 쌓인 경우까지(최대 5회) 앞에서만 제거
  for (let i = 0; i < 5; i++) {
    let changed = false
    for (const re of CAFE_BOILERPLATE_LEADING_PATTERNS) {
      const next = out.replace(re, '')
      if (next !== out) { out = next; changed = true }
    }
    if (!changed) break
  }
  return out.trimStart()
}

/** 평문 텍스트 → 큐레이션 발행용 HTML 변환
 * 이미지가 있던 자리의 과도한 빈 줄/빈 단락을 제거하고 단락 구조를 정규화.
 */
export function toCuratedHtmlContent(text: string): string {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)

  return paragraphs
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** 큐레이션 summary 생성 — 과도한 공백을 단일 스페이스로 압축 후 슬라이스 */
export function toCuratedSummary(text: string, maxLen = 150): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLen)
}

/** AI 응답에서 마크다운 문법 제거 + 잔여 HTML 블록 보조 제거 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/#{1,6}\s?/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^[-*+]\s/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\*+\s*/gm, '')
    .replace(/\*+/g, '')
    .trim()
}

/**
 * 발행용 제목 정화 — generateCuratedPost와 후보 필터가 **같은 결과**를 쓰도록 단일화한 헬퍼.
 * 비면 발행할 수 없다(빈 제목 발행 방지).
 */
export function cleanCuratedTitle(rawTitle: string): string {
  return replaceCafeReferences(stripMarkdown((rawTitle ?? '').trim()))
}

/**
 * 발행용 본문 정화 — stripMarkdown → replaceCafeReferences → stripCafeBoilerplate.
 *
 * 카페 안내문만 있던 글은 여기서 ''가 된다. 실제 사고(2026-07-28): 본문이
 * "💗서로 배려하는 마음으로 예쁜 글 부탁드려요💗" 27자뿐인 원문 1건이 정화 후 0자가 되어
 * 93회 연속 생성 실패를 만들었다. 댓글 54개·killerScore 73이라 앞선 게이트를 전부 통과했다.
 */
export function cleanCuratedContent(rawContent: string): string {
  return stripCafeBoilerplate(replaceCafeReferences(stripMarkdown((rawContent ?? '').trim())))
}

/**
 * 정화 후에도 제목·본문이 남는 글인지 — 후보 단계에서 "발행 불가 원문"을 미리 거른다.
 * 원문(CafePost)은 수정하지 않는다. 판정만 한다.
 */
export function hasPublishableBody(rawTitle: string, rawContent: string): boolean {
  return cleanCuratedTitle(rawTitle).length > 0 && cleanCuratedContent(rawContent).length > 0
}

/** KST 현재 날짜/요일/시간대 */
export function getKstContext(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const day = days[kst.getUTCDay()]
  const hour = kst.getUTCHours()
  const timeSlot = hour < 6 ? '새벽' : hour < 12 ? '오전' : hour < 18 ? '오후' : '저녁'
  return `[KST 현재] ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${day} ${timeSlot}\n글에서 날짜/요일/시간대를 언급할 때 반드시 위 기준으로 쓰세요.`
}

/**
 * curator 페르소나 정의는 agents/cafe/curator-personas.ts에 있고,
 * 소비 진입점은 agents/core/persona-registry.ts 하나다 (PR-7e에서 전환용 facade 제거).
 * 이 파일은 텍스트 유틸·보드 라우팅만 담당한다 — persona 심볼을 여기서 다시 내보내지 않는다.
 * (scripts/check-persona-ssot.ts가 재도입을 차단한다)
 */




export const DESIRE_TO_BOARD: Record<string, { boardType: 'STORY' | 'HUMOR' | 'LIFE2' | 'JOB'; category: string }> = {
  HEALTH:    { boardType: 'STORY', category: '건강' },
  BEAUTY:    { boardType: 'STORY', category: '건강' },
  FAMILY:    { boardType: 'STORY', category: '가족' },
  RELATION:  { boardType: 'STORY', category: '고민' },
  MEANING:   { boardType: 'STORY', category: '고민' },
  SPIRITUAL: { boardType: 'STORY', category: '고민' },
  HOBBY:     { boardType: 'STORY', category: '취미' },
  FOOD:      { boardType: 'STORY', category: '취미' },
  FASHION:   { boardType: 'STORY', category: '취미' },
  DIGITAL:   { boardType: 'STORY', category: '취미' },
  PET:       { boardType: 'STORY', category: '취미' },
  FREEDOM:   { boardType: 'STORY', category: '자유수다' },
  MONEY:     { boardType: 'LIFE2', category: '재테크·연금' },
  RETIRE:    { boardType: 'LIFE2', category: '은퇴준비' },
  HOUSING:   { boardType: 'LIFE2', category: '주거·이사' },
  JOB:       { boardType: 'STORY', category: '자유수다' },
  HUMOR:     { boardType: 'HUMOR', category: '유머·웃음' },
  ENTERTAIN: { boardType: 'HUMOR', category: '엔터·TV' },
  GENERAL:   { boardType: 'STORY', category: '자유수다' },
}

/** 커뮤니티 큐레이션 전용 게시판 결정. boardType='JOB'를 절대 반환하지 않는다. */
export function resolveCommunityBoard(desire: string): { boardType: 'STORY' | 'HUMOR' | 'LIFE2'; category: string } {
  const entry = DESIRE_TO_BOARD[desire] ?? DESIRE_TO_BOARD['GENERAL']!
  if (entry.boardType === 'JOB') {
    return { boardType: 'STORY', category: '자유수다' }
  }
  return { boardType: entry.boardType, category: entry.category }
}

export type CommunityPublishBoardType = 'STORY' | 'HUMOR' | 'LIFE2' | 'MENOPAUSE'

export interface MenopauseRouteOverride {
  boardType: 'MENOPAUSE'
  category: string
  routingDesire: 'MENOPAUSE'
  routingGuard: 'MENOPAUSE_TITLE_STRONG'
  matchedKeywords: string[]
}

/** 갱년기톡 자동 라우팅은 제목 강신호만 허용한다.
 * 본문에만 갱년기가 스치거나 우울/불안/잠 같은 약신호만 있는 글은 기존 보드에 남겨 오분류를 막는다. */
export function resolveMenopauseRouteOverride(title: string, content: string): MenopauseRouteOverride | null {
  const classification = classifyMenopauseCandidate({ title, content })
  if (!classification.shouldRoute) return null
  return {
    boardType: 'MENOPAUSE',
    category: classification.category,
    routingDesire: 'MENOPAUSE',
    routingGuard: 'MENOPAUSE_TITLE_STRONG',
    matchedKeywords: classification.matchedKeywords,
  }
}







const DESIRE_KEYWORDS: Record<string, string[]> = {
  HEALTH:   ['건강', '병원', '약', '증상', '통증', '다이어트', '운동', '혈압', '당뇨', '갱년기', '검진'],
  FAMILY:   ['자녀', '아들', '딸', '남편', '며느리', '손주', '부모', '시어머니', '가족', '부부'],
  MONEY:    ['돈', '재테크', '연금', '절약', '투자', '부동산', '물가', '주식', '적금', '노후', '코스피', '코스닥', '나스닥', 'etf', '커버드콜', '코덱스', 'kodex', '하이닉스', '삼성전자', '배당', '배당주', '미국주식', '폭락', '폭락장', '검은월요일', '재산분배', '자산분배', '상속', '증여', '수익인증', '유지비'],
  RETIRE:   ['은퇴', '퇴직', '노후', '일자리', '재취업', '인생2막', '정년', '임피', '임금피크', 'dc전환', 'db형', 'dc형', '퇴직연금', '정년연장', '제2의인생', '은퇴후일자리'],
  RELATION: ['친구', '모임', '갈등', '화해', '관계', '이웃', '섭섭'],
  HOBBY:    ['취미', '여행', '등산', '텃밭', '독서', '공예', '수영', '골프', '바둑', '자전거', '캠핑', '낚시', '뜨개질', '서예', '그림', '꽃꽂이'],
  MEANING:  ['삶', '의미', '행복', '감사', '성찰', '기억', '회고'],
  HUMOR:    ['웃긴', '황당', '유머', '재미', '웃음', '웃겨', '웃기', '빵터', '폭소', '개그', '재밌', 'ㅋㅋ'],
  ENTERTAIN:['드라마', '예능', '연예인', '배우', '아이돌', 'TV', '방송', '넷플릭스', '유튜브'],
  BEAUTY:   ['피부', '미용', '성형', '뷰티', '보톡스', '화장품', '피부과', '안티에이징'],
  DIGITAL:  ['스마트폰', '앱', '유튜브', '카카오', '키오스크', 'SNS', '유튜버', '인터넷'],
  FOOD:     ['맛집', '요리', '음식', '식당', '레시피', '먹방', '건강식', '식단'],
  SPIRITUAL:['종교', '기도', '사주', '운세', '교회', '절', '성당', '명상', '불교'],
  HOUSING:  ['이사', '인테리어', '전세', '월세', '아파트', '청약', '주거', '집값', '매매', '분양가'],
  FASHION:  ['옷', '패션', '스타일', '코디', '쇼핑', '명품', '브랜드'],
  PET:      ['강아지', '고양이', '반려견', '반려묘', '동물병원', '펫', '반려동물'],
}


/**
 * LIFE2 강신호 키워드 — guessDesire 스코어링에서 +3 가중 (일반 키워드 +1).
 * "이 단어 하나면 LIFE2(재테크/은퇴/주거) 주제 확정" 수준의 신호.
 */
const STRONG_LIFE2_KEYWORDS = new Set([
  // MONEY
  '폭락', '폭락장', '검은월요일', '재산분배', '자산분배', '상속', '증여', '수익인증', '유지비',
  '코스피', '코스닥', '나스닥', '배당', '미국주식', '재테크', '연금',
  // RETIRE
  '임피', '임금피크', 'dc전환', 'db형', 'dc형', '퇴직연금', '정년연장', '재취업', '제2의인생', '인생2막', '은퇴후일자리',
  // HOUSING
  '집값', '매매', '분양가',
])

/**
 * STORY 보호 키워드 — 생활/소음/고장/돌봄 신호. 매칭 시 LIFE2(MONEY/HOUSING) 점수 감점.
 * 단 돈·은퇴 신호(GUARD_OVERRIDE/강신호)가 함께 있으면 미적용 — "정리정돈으로 보는 노후자금"은 LIFE2 유지.
 */
export const STORY_GUARD_KEYWORDS = [
  '집정리', '짐정리', '드레스룸', '미니멀', '비우기', '정리정돈',
  '윗집', '아랫집', '발망치', '층간소음',
  '고장', '수리', 'as신청', 'as기사',
  '병간호', '간병', '돌봄',
]

/** STORY_GUARD를 무효화하는 돈·은퇴 핵심 신호 */
const GUARD_OVERRIDE_KEYWORDS = ['노후', '은퇴', '퇴직', '재테크', '투자', '연금', '자금']

/**
 * 제목에 STORY_GUARD 신호만 있고 돈·은퇴 신호가 전혀 없으면 true (LIFE2 강등 대상).
 * image-router(psych 경로)의 제목 후처리에서도 재사용.
 */
export function isStoryGuarded(topicStr: string | null | undefined): boolean {
  if (!topicStr) return false
  const lower = topicStr.toLowerCase()
  const hasGuard = STORY_GUARD_KEYWORDS.some(kw => lower.includes(kw))
  if (!hasGuard) return false
  const hasMoneyRetire =
    GUARD_OVERRIDE_KEYWORDS.some(kw => lower.includes(kw)) ||
    [...STRONG_LIFE2_KEYWORDS].some(kw => lower.includes(kw))
  return !hasMoneyRetire
}

/**
 * 글 제목으로 욕망 카테고리 추론 (가중 스코어링).
 * - LIFE2 강신호 +3, 일반 키워드 +1
 * - STORY_GUARD(생활/소음/고장/돌봄)만 있고 돈·은퇴 신호 없으면 MONEY/HOUSING −3
 * - argmax. 동점 시 STORY 계열 우선(over-classification 방지), LIFE2 내부 동점은 DESIRE_KEYWORDS 선언 순서(MONEY 우선).
 */
export function guessDesire(topicStr: string | null | undefined): string {
  if (!topicStr) return 'GENERAL'
  const lower = topicStr.toLowerCase()

  const scores: Record<string, number> = {}
  for (const [cat, keywords] of Object.entries(DESIRE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        scores[cat] = (scores[cat] ?? 0) + (STRONG_LIFE2_KEYWORDS.has(kw) ? 3 : 1)
      }
    }
  }

  if (isStoryGuarded(topicStr)) {
    if (scores['MONEY'] !== undefined) scores['MONEY'] -= 3
    if (scores['HOUSING'] !== undefined) scores['HOUSING'] -= 3
  }

  // argmax — 동점 시 STORY 계열 우선(현재 best가 LIFE2이고 동점 후보가 STORY면 교체)
  let best = 'GENERAL'
  let bestScore = 0
  let bestIsLife2 = false
  for (const cat of Object.keys(DESIRE_KEYWORDS)) {
    const s = scores[cat] ?? 0
    if (s <= 0) continue
    const isLife2 = DESIRE_TO_BOARD[cat]?.boardType === 'LIFE2'
    if (s > bestScore || (s === bestScore && bestIsLife2 && !isLife2)) {
      bestScore = s
      best = cat
      bestIsLife2 = isLife2
    }
  }
  return best
}

// ─── ref 원문 기준 게시판 라우팅 (2026-07-12 오분류 개선) ────────────────────
// 배경: 게시판이 candidate(topic) desire의 bucket 상속으로 결정되어 실제 발행 원문과 무관한
//   HUMOR/LIFE2 오배치가 발생(gold label 17건 실측 — HUMOR 오분류율 ~80%).
//   본 함수는 발행 원문(ref)의 psych desire(own)와 원문 텍스트 신호만으로 게시판을 정한다.
//   candidate desire는 입력에서 완전히 제외한다.

/** LIFE2 텍스트 보정 키워드 — "글의 주제 자체가 돈/은퇴/부동산 거래"임을 뒷받침하는 신호.
 *  ⚠️ '돈' 같은 일상 광역어는 절대 넣지 않는다(텐트 처분 글의 "비싼 돈주고" 오탐 — gold A1).
 *  founder 관리: 2막준비로 보내야 할 주제어를 여기 추가한다. */
const LIFE2_CORRECTION_KEYWORDS: readonly string[] = [
  '은퇴', '연금', '노후', '재취업', '정년', '퇴직금', '퇴직연금', '자격증',
  '증여', '상속', '주식', '투자', '배당', '건강보험', '건보료', '국민연금', '보험', '소득', '경제',
  '청약', '분양', '매매가', '전세가', '집값', '월세', '전세', '대출', '금리', '환율', '부동산',
  '반도체', '코스피', '코스닥', '나스닥', '하이닉스', '삼성전자', '삼전', '주가', '증시', '매수', '매도', '반대매매',
]
const LIFE2_AREA_RE = /\d+\s*평/ // "170평" 등 부동산 면적 자기언급 (gold B4)
const LIFE2_KEYWORD_TO_DESIRE: Array<[RegExp, string]> = [
  [/은퇴|재취업|정년|퇴직|노후|자격증/, 'RETIRE'],
  [/청약|분양|매매가|전세가|집값|월세|전세|\d+\s*평/, 'HOUSING'],
]

/** 제목 매칭이면 즉시 보정, 본문뿐이면 서로 다른 키워드 2개 이상일 때만 —
 *  잡담 본문에 스친 단어 1개("재취업 얘기도 나왔는데…")로 LIFE2에 가는 과보정 방지 (dry-run 실측). */
function matchLife2Correction(title: string, content: string): string | null {
  const all = LIFE2_CORRECTION_KEYWORDS.concat(Array.from(STRONG_LIFE2_KEYWORDS))
  const titleLower = title.toLowerCase()
  const titleHit = all.some(k => titleLower.includes(k)) || LIFE2_AREA_RE.test(title)
  let ok = titleHit
  if (!ok) {
    const contentLower = content.toLowerCase()
    const distinct = new Set(all.filter(k => contentLower.includes(k)))
    if (LIFE2_AREA_RE.test(content)) distinct.add('평수')
    ok = distinct.size >= 2
  }
  if (!ok) return null
  const text = `${title} ${content}`
  for (const [re, desire] of LIFE2_KEYWORD_TO_DESIRE) if (re.test(titleHit ? title : text)) return desire
  return 'MONEY'
}

/** HUMOR 게시판 자격 신호 — ref 원문 자체에 유머 의도 또는 엔터 잡담 신호가 있어야 HUMOR 진입.
 *  고민·가족·질문·하소연은 제목이 가벼워도(단발 ㅋ 등) HUMOR 금지 — 'ㅋㅋ'·'TV'·'유튜브'는
 *  일상 대화에 흔해 자격 신호로 쓰지 않는다(gold C "여보 바지 세벌 ~ ㅋ" / A2 "TV 사망" 오탐). */
const HUMOR_ENTITLEMENT_KEYWORDS: readonly string[] = [
  // '황당'은 불만·하소연 서사에 흔해 제외 (gold C "여보 바지 세벌" 본문 오탐 실측)
  '웃긴', '웃겨', '웃기', '빵터', '폭소', '개그', '유머', '웃음', '코미디',
  '드라마', '예능', '연예인', '배우', '아이돌', '넷플릭스', '가수', '노래',
]
export function hasHumorEntitlement(text: string): boolean {
  return HUMOR_ENTITLEMENT_KEYWORDS.some(k => text.includes(k))
}

export interface BoardRouting {
  boardType: CommunityPublishBoardType
  category: string
  routingDesire: string  // 게시판 산출에 실제 사용된 desire
  routingGuard: string   // 발동 경로/가드 (BotLog 관측용)
}

// ── 가족 갈등 우선 룰 (2026-07-12 라이브 보정) ──
// 돈/재산 단어가 있어도 제목이 "가족/부부 주어 + 감정/갈등 신호"면 글의 중심은 갈등 사연 → STORY.
// 라이브 사고: "시댁재산을 자기 동생한테 다주자 하는데 와이프가 열받는게 당연한거 맞죠?" → LIFE2 오분류.
// 제목만 본다 — 본문의 스침 단어로 정보글(증여·상속·연금 질문)을 STORY로 끌어내리지 않기 위함.
const FAMILY_CONFLICT_SUBJECTS: readonly string[] = [
  '시댁', '시어머니', '시아버지', '시누', '형님', '동서', '며느리',
  '남편', '와이프', '아내', '배우자', '친정', '부모님', '형제', '동생',
]
const FAMILY_CONFLICT_SIGNALS: readonly string[] = [
  '열받', '화나', '서운', '짜증', '억울', '싸우', '다투', '갈등', '속상', '미치겠', '당연한가요', '당연한거', '맞죠', '맞나요',
]
function isFamilyConflictTitle(title: string): boolean {
  return FAMILY_CONFLICT_SUBJECTS.some(s => title.includes(s)) && FAMILY_CONFLICT_SIGNALS.some(s => title.includes(s))
}

/** 발행 원문(ref) 기준 게시판 결정 — candidate desire 미개입.
 *  ① 원문 텍스트에 LIFE2 주제어가 있으면 LIFE2 보정 (own 오태깅·미태깅 무관 — gold B)
 *     단 제목이 가족 갈등형이면 보정 억제(FAMILY_CONFLICT) — 돈 얘기라도 갈등 사연은 STORY
 *  ② own이 돈 계열인데 텍스트 뒷받침이 없으면 오태깅으로 보고 텍스트 기준 (gold A)
 *  ③ 그 외 own 우선, 없으면 guessDesire(원문 텍스트)
 *  ④ HUMOR 산출 시 원문 유머/엔터 자격 신호 없으면 STORY 폴백 (gold C) */
export function resolveBoardFromRef(ownDesire: string | null | undefined, title: string, content: string): BoardRouting {
  const text = `${title} ${content}`
  const menopauseOverride = resolveMenopauseRouteOverride(title, content)
  if (menopauseOverride) return menopauseOverride

  // '배우자'의 '배우'가 ENTERTAIN/HUMOR 키워드에 부분 매칭되는 오탐 소거 —
  // 라이브 사고(2026-07-12): "배우자 고르는 눈…" 연애 담론이 HUMOR/엔터·TV로 발행됨.
  // guessDesire·HUMOR 자격 게이트 양쪽에 동일 적용. 진짜 배우/드라마 글은 다른 신호(드라마·연예인 등)로 유지.
  const judgeText = text.replace(/배우자/g, ' ')
  const textDesire = guessDesire(judgeText)
  let life2Fix = matchLife2Correction(title, content)
  let familyConflict = false
  if (life2Fix && isFamilyConflictTitle(title)) {
    life2Fix = null
    familyConflict = true
  }
  let effective: string
  let guard: string
  if (life2Fix) {
    effective = DESIRE_TO_BOARD[textDesire]?.boardType === 'LIFE2' ? textDesire : life2Fix
    guard = 'TEXT_LIFE2'
  } else if (ownDesire && DESIRE_TO_BOARD[ownDesire]?.boardType === 'LIFE2') {
    // own이 MONEY/RETIRE/HOUSING인데 원문에 LIFE2 주제어가 전혀 없음 → psych 오태깅 판정
    effective = DESIRE_TO_BOARD[textDesire]?.boardType === 'LIFE2' ? 'GENERAL' : textDesire
    guard = 'OWN_LIFE2_UNSUPPORTED'
  } else if (ownDesire && ownDesire !== 'GENERAL') {
    effective = ownDesire
    guard = 'OWN'
  } else {
    effective = textDesire
    guard = 'TEXT'
  }
  if (familyConflict) guard += '+FAMILY_CONFLICT'
  let board = resolveCommunityBoard(effective)
  if (board.boardType === 'HUMOR' && !hasHumorEntitlement(judgeText)) {
    board = { boardType: 'STORY', category: '자유수다' }
    guard += '+HUMOR_GATE'
  }
  // LIFE2 진입도 주제어 근거(life2Fix) 필수 — guessDesire의 광역 1점 매칭('아파트' 등)만으로
  // 생활 불편 글이 2막준비에 가는 과보정 방지 (HUMOR 자격 게이트와 대칭)
  if (board.boardType === 'LIFE2' && !life2Fix) {
    board = { boardType: 'STORY', category: familyConflict ? '가족' : '자유수다' }
    guard += '+LIFE2_GATE'
  }
  return { ...board, routingDesire: effective, routingGuard: guard }
}
