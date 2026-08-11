/**
 * 페르소나 SSoT registry (PR-2 / L-PERSONA-SSOT) — 순수 (DB/SDK 의존 없음, vitest 직접 로드 가능)
 *
 * ⚠️ 이 PR은 **정본 구조 신설 + 전수 동일성 증명**까지다. 동작은 한 줄도 바뀌지 않는다.
 *   - 기존 소비 경로(author-reply / matcher / wave / seed / curator 계열)는 그대로 어댑터를 쓴다.
 *   - 이 파일을 import하는 런타임 코드는 아직 없다(테스트만 로드).
 *   - 원본 export 제거·CI 가드·경로 전환은 후속 PR-3~7.
 *
 * 배경 — 정의가 다섯 곳에 흩어져 있다:
 *   원본 A  agents/seed/persona-data.ts        79명 · 깊은 필드(age/gender/personality/never…)
 *   원본 B  agents/cafe/curator-shared.ts     225명 · 얕은 필드(personality·나이·가족 없음)
 *   보강    agents/cafe/curator-persona-meta.ts  225명 중 40명만 override
 *   어댑터1 agents/coo/author-reply-persona.ts       author-reply용 변환
 *   어댑터2 agents/coo/persona-matcher-profiles.ts   shadow matcher용 변환
 * 어댑터가 둘이라는 사실 자체가 SSoT 부재의 증거다(07-15 skip 15% / 07-19 채점 47% / 08-07 bot-JOB 오판).
 *
 * 이 registry는 두 어댑터의 출력을 **바이트 단위로 재현**한다. 재현하지 못하면 PR-2는 FAIL이다.
 * 재현 검증: src/__tests__/persona-registry.test.ts (304건 전수)
 */
import { PERSONAS as BOT_PERSONAS, type Persona } from '../seed/persona-data.js'
import { PERSONAS as CURATOR_PERSONAS } from '../cafe/curator-shared.js'
import { CURATOR_PERSONA_META } from '../cafe/curator-persona-meta.js'
import { classifyTopicGroups, type TopicGroup } from '../coo/persona-matcher-policy.js'
import { inferFamilyStatus, type FamilyStatus, type PersonaProfile } from '../coo/persona-matcher-profiles.js'

/**
 * Temporary bridge for PR-4 seed migration. Exposes the exact legacy seed functions
 * through the registry so seed output stays byte-identical. Direct legacy exports are
 * removed in PR-7.
 *
 * 변환하지 않는다 — 원본 함수 객체를 그대로 내보낸다. seed 결과 동일성이
 * 구조적으로 보장되고(같은 참조), 새 adapter가 생기지 않는다.
 */
export { getPersona, getAllPersonaIds, type Persona } from '../seed/persona-data.js'
/**
 * seed PERSONAS는 `SEED_PERSONAS` 별칭으로 낸다 — 아래 curator `PERSONAS`(225명 배열)와
 * 이름이 겹치기 때문이다. 둘은 타입도 다르다(seed=Record<string,Persona> / curator=PersonaMatch[]).
 * PR-7a에서 scripts/one-time-fix-posts.ts를 registry 경유로 옮기며 추가. 원본 export 제거는 PR-7e.
 */
export { PERSONAS as SEED_PERSONAS } from '../seed/persona-data.js'

/**
 * Temporary bridge for curator persona migration (PR-5a → PR-7c).
 * Exposes the exact legacy curator persona source (225 entries) through the registry
 * so curator output stays byte-identical. Direct legacy exports are removed in PR-7e.
 *
 * 변환하지 않는다 — 원본 배열/함수를 그대로 내보낸다.
 *
 * PR-7b에서 persona 정의가 curator-personas.ts로 분리됐으므로, 여기서는 facade
 * (curator-shared.ts)를 거치지 않고 **정의 원본을 직접** 재수출한다. facade는
 * 소비자가 0이 되는 시점에 PR-7e에서 걷어낸다.
 *
 * 라우팅 헬퍼(matchPersona 등)까지 함께 내보내는 이유: content-curator ·
 * popular-curator가 persona 선택에 이들을 쓰는데, 정본 진입점을 registry 하나로
 * 유지하기 위해서다(PR-7c 창업자 결정). curator-personas.ts 직접 import는 금지다.
 */
