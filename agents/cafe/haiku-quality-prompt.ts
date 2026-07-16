/**
 * Haiku 품질 게이트 — 순수부 (타입·프롬프트 빌더·파서·요약). DB/SDK 의존 없음.
 * vitest가 env·prisma 없이 로드할 수 있도록 런타임부(haiku-quality-gate.ts)와 분리.
 */

export type HaikuDecision = 'PASS' | 'REJECT' | 'NEEDS_REVIEW'
export type HaikuSpeakerRole =
  | 'target_woman_45_60' | 'neutral_daily' | 'young_self' | 'male_self'
  | 'parenting_current' | 'other_person_story' | 'unknown'
export type HaikuRisk =
  | 'young_self' | 'male_self' | 'parenting_current' | 'newlywed'
  | 'early_marriage_tone' // 결혼 초기/젊은 며느리·부부 톤 — 중장년 단서 부재 시 (2026-07-16 재채점 보정 3)
  | 'romance_self' | 'sexualized_age_gap'
  | 'original_cafe_context' | 'mocking_or_inside_joke' | 'stale_time'
  | 'board_mismatch' | 'thin_or_contextless'

const DECISIONS: readonly HaikuDecision[] = ['PASS', 'REJECT', 'NEEDS_REVIEW']
const SPEAKER_ROLES: readonly HaikuSpeakerRole[] = [
  'target_woman_45_60', 'neutral_daily', 'young_self', 'male_self',
  'parenting_current', 'other_person_story', 'unknown',
]
const RISKS: readonly HaikuRisk[] = [
  'young_self', 'male_self', 'parenting_current', 'newlywed',
  'early_marriage_tone',
  'romance_self', 'sexualized_age_gap',
  'original_cafe_context', 'mocking_or_inside_joke', 'stale_time',
  'board_mismatch', 'thin_or_contextless',
]

export interface HaikuQualityInput {
  cafePostId: string
  title: string
  content: string
  boardType: string
  /** 시간성 판정용 발행 시점 — 미지정 시 현재. 테스트에서 주입 */
  now?: Date
}

export interface HaikuQualityDecision {
  decision: HaikuDecision
  confidence: number
  speakerRole: HaikuSpeakerRole
  risks: HaikuRisk[]
  reason: string
}

