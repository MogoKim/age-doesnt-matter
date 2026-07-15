/**
 * persona matcher — 순수부 (글 분석·hard constraint·diversity penalty·final pick)
 * DB/SDK 의존 없음. 런타임(표본 조회·BotLog 기록)은 persona-matcher-driver.ts 참조.
 *
 * 설계 원칙 (2026-07-15 창업자 결정):
 *  - 단순 best match 금지 — 글 분석 → hard 제외 → eligible 후보군 → penalty → reserve 판단 → final pick
 *  - 모든 작성자 페르소나는 40대 중반~60대 여성. 남성/2030/현재 육아맘 자기발화 글은
 *    누구에게도 배정 불가 + Haiku calibration 표본 후보로 표시
 *  - 후보군이 1명으로 몰리면 그 자체를 문제로 기록 (자동화 티 방지의 핵심)
 *  - reserve는 fallback 전용(주 2~3회 상한) — eligible이 전멸했거나 주제군이 약할 때만
 */
import type { PersonaProfile } from './persona-matcher-profiles.js'

export type TopicGroup =
  | 'FAMILY_SPOUSE' // 1순위: 가족/부부/남편
  | 'RETIRE_MONEY' // 2순위: 은퇴/연금/재테크
  | 'INLAW' // 3순위: 시댁/며느리/고부
  | 'HEALTH'
  | 'LOCAL_DAILY'
  | 'HUMOR_LIGHT'
  | 'CARE_SOLO'
  | 'GENERAL'

const TOPIC_PATTERNS: Array<[TopicGroup, RegExp]> = [
  ['INLAW', /시댁|시어머니|시엄니|시모|시아버지|시부모|며느리|고부|시누이|동서|사위/],
  ['FAMILY_SPOUSE', /남편|신랑|그이|영감|와이프|아내|부부|각방|결혼\s?생활|재혼|황혼\s?이혼/],
  ['RETIRE_MONEY', /은퇴|연금|국민연금|노후|퇴직|재테크|적금|예금|주식|부동산|목돈|생활비|월세|전세/],
  ['HEALTH', /갱년기|건강|병원|검진|관절|무릎|허리|혈압|당뇨|콜레스테롤|불면|수면|우울|증상|다이어트|영양제/],
  ['CARE_SOLO', /간병|요양|치매|독거|혼자\s?사는|1인\s?가구|고독/],
  ['LOCAL_DAILY', /동네|시장|마트|맛집|카페|장보|물가|계란|날씨|산책|여행|버스|지하철|아파트|반찬|요리|김치|빨래|건조기|세탁|청소|살림|폭염|더위|장마|에어컨|복날|초복|중복|말복|삼계탕|수박/],
  ['HUMOR_LIGHT', /유머|웃긴|웃음|짤|개그|빵\s?터/],
]

/** 발행 category → 주제군 보조 신호 (텍스트 분류가 못 잡는 글의 reserve 과다 방지 — 1차 실측 GENERAL 45% 보정) */
const CATEGORY_GROUPS: Record<string, TopicGroup> = {
  '재테크·연금': 'RETIRE_MONEY',
  은퇴준비: 'RETIRE_MONEY',
  보험: 'RETIRE_MONEY',
  '주거·이사': 'RETIRE_MONEY',
  가족: 'FAMILY_SPOUSE',
  건강: 'HEALTH',
  취미: 'LOCAL_DAILY',
  '유머·웃음': 'HUMOR_LIGHT',
  '엔터·TV': 'HUMOR_LIGHT',
}

/** 글·페르소나 공용 주제군 분류 — 매칭 순서가 우선순위(복수 반환, 없으면 GENERAL).
 *  텍스트 신호 우선, category는 보조(자유수다/고민 등 무매핑 category는 텍스트에 맡김) */
export function classifyTopicGroups(text: string, boardType?: string, category?: string | null): TopicGroup[] {
  const groups: TopicGroup[] = []
  for (const [group, re] of TOPIC_PATTERNS) {
    if (re.test(text)) groups.push(group)
  }
  const catGroup = category ? CATEGORY_GROUPS[category] : undefined
  if (catGroup && !groups.includes(catGroup)) groups.push(catGroup)
  if (boardType === 'HUMOR' && !groups.includes('HUMOR_LIGHT')) groups.push('HUMOR_LIGHT')
  if (groups.length === 0) groups.push('GENERAL')
  return groups
}