export {
  PERSONAS,
  DESIRE_PERSONA_MAP,
  MENOPAUSE_CURATOR_PERSONA_IDS,
  isMenopauseCuratorPersona,
  personasForRoutingBoard,
  personaIdsForRoutingBoard,
  personaBoardForRouting,
  matchPersona,
  type PersonaMatch,
} from '../cafe/curator-personas.js'

/**
 * author-reply 프롬프트 입력 형태. PR-3에서 author-reply-persona.ts가 registry를
 * 호출하게 되면서 순환 참조를 피하기 위해 정의를 이쪽으로 옮겼다.
 * author-reply-persona.ts가 그대로 re-export하므로 기존 import 경로는 유지된다.
 */
export interface AuthorReplyPersonaContext {
  /** 관측용 — bot은 대문자 id, curator는 'curator-{id}' */
  personaId: string
  nickname: string
  personality: string
  style: string
  speechPatterns: string[]
}

/** persona=인격체 · system_feed=기능 봇(채용 피드 등) · official_operator=운영 공식 계정 */
export type PersonaRole = 'persona' | 'system_feed' | 'official_operator'
export type PersonaOrigin = 'seed' | 'curator' | 'system'
/** explicit=원본 명시 · declared=창업자 승인 메타 · inferred=텍스트 휴리스틱 · none=정체성 없음(기능 봇) */
export type IdentitySource = 'explicit' | 'declared' | 'inferred' | 'none'

export interface PersonaToneProfile {
  personality: string
  style: string
  speechPatterns: string[]
  /** 정체성이 리액션/짤/밈형 — 건강 글 배정 제한 축 */
  lightTone: boolean
  /** 닉네임만 유머형 — 정체성이 정상이면 배정 가능(mismatch flag) */
  nicknameLightTone: boolean
  /** 건강/공감형 — 건강 글에서 유머 닉네임 예외 허용 조건 */
  empathyTone: boolean
  /** 무거운 사연(간병/사별/학대) 배정 가능 */
  heavyOk: boolean
}

/**
 * 어댑터2(PersonaProfile) 재현에만 쓰이는 파생값. PR-7에서 어댑터를 제거하면
 * 이 블록이 PersonaProfile의 정본이 된다. 그 전까지는 "재현 가능함"의 증거다.
 */
export interface PersonaLegacyDerived {
  board: string
  topicGroups: TopicGroup[]
  hasGrandchildren: boolean
  /** 스크래퍼봇(BI~BW) — 원글 작성 배정 절대 불가 */
  reactionOnly: boolean
  rawTopics: string
  reserveCandidate: boolean
  depth: 'deep' | 'shallow'
}

export interface PersonaEntry {
  /** 관측 key — seed는 대문자 id('A'), curator는 'curator-A001', 기능 봇은 'system-job' */
  id: string
  /** 이메일 local part의 식별자. seed='a' · curator='a001' · system='job' */
  botId: string
  email: string
  displayName: string
  role: PersonaRole
  origin: PersonaOrigin

  // ── 정체성 (ageBand·familyStatus는 PR-2에서 명시 필드로 승격) ──
  ageBand: string
  familyStatus: FamilyStatus
  identitySource: IdentitySource
  /** 0~1. explicit=1.0 · declared=0.9 · inferred=0.5/0.2 · none=0 */
  identityConfidence: number
  /**
   * 사람 검수 대기 플래그. **관측 전용 — 배정을 막지 않는다.**
   * (persona-matcher-profiles.ts 주석: "unknown은 hard 제외가 아니라 검수 플래그 재료")
   */
  needsReview: boolean

  // ── 권한 ──
  boardsAllowed: string[]
  canWritePost: boolean
  canWriteComment: boolean
  canWriteAuthorReply: boolean
  /** author-reply 대상이 될 수 있는가 (기능 봇은 false) */
  replyEligible: boolean

  toneProfile: PersonaToneProfile
  /** 절대 하지 않는 것 — seed는 never 필드, curator는 미정의 */
  riskBoundaries: string[]
  activityWeight: number

  legacy: PersonaLegacyDerived
  note?: string
}