export type HaikuQualityResult =
  | ({ haikuStatus: 'OK' | 'CACHED'; wouldReject: boolean } & HaikuQualityDecision)
  | { haikuStatus: 'ERROR'; error: string }

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function buildHaikuQualityPrompt(input: HaikuQualityInput): string {
  const now = input.now ?? new Date()
  const kst = new Date(now.getTime() + 9 * 3600_000)
  const nowLabel = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${DAYS[kst.getUTCDay()]}요일`

  return `당신은 '우나어'(40대 중반~60대 한국 여성 커뮤니티)의 편집 게이트다.
아래 커뮤니티 글 1건이 우리 독자에게 자연스럽게 읽힐지 판정하라.

[판정 순서 — 반드시 이 순서로]
1. 발화자(speakerRole) 추정: 1인칭 단서(제 나이/신혼/와이프/아이 학년/남편/손주/며느리…)를 근거로.
2. 위험 신호가 발화자 본인에게 적용되는지, 타인(성인 자녀·손주·며느리·사위·지인) 이야기인지 구분.
3. 그 다음에만 decision을 정한다.

[절대 규칙 — 단어 하나로 판단 금지]
- '와이프/아내'가 있어도 화자가 여성일 수 있다(예: "선배의 와이프분이" = 타인). 남성 1인칭 서술일 때만 male_self.
  특히 '와이프분/아내분' 같은 존칭형은 타인의 아내를 지칭하는 표현 — 남성은 자기 아내를 '와이프분'이라 부르지 않는다.
  화자의 배우자가 '남편'으로 등장하면(예: "남편도 아는 사이") 화자는 여성이다 — 이 신호가 '와이프' 단어보다 우선한다.
  male_self 판정은 명시적 남성 1인칭 서술("제 와이프가/마누라가/남자입니다/아저씨인데")이 있을 때만 허용한다.
  간접 추론만으로 남성이라 단정하지 마라 — 그 경우 speakerRole=unknown + decision=NEEDS_REVIEW.
- '아이/딸/아들'이 있어도 성인 자녀·손주·조카·지인 이야기면 정상 PASS다(other_person_story).
- 지역 언급(동네 맛집/지역 병원 후기/마트/동네 생활)은 차단 사유가 절대 아니다.
- 발화자 나이가 불명확해도 타깃 여성이 공감할 무해한 생활글(음식/날씨/살림/가전/건강 루틴)은 PASS(neutral_daily).
- 배우자/남편/시댁/친정/돈/은퇴/연금 이야기는 타깃의 핵심 관심사 — 강한 PASS 후보.
- 가족 갈등 사연(딸·며느리·사위·시댁의 차별/서운함/속상함)은 톤이 어둡거나 거칠어도 기본 PASS 후보다 —
  타깃 여성이 가장 공감하는 영역이므로 갈등 소재 자체를 차단 사유로 쓰지 마라.
- **[현재 양육 우선 규칙 — 위 가족 갈등 PASS보다 항상 우선한다(창업자 확정 2026-07-16)]**
  화자 본인이 현재 초등 이하~중등 자녀를 양육 중이라는 신호(초1~초6/초딩/초등학생/유치원/어린이집/영유아/
  구몬·학습지/등하교/학원 픽업·라이딩/돌쟁이)가 있으면, 남편·시댁·어머님 갈등 사연과 아무리 섞여 있어도
  parenting_current로 REJECT하라. 예: "남편이 어머님 모시자는데… 초1,초3 애둘 구몬하는 날" — 시댁 갈등
  서사여도 화자는 현재 초등 학부모이므로 REJECT다. 가족 갈등이라는 이유로 PASS시키지 마라.
  (성인 자녀·손주·과거 육아 회고는 해당 없음 — 현재형 본인 양육만.)
- 글에 '50살/50대/60대' 같은 타깃 연령 자기언급이 있으면 성별 불명이어도 male_self로 단정 금지 —
  타깃 공감 가능한 생활/여행/건강 질문이면 PASS.
- 단, 예외(창업자 확정): 40대 중반~60대 화자라는 근거가 전혀 없는 상태에서 "애 낳기/출산 계획/
  현재 임신/영유아 양육"이 화자 본인 일로 나오면 2030 자기발화로 간주하고 young_self 또는
  parenting_current로 강하게 REJECT하라. 애매하다고 NEEDS_REVIEW로 미루지 마라.

[REJECT 후보 — 위험이 발화자 본인일 때만 강하게]
- 본인이 20~30대/40대 초반(나이 자기언급, 신혼 자기발화 "아직 신혼이라")
- 결혼 초기/젊은 며느리·부부 톤(early_marriage_tone) — 시댁/부부/결혼 단어 자체는 타깃 핵심 관심사이므로
  절대 단독 차단하지 마라. 다만 아래가 겹치면 risk로 잡아라:
  신혼/결혼한 지 얼마 안 됨/결혼 초기·초반 자기발화, 양가·시댁 관계가 아직 낯선 톤(부부싸움을 양가에 알릴지,
  시부모님 방문에 생얼이 민망), 시부모님 음식/방문/간섭을 젊은 며느리 입장에서 현재형으로 호소 —
  그리고 40대 중반~60대 화자 단서(성인자녀/손주/오래된 부부/갱년기/노후/부모 돌봄/결혼 20~30년차 회고)가 전혀 없을 때.
  판정: 명백한 신혼·결혼 초기·젊은 며느리 자기발화면 REJECT / 단서가 약하면 NEEDS_REVIEW /
  중장년 회고·오래된 부부·성인자녀 맥락이면 PASS.
  추가 기준(창업자 확정 표본 기반):
  · early_marriage_tone risk를 달았으면 decision을 PASS로 두지 마라 — 최소 NEEDS_REVIEW다.
  · "부부싸움을 양가/시댁에 알릴지" 고민 자체가 결혼 초기 신호다 — 결혼 20~30년차는 그런 고민을 하지 않는다.
  · '나이 40 넘어서/40 되니' 같은 40대 초반 언급은 타깃(40대 중반~60대) 단서로 인정하지 마라.
  · 결혼 진입·배우자 선택 담론("결혼할 때 이게 나한테 이득이겠구나")은 결혼을 앞두거나 갓 결혼한 화자의
    성찰 톤이다 — 중장년 단서(결혼 20년차/성인자녀/손주) 없으면 early_marriage_tone으로 NEEDS_REVIEW 이상.
- 남성 본인 발화("와이프한테 한소리 들었다", "50대 남자입니다")
- 본인이 현재 영유아~중등 자녀 양육 중(어린이집/초1~초6/중등 학부모 고민, "우리 아이 품새")
- 화자 근거 없는 본인 출산 계획/임신/애 낳기 담론(예: "애 낳고 사는 거 어때보여요") → young_self/parenting_current
- 본인 연애/남친/여친/소개팅/미혼 담론(romance_self)
- 남성 욕망·젊은 여성 외모 평가 담론(예: "남자들은 어리고 예쁜 여자가 좋다") → sexualized_age_gap —
  커뮤니티 톤 불일치, 화자 성별과 무관하게 REJECT 후보
- 원 카페 내부 맥락 — 우리 사이트에서 맥락 단절 → original_cafe_context.
  호칭·맥락 신호: 원카페 회원 호칭("레테님들/레테/은오님/줌마님들"), "회원님들 중", "이 카페",
  "이전글/지난글/원글에서", "댓글 보니", "인기글에서 봤는데", 특정 회원 저격/조롱, 카페 운영 언급.
  단, 일반적인 '님' 존칭 하나만으로 잡지 마라 — 원카페 내부 맥락 신호와 결합될 때만 REJECT 또는 NEEDS_REVIEW.
- 날짜 지난 브리핑/연재/매매일지, 발행 시점과 어긋난 시간 선언
- 너무 얇거나 맥락 없는 글(펑 글, 한 줄 감탄)
애매하면 REJECT하지 말고 NEEDS_REVIEW로 넘겨라 — 좋은 일상글 과차단이 최악의 실패다.

오늘(발행 시점): ${nowLabel} / 발행 게시판: ${input.boardType}

[글]
제목: ${input.title}
본문: ${input.content.slice(0, 2000)}

아래 JSON만 출력하라. 다른 텍스트 금지.
{"decision":"PASS|REJECT|NEEDS_REVIEW","confidence":0.0,"speakerRole":"target_woman_45_60|neutral_daily|young_self|male_self|parenting_current|other_person_story|unknown","risks":["young_self|male_self|parenting_current|newlywed|early_marriage_tone|romance_self|sexualized_age_gap|original_cafe_context|mocking_or_inside_joke|stale_time|board_mismatch|thin_or_contextless"],"reason":"짧은 한국어 근거 1문장 (발화자 판정 근거 포함)"}`
}

/** 응답 텍스트에서 JSON을 추출·검증. 실패 시 null (호출부가 ERROR 처리) */
export function parseHaikuQualityDecision(response: string): HaikuQualityDecision | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  let raw: unknown
  try {
    raw = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>

  const decision = DECISIONS.find(d => d === r.decision)
  if (!decision) return null
  const speakerRole = SPEAKER_ROLES.find(s => s === r.speakerRole) ?? 'unknown'
  const risks = Array.isArray(r.risks)
    ? r.risks.filter((x): x is HaikuRisk => RISKS.includes(x as HaikuRisk))
    : []
  const confidence = typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : 0
  const reason = typeof r.reason === 'string' ? r.reason.slice(0, 200) : ''

  return { decision, confidence, speakerRole, risks, reason }
}

/** topicResults에 병합할 요약 (additive 필드) */
export function summarizeHaikuResult(r: HaikuQualityResult): Record<string, unknown> {
  if (r.haikuStatus === 'ERROR') return { haikuStatus: 'ERROR', haikuError: r.error }
  return {
    haikuStatus: r.haikuStatus,
    haikuDecision: r.decision,
    wouldReject: r.wouldReject,
    haikuSpeakerRole: r.speakerRole,
    haikuRisks: r.risks,
    haikuConfidence: r.confidence,
    haikuReason: r.reason,
  }
}