// ── 1. 글 분석 ─────────────────────────────────────────────

export interface SpeakerClues {
  husbandPresent: boolean // 남편 현재형 (기혼 화자 신호)
  adultChildren: boolean // 성인 자녀 — 배정 가능
  grandchildren: boolean // 손주 — 배정 가능
  youngChildCare: boolean // 초등 이하 현재 양육 — 세계관 위반
  pregnancy: boolean // 임신/출산 자기발화 — 무근거 시 2030 간주 (Haiku calibration 원칙 ①)
  maleSelf: boolean // 남성 자기발화 — 세계관 위반
  youngSelf: boolean // 2030 자기발화 — 세계관 위반
}

export type WorldviewViolation = 'CURRENT_PARENTING' | 'MALE_SELF' | 'YOUNG_SELF' | null

export interface PostAnalysis {
  topicGroups: TopicGroup[]
  speakerClues: SpeakerClues
  /** null이 아니면 어떤 페르소나에게도 배정 불가 + Haiku 표본 후보 */
  worldviewViolation: WorldviewViolation
}

export function analyzePost(input: { title: string; content: string; boardType: string; category?: string | null }): PostAnalysis {
  const text = `${input.title} ${input.content}`
  const clues: SpeakerClues = {
    husbandPresent: /남편[이은한과랑]|남편\s|신랑[이은]|우리\s?그이/.test(text) && !/사별|남편[을이]?\s?(먼저|일찍)?\s?(보내|떠나|여의)/.test(text),
    adultChildren: /(장성한|다\s?큰|취직한?|대학생|시집|장가)\s?(아들|딸|자녀|애)|아들네|딸네/.test(text),
    grandchildren: /손주|손녀|손자/.test(text),
    youngChildCare: /초[1-6]\b|초등학생|초딩|유치원|어린이집|영유아|돌쟁이|신생아|등하교|학원\s?(픽업|라이딩)|육아휴직/.test(text),
    pregnancy: /(제가|저\s|저는).{0,14}(임신|출산|만삭|산후)|임신\s?\d+\s?주/.test(text),
    // 아내 지칭어 = 남성 화자 강신호. 단 '와이프분' 존칭·타인(친구/지인/아들/사위) 인용은 제외 (Haiku calibration '명시적 남성 1인칭만' 원칙 정합)
    maleSelf: /(제가|저는|나는).{0,10}(남자|남편으로서|아빠로서)|(?<!(친구|지인|아들|사위)\s?)(와이프|집사람|마누라)(?!분)/.test(text),
    youngSelf: /(20대|30대|이십대|삼십대).{0,8}(인데|이고|입니다|예요|에요)|남자친구|남친/.test(text),
  }
  let violation: WorldviewViolation = null
  if (clues.maleSelf) violation = 'MALE_SELF'
  else if (clues.youngSelf || clues.pregnancy) violation = 'YOUNG_SELF'
  else if (clues.youngChildCare) violation = 'CURRENT_PARENTING'
  return { topicGroups: classifyTopicGroups(text, input.boardType, input.category), speakerClues: clues, worldviewViolation: violation }
}

// ── 2. hard constraint ─────────────────────────────────────

export function findHardConstraintViolation(p: PersonaProfile, a: PostAnalysis): string | null {
  if (p.reactionOnly) return 'REACTION_ONLY' // 댓글/좋아요 전용 — 원글 배정 절대 불가
  // 가족상태 충돌: 남편 현재형 글을 사별/이혼/혼자 사는 페르소나가 맡지 않는다 (unknown은 통과 + 검수 플래그)
  if (a.speakerClues.husbandPresent && (p.familyStatus === 'widowed' || p.familyStatus === 'divorced' || p.familyStatus === 'solo')) {
    return `FAMILY_CONFLICT_${p.familyStatus.toUpperCase()}`
  }
  return null
}

// ── 3·4. eligible 후보군 + diversity penalty ────────────────