// ── 어댑터2와 동일한 상수/헬퍼 (재현 정확도를 위해 값 복제, 로직 동일) ──
const REACTION_ONLY_KEYS = new Set(['BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW'])
const LIGHT_TONE_RE = /리액션\s?(전문|의)|짤|밈|이모지|개그|웃긴\s?(걸|일|거)|유머\s?(감각|모음|공유)/
const NICKNAME_LIGHT_RE = /웃음|유머|하하|호호|빵터|개그|ㅋㅋ|짤/
const EMPATHY_RE = /건강|갱년기|공감|위로|걱정|다정|따뜻|보살/
const GRANDCHILD_RE = /손주|손녀|손자/

function profileText(parts: Array<string | string[] | undefined>): string {
  return parts.map(p => (Array.isArray(p) ? p.join(' ') : p ?? '')).join(' ')
}

/** seed 페르소나는 age(47~67)가 전원 있다 → 5세 단위 밴드로 승격 */
function ageBandOf(age: number): string {
  if (age < 45) return '40대초반'
  if (age < 50) return '40대후반'
  if (age < 55) return '50대초반'
  if (age < 60) return '50대후반'
  if (age < 65) return '60대초반'
  if (age < 70) return '60대후반'
  return '70대이상'
}

// ═══════════════════════════════════════════════════════════════
// 기능 봇 — 인격체가 아니다. 원본 어느 곳에도 정의가 없어 지금까지 registry 밖에 있었다.
//   bot-job:  JOB 보드 294건 전량. author-reply-driver 후보 조회가
//             boardType in [STORY,LIFE2,HUMOR,MENOPAUSE]로 제한돼 구조적으로 제외된다.
//   나머지 3: 2026-05-15~16 이후 신규 글 0(dormant) + 전 기간 실회원 댓글 0.
//             L-PERSONA-BOT-GAP known_issue. 이 PR에서 활성화하지 않는다.
// ═══════════════════════════════════════════════════════════════
interface SystemBotSeed {
  botId: string
  displayName: string
  boardsAllowed: string[]
  dormant: boolean
  note: string
}

const SYSTEM_BOTS: SystemBotSeed[] = [
  {
    botId: 'job',
    displayName: '일자리봇',
    boardsAllowed: ['JOB'],
    dormant: false,
    note: '채용 피드 봇. JOB 보드 전량(2026-08-07 기준 294건). author-reply 후보 조회의 boardType 필터에서 구조적으로 제외되므로 인격 페르소나화하지 않는다.',
  },
  { botId: 'humor', displayName: '웃음배달부', boardsAllowed: ['HUMOR'], dormant: true, note: 'dormant(최근 글 2026-05-15) · 전 기간 실회원 댓글 0. L-PERSONA-BOT-GAP.' },
  { botId: 'caregiving', displayName: '돌봄길잡이', boardsAllowed: ['STORY'], dormant: true, note: 'dormant(최근 글 2026-05-15) · 전 기간 실회원 댓글 0. L-PERSONA-BOT-GAP.' },
  { botId: 'health', displayName: '건강길잡이', boardsAllowed: ['STORY', 'MENOPAUSE'], dormant: true, note: 'dormant(최근 글 2026-05-16) · 전 기간 실회원 댓글 0. L-PERSONA-BOT-GAP.' },
]

/** 운영 공식 계정 — 페르소나도 기능 봇도 아니다 */
const OFFICIAL_EMAIL = 'official@unao.bot'

const EMPTY_TONE: PersonaToneProfile = {
  personality: '', style: '', speechPatterns: [],
  lightTone: false, nicknameLightTone: false, empathyTone: false, heavyOk: false,
}
const EMPTY_LEGACY: PersonaLegacyDerived = {
  board: '', topicGroups: [], hasGrandchildren: false,
  reactionOnly: false, rawTopics: '', reserveCandidate: false, depth: 'shallow',
}

