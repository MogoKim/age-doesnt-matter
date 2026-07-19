/**
 * 페르소나 통합 프로필 어댑터 — 순수 (DB/SDK 의존 없음, vitest 직접 로드 가능)
 *
 * 배경(2026-07-15 페르소나 감사 + 창업자 결정):
 *  - bot-*(persona-data.ts, 깊은 필드) / curator-*(curator-shared.ts, 얕은 필드) 두 체계를
 *    matcher가 쓸 수 있는 단일 PersonaProfile로 변환한다.
 *  - curator 정의는 가족상태·나이대 필드가 없어 텍스트 휴리스틱으로 추론하고,
 *    추론 불가는 'unknown'으로 남긴다(unknown은 hard 제외가 아니라 검수 플래그 재료).
 *  - 과거 글 authorId 재매핑 금지 — 이 어댑터는 신규 matcher 판단 전용이다.
 *  - BI~BW는 스크래퍼봇 전용(댓글/좋아요만, 글 작성 없음) → reactionOnly, 원글 배정 불가.
 */
import { PERSONAS as BOT_PERSONAS } from '../seed/persona-data.js'
import { PERSONAS as CURATOR_PERSONAS } from '../cafe/curator-shared.js'
import { CURATOR_PERSONA_META } from '../cafe/curator-persona-meta.js'
import { classifyTopicGroups, type TopicGroup } from './persona-matcher-policy.js'

export type FamilyStatus = 'married' | 'widowed' | 'divorced' | 'solo' | 'unknown'

export interface PersonaProfile {
  /** 관측 key — bot은 대문자 id('A'), curator는 'curator-A' */
  key: string
  authorEmail: string
  nickname: string
  origin: 'bot' | 'curator'
  board: string
  /** core 주제군 (텍스트 분류) */
  topicGroups: TopicGroup[]
  familyStatus: FamilyStatus
  hasGrandchildren: boolean
  /** wave 전용(BI~BW) — 원글 작성 배정 절대 불가 */
  reactionOnly: boolean
  /** 정체성이 가벼운 리액션/짤/유머형 — 건강 글 배정 금지, 은퇴/돈 글 감점 (calibration 2026-07-16) */
  lightTone: boolean
  /** 닉네임만 유머형(웃음○○ 등) — 정체성이 정상이면 배정 가능하되 nicknameToneMismatch flag */
  nicknameLightTone: boolean
  /** 정체성이 건강/공감형 — 건강 글에서 유머형 닉네임이라도 예외 허용되는 유일 조건 (calibration 1) */
  empathyTone: boolean
  /** 무거운 사연(간병/사별/학대 등) 배정 가능 — 메타 명시 없으면 true (2026-07-19 shadow 보강) */
  heavyOk: boolean
  /** 페르소나 원본 토픽 텍스트 — 글 키워드 겹침 보너스용 */
  rawTopics: string
  /** GENERAL/동네일상 위주의 범용 성향 — reserve fallback 후보 근사 (본설계는 380명 확장 PR에서) */
  reserveCandidate: boolean
  depth: 'deep' | 'shallow'
}

/** 스크래퍼봇 전용 키 — persona-data.ts BI~BW 주석 기준 (BX '말티즈엄마'는 일반 작성 페르소나) */
const REACTION_ONLY_KEYS = new Set(['BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW'])

export function inferFamilyStatus(text: string): FamilyStatus {
  if (/사별|남편[을이가]?\s?(먼저|일찍)?\s?(보내|떠나|여의)|미망인/.test(text)) return 'widowed'
  if (/이혼/.test(text)) return 'divorced'
  if (/혼자\s?(산|살|지내)|독거|1인\s?가구|싱글/.test(text)) return 'solo'
  if (/남편|신랑|그이|영감|부부|시댁|시어머니|며느리|사위/.test(text)) return 'married' // 시댁·며느리 화자는 기혼 신호
  if (/아들|딸|자녀|애들|손주|손녀|손자|시집|장가/.test(text)) return 'married' // 자녀·손주 존재 = 기혼 추론 강화(calibration 5 — 사별/이혼/혼자 신호 선순위 유지)
  return 'unknown'
}