export interface ExposureState {
  /** key → 오늘 배정 수 (일 2편 상한) */
  daily: Record<string, number>
  /** key → 최근 7일 배정 수 (주 8편 상한 / reserve 주 3회 상한) */
  weekly: Record<string, number>
  /** key → 최신 20편(첫 화면) 내 등장 수 (2편 이상 감점) */
  firstScreen: Record<string, number>
  /** key → 최근 72h 내 담당한 주제군 목록 (같은 주제군 반복 감점) */
  recentGroups72h: Record<string, TopicGroup[]>
  /** key → 직전 배정 주제군 (연속 담당 감점) */
  lastGroup: Record<string, TopicGroup | undefined>
  /** key → 마지막 배정 시각 epoch ms (동점 시 최장 미노출 우선) */
  lastAssignedAt: Record<string, number | undefined>
}

export function emptyExposure(): ExposureState {
  return { daily: {}, weekly: {}, firstScreen: {}, recentGroups72h: {}, lastGroup: {}, lastAssignedAt: {} }
}

const DAILY_CAP = 2
const WEEKLY_CAP = 8
const RESERVE_WEEKLY_CAP = 3

export interface ScoredCandidate {
  key: string
  score: number
  penalties: string[]
  overQuota: boolean
}

export function scoreCandidate(p: PersonaProfile, a: PostAnalysis, e: ExposureState): ScoredCandidate {
  const penalties: string[] = []
  const primary = a.topicGroups[0]
  let score = 0
  if (p.topicGroups.includes(primary)) score += 100 // core 주제군
  else if (a.topicGroups.some(g => p.topicGroups.includes(g))) score += 50 // 인접 주제군
  else if (p.topicGroups.includes('GENERAL') || primary === 'GENERAL') score += 10

  const daily = e.daily[p.key] ?? 0
  const weekly = e.weekly[p.key] ?? 0
  let overQuota = false
  if (daily >= DAILY_CAP) {
    overQuota = true
    penalties.push(`DAILY_CAP(${daily})`)
  }
  if (weekly >= WEEKLY_CAP) {
    overQuota = true
    penalties.push(`WEEKLY_CAP(${weekly})`)
  }
  if (p.reserveCandidate && weekly >= RESERVE_WEEKLY_CAP) {
    overQuota = true
    penalties.push(`RESERVE_WEEKLY_CAP(${weekly})`)
  }
  if ((e.firstScreen[p.key] ?? 0) >= 2) {
    score -= 60
    penalties.push('FIRST_SCREEN_DUP')
  }
  const repeat72h = (e.recentGroups72h[p.key] ?? []).filter(g => g === primary).length
  if (repeat72h > 0) {
    score -= 40 * repeat72h
    penalties.push(`SAME_GROUP_72H(x${repeat72h})`)
  }
  if (e.lastGroup[p.key] === primary) {
    score -= 30
    penalties.push('CONSECUTIVE_SAME_GROUP')
  }
  return { key: p.key, score, penalties, overQuota }
}

// ── 5·6. reserve fallback + final pick ──────────────────────

export interface MatchResult {
  topicGroups: TopicGroup[]
  speakerClues: SpeakerClues
  worldviewViolation: WorldviewViolation
  /** key → 제외 사유 (hard constraint) */
  excluded: Record<string, string>
  /** 점수순 eligible 후보군 (quota 초과 제외 전) */
  eligible: ScoredCandidate[]
  eligibleCount: number
  /** eligible이 1명으로 몰림 — 후보군 확장 필요 신호 */
  singleCandidateWarning: boolean
  reserveFallback: boolean
  finalPick: { key: string; nickname: string; authorEmail: string; score: number; penalties: string[] } | null
  pickReason: string
  needsReview: boolean
  reviewReasons: string[]
  haikuSampleCandidate: boolean
}