function buildSeedEntry(key: string, p: Persona): PersonaEntry {
  const text = profileText([p.personality, p.style, p.topics, p.quirks, p.never])
  const reactionOnly = REACTION_ONLY_KEYS.has(key)
  const groups = classifyTopicGroups(text, p.board)
  const substantive = groups.filter(g => g !== 'GENERAL')
  return {
    id: key,
    botId: key.toLowerCase(),
    email: `bot-${key.toLowerCase()}@unao.bot`,
    displayName: p.nickname,
    role: 'persona',
    origin: 'seed',
    ageBand: ageBandOf(p.age),
    familyStatus: inferFamilyStatus(text),
    // age·gender·personality·never가 원본에 명시 → 정체성 축이 추론이 아니다
    identitySource: 'explicit',
    identityConfidence: 1,
    needsReview: false,
    boardsAllowed: [p.board],
    // 스크래퍼봇(BI~BW)은 댓글/좋아요만 — 원글 배정 불가
    canWritePost: !reactionOnly,
    canWriteComment: true,
    canWriteAuthorReply: !reactionOnly,
    replyEligible: true,
    toneProfile: {
      personality: p.personality,
      style: p.style,
      speechPatterns: p.speech_patterns,
      lightTone: LIGHT_TONE_RE.test(text),
      nicknameLightTone: NICKNAME_LIGHT_RE.test(p.nickname),
      empathyTone: EMPATHY_RE.test(text),
      heavyOk: true,
    },
    riskBoundaries: p.never,
    activityWeight: reactionOnly ? 0.5 : 1,
    legacy: {
      board: p.board,
      topicGroups: groups,
      hasGrandchildren: GRANDCHILD_RE.test(text),
      reactionOnly,
      rawTopics: p.topics.join(' '),
      reserveCandidate: substantive.length === 0 || substantive.every(g => g === 'LOCAL_DAILY'),
      depth: 'deep',
    },
  }
}

function buildCuratorEntry(p: (typeof CURATOR_PERSONAS)[number]): PersonaEntry {
  const meta = CURATOR_PERSONA_META[p.id]
  const text = profileText([p.style, p.topics, p.quirks])
  const groups = meta?.topicGroups ?? classifyTopicGroups(text, p.board)
  const substantive = groups.filter(g => g !== 'GENERAL')
  const familyStatus = meta?.familyStatus ?? inferFamilyStatus(text)
  // curator 원본에는 나이·가족 필드가 없다(07-19 shadow 오분류 47%의 원인).
  // meta가 있으면 창업자 승인 명시값(declared), 없으면 텍스트 휴리스틱(inferred).
  const identitySource: IdentitySource = meta ? 'declared' : 'inferred'
  const identityConfidence = meta ? 0.9 : familyStatus === 'unknown' ? 0.2 : 0.5
  return {
    id: `curator-${p.id}`,
    botId: p.id.toLowerCase(),
    email: `curator-${p.id.toLowerCase()}@unao.bot`,
    displayName: p.nickname,
    role: 'persona',
    origin: 'curator',
    // 나이 신호가 원본에 없다 — 추론하지 않고 unknown으로 두고 needsReview로 표시한다.
    ageBand: 'unknown',
    familyStatus,
    identitySource,
    identityConfidence,
    needsReview: identityConfidence < 0.6,
    boardsAllowed: [p.board],
    canWritePost: true,
    canWriteComment: true,
    canWriteAuthorReply: true,
    replyEligible: true,
    toneProfile: {
      // curator 원본에 personality 필드가 없어 어댑터1과 동일하게 style+topics+quirks로 합성
      personality: `${p.style}. 주로 ${p.topics.slice(0, 3).join(', ')} 이야기를 하고, ${p.quirks.slice(0, 2).join(' / ')} 같은 습관이 있다`,
      style: p.style,
      speechPatterns: p.patterns,
      lightTone: meta ? meta.tone === 'light' : LIGHT_TONE_RE.test(text),
      nicknameLightTone: NICKNAME_LIGHT_RE.test(p.nickname),
      empathyTone: EMPATHY_RE.test(text),
      heavyOk: meta?.heavyOk ?? true,
    },
    riskBoundaries: [],
    activityWeight: 1,
    legacy: {
      board: p.board,
      topicGroups: groups,
      hasGrandchildren: GRANDCHILD_RE.test(text),
      reactionOnly: false,
      rawTopics: [p.style, ...p.topics].join(' '),
      reserveCandidate: substantive.length === 0 || substantive.every(g => g === 'LOCAL_DAILY'),
      depth: 'shallow',
    },
  }
}