function profileText(parts: Array<string | string[] | undefined>): string {
  return parts.map(p => (Array.isArray(p) ? p.join(' ') : p ?? '')).join(' ')
}

function toProfile(input: {
  key: string
  authorEmail: string
  nickname: string
  origin: 'bot' | 'curator'
  board: string
  text: string
  rawTopics: string
  gender?: string
  /** curator 보강 메타 (curator-persona-meta.ts) — 있으면 휴리스틱 override */
  meta?: import('../cafe/curator-persona-meta.js').CuratorPersonaMeta
}): PersonaProfile {
  const groups = input.meta?.topicGroups ?? classifyTopicGroups(input.text, input.board)
  const substantive = groups.filter(g => g !== 'GENERAL')
  // 정체성 톤: 리액션/짤/밈/개그 전문 서술 = 가벼운 톤 (닉네임과 별개로 판별)
  const lightTone = input.meta ? input.meta.tone === 'light' : /리액션\s?(전문|의)|짤|밈|이모지|개그|웃긴\s?(걸|일|거)|유머\s?(감각|모음|공유)/.test(input.text)
  const nicknameLightTone = /웃음|유머|하하|호호|빵터|개그|ㅋㅋ|짤/.test(input.nickname)
  const empathyTone = /건강|갱년기|공감|위로|걱정|다정|따뜻|보살/.test(input.text)
  return {
    key: input.key,
    authorEmail: input.authorEmail,
    nickname: input.nickname,
    origin: input.origin,
    board: input.board,
    topicGroups: groups,
    familyStatus: input.meta?.familyStatus ?? inferFamilyStatus(input.text),
    hasGrandchildren: /손주|손녀|손자/.test(input.text),
    reactionOnly: input.origin === 'bot' && REACTION_ONLY_KEYS.has(input.key),
    lightTone,
    nicknameLightTone,
    empathyTone,
    heavyOk: input.meta?.heavyOk ?? true,
    rawTopics: input.rawTopics,
    // 범용 성향: 실질 주제군이 없거나 동네일상뿐 → '조용한 이웃형' fallback 근사
    reserveCandidate: substantive.length === 0 || substantive.every(g => g === 'LOCAL_DAILY'),
    depth: input.origin === 'bot' ? 'deep' : 'shallow',
  }
}

/** 전체 작성자 페르소나 풀 (bot 79 + curator 99 정의) — 남성(gender!=='여') 페르소나는 세계관상 제외 */
export function buildAllProfiles(): PersonaProfile[] {
  const profiles: PersonaProfile[] = []
  for (const [key, p] of Object.entries(BOT_PERSONAS)) {
    if (p.gender && p.gender !== '여') continue // 40대 중반~60대 여성 세계관 — 남성 페르소나 원글 배정 금지
    profiles.push(
      toProfile({
        key,
        authorEmail: `bot-${key.toLowerCase()}@unao.bot`,
        nickname: p.nickname,
        origin: 'bot',
        board: p.board,
        text: profileText([p.personality, p.style, p.topics, p.quirks, p.never]),
        rawTopics: p.topics.join(' '),
      }),
    )
  }
  for (const p of CURATOR_PERSONAS) {
    profiles.push(
      toProfile({
        key: `curator-${p.id}`,
        authorEmail: `curator-${p.id.toLowerCase()}@unao.bot`,
        nickname: p.nickname,
        origin: 'curator',
        board: p.board,
        text: profileText([p.style, p.topics, p.quirks]),
        rawTopics: [p.style, ...p.topics].join(' '),
        meta: CURATOR_PERSONA_META[p.id],
      }),
    )
  }
  return profiles
}