export function matchPersona(profiles: PersonaProfile[], a: PostAnalysis, e: ExposureState): MatchResult {
  const base: Omit<MatchResult, 'excluded' | 'eligible' | 'eligibleCount' | 'singleCandidateWarning' | 'reserveFallback' | 'finalPick' | 'pickReason' | 'needsReview' | 'reviewReasons' | 'haikuSampleCandidate'> = {
    topicGroups: a.topicGroups,
    speakerClues: a.speakerClues,
    worldviewViolation: a.worldviewViolation,
  }

  // 세계관 위반 글: 배정 자체 불가 — Haiku calibration 표본 후보
  if (a.worldviewViolation) {
    return {
      ...base,
      excluded: {},
      eligible: [],
      eligibleCount: 0,
      singleCandidateWarning: false,
      reserveFallback: false,
      finalPick: null,
      pickReason: `WORLDVIEW_VIOLATION_${a.worldviewViolation} — 어떤 페르소나에게도 배정 불가`,
      needsReview: true,
      reviewReasons: [`세계관 위반(${a.worldviewViolation}) — 발행 차단/숨김 검토 + Haiku 표본`],
      haikuSampleCandidate: true,
    }
  }

  const excluded: Record<string, string> = {}
  const passed: PersonaProfile[] = []
  for (const p of profiles) {
    const v = findHardConstraintViolation(p, a)
    if (v) excluded[p.key] = v
    else passed.push(p)
  }

  const primary = a.topicGroups[0]
  const weakTopic = primary === 'GENERAL'
  // eligible: 주제군 core/인접 매칭 (reserve 성향 제외 — reserve는 fallback에서만)
  const topical = passed.filter(p => !p.reserveCandidate && a.topicGroups.some(g => p.topicGroups.includes(g)))
  const scored = topical.map(p => scoreCandidate(p, a, e)).sort((x, y) => y.score - x.score)
  const available = scored.filter(c => !c.overQuota)

  const reviewReasons: string[] = []
  let reserveFallback = false
  let pool = available
  let pickReason = ''

  if (weakTopic || available.length === 0) {
    // reserve fallback: 주제군이 약한 일상글이거나 eligible 전원 quota/제외로 소진됐을 때만
    const reserves = passed
      .filter(p => p.reserveCandidate)
      .map(p => scoreCandidate(p, a, e))
      .filter(c => !c.overQuota)
      .sort((x, y) => y.score - x.score)
    if (weakTopic && reserves.length > 0) {
      reserveFallback = true
      pool = reserves
      pickReason = 'RESERVE_FALLBACK — 명확한 주제군 없는 일상글'
    } else if (available.length === 0 && reserves.length > 0) {
      reserveFallback = true
      pool = reserves
      pickReason = 'RESERVE_FALLBACK — eligible 전원 quota/부적합'
      reviewReasons.push('주제군 후보 전멸 — 해당 주제군 페르소나 수급 필요')
    } else if (available.length === 0) {
      return {
        ...base,
        excluded,
        eligible: scored,
        eligibleCount: scored.length,
        singleCandidateWarning: scored.length === 1,
        reserveFallback: false,
        finalPick: null,
        pickReason: 'NO_CANDIDATE — eligible·reserve 모두 소진',
        needsReview: true,
        reviewReasons: ['후보 전멸 — 페르소나 수급/상한 재검토 필요'],
        haikuSampleCandidate: false,
      }
    }
  }

  // final pick: 최고점, 동점이면 최장 미노출 우선
  const top = pool[0]
  const tied = pool.filter(c => c.score === top.score)
  const winner = tied.sort((x, y) => (e.lastAssignedAt[x.key] ?? 0) - (e.lastAssignedAt[y.key] ?? 0))[0]
  const winnerProfile = profiles.find(p => p.key === winner.key)!
  if (!pickReason) pickReason = `TOP_SCORE(${winner.score}) — 주제군 ${primary} ${tied.length > 1 ? '+ 최장 미노출 tie-break' : ''}`.trim()

  if (a.speakerClues.husbandPresent && winnerProfile.familyStatus === 'unknown') {
    reviewReasons.push('남편 현재형 글에 가족상태 unknown 페르소나 배정 — 프로필 보강 필요')
  }
  const singleCandidateWarning = !reserveFallback && available.length === 1
  if (singleCandidateWarning) reviewReasons.push(`주제군 ${primary} 후보가 1명뿐 — 수급 1~3순위 계획 참조`)

  return {
    ...base,
    excluded,
    eligible: scored.slice(0, 8),
    eligibleCount: reserveFallback ? pool.length : available.length,
    singleCandidateWarning,
    reserveFallback,
    finalPick: {
      key: winner.key,
      nickname: winnerProfile.nickname,
      authorEmail: winnerProfile.authorEmail,
      score: winner.score,
      penalties: winner.penalties,
    },
    pickReason,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    haikuSampleCandidate: false,
  }
}