function buildSystemEntry(s: SystemBotSeed): PersonaEntry {
  return {
    id: `system-${s.botId}`,
    botId: s.botId,
    email: `bot-${s.botId}@unao.bot`,
    displayName: s.displayName,
    role: 'system_feed',
    origin: 'system',
    ageBand: 'n/a',
    familyStatus: 'unknown',
    identitySource: 'none',
    identityConfidence: 0,
    // dormant 3종은 사람 판단 대기(활성화 여부). bot-job은 판단 완료(피드 봇 확정).
    needsReview: s.dormant,
    boardsAllowed: s.boardsAllowed,
    canWritePost: true,
    canWriteComment: false,
    canWriteAuthorReply: false,
    replyEligible: false,
    toneProfile: EMPTY_TONE,
    riskBoundaries: [],
    activityWeight: 0,
    legacy: EMPTY_LEGACY,
    note: s.note,
  }
}

let _cache: PersonaEntry[] | null = null

/** 전체 registry — seed 79 + curator 225 + system 4 + official 1 */
export function buildRegistry(): PersonaEntry[] {
  if (_cache) return _cache
  const out: PersonaEntry[] = []
  for (const [key, p] of Object.entries(BOT_PERSONAS)) out.push(buildSeedEntry(key, p))
  for (const p of CURATOR_PERSONAS) out.push(buildCuratorEntry(p))
  for (const s of SYSTEM_BOTS) out.push(buildSystemEntry(s))
  out.push({
    id: 'system-official', botId: 'official', email: OFFICIAL_EMAIL, displayName: '운영',
    role: 'official_operator', origin: 'system',
    ageBand: 'n/a', familyStatus: 'unknown', identitySource: 'none', identityConfidence: 0, needsReview: false,
    boardsAllowed: [], canWritePost: true, canWriteComment: true, canWriteAuthorReply: false, replyEligible: false,
    toneProfile: EMPTY_TONE, riskBoundaries: [], activityWeight: 0, legacy: EMPTY_LEGACY,
    note: '운영 공식 계정 — 페르소나 아님.',
  })
  _cache = out
  return out
}

/** 이메일로 조회 (대소문자 무시) — 없으면 null */
export function resolveByEmail(email: string): PersonaEntry | null {
  const k = email.toLowerCase()
  return buildRegistry().find(e => e.email.toLowerCase() === k) ?? null
}

export function getEntry(id: string): PersonaEntry | null {
  return buildRegistry().find(e => e.id === id) ?? null
}

/** 인격체만 (기능 봇·운영 계정 제외) */
export function listPersonas(): PersonaEntry[] {
  return buildRegistry().filter(e => e.role === 'persona')
}

// ═══════════════════════════════════════════════════════════════
// 어댑터 재현 — PR-3~6에서 각 소비 경로가 이 두 함수로 갈아탄다.
// PR-2에서는 "기존 결과와 전수 동일"을 증명하는 용도로만 쓴다.
// ═══════════════════════════════════════════════════════════════

/** 어댑터1(author-reply-persona.ts) 출력 재현. 기능 봇/운영 계정은 null(= 기존과 동일하게 skip) */
export function toAuthorReplyContext(e: PersonaEntry | null): AuthorReplyPersonaContext | null {
  if (!e || e.role !== 'persona') return null
  return {
    personaId: e.id,
    nickname: e.displayName,
    personality: e.toneProfile.personality,
    style: e.toneProfile.style,
    speechPatterns: e.toneProfile.speechPatterns,
  }
}

/**
 * 어댑터2(persona-matcher-profiles.ts) 출력 재현.
 * buildAllProfiles()는 gender!=='여'를 제외하지만 seed 79명 전원이 '여'라 실질 제외는 0건이다.
 */
export function toPersonaProfile(e: PersonaEntry): PersonaProfile {
  return {
    key: e.id,
    authorEmail: e.email,
    nickname: e.displayName,
    origin: e.origin === 'seed' ? 'bot' : 'curator',
    board: e.legacy.board,
    topicGroups: e.legacy.topicGroups,
    familyStatus: e.familyStatus,
    hasGrandchildren: e.legacy.hasGrandchildren,
    reactionOnly: e.legacy.reactionOnly,
    lightTone: e.toneProfile.lightTone,
    nicknameLightTone: e.toneProfile.nicknameLightTone,
    empathyTone: e.toneProfile.empathyTone,
    heavyOk: e.toneProfile.heavyOk,
    rawTopics: e.legacy.rawTopics,
    reserveCandidate: e.legacy.reserveCandidate,
    depth: e.legacy.depth,
  }
}
