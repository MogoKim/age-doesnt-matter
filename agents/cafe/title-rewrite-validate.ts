/**
 * 제목 리라이팅 기계 검증 — 순수 함수 (2026-08-14, PR-D)
 *
 * ## 왜 필요한가
 *
 * M4·M4.5 두 번의 Sonnet 실행에서 **매번 사실 오류가 1건씩 나왔고, 두 번 모두**
 * 모델이 `riskFlags: NONE` + confidence 0.82~0.88로 **스스로 잡지 못했다.**
 *
 *   M4    "부모님과 절연한 지 10년"
 *         본문 ① "여전히 부모님과 절연중이며"
 *         본문 ② "저도 나와산지 10년이 넘었지만"   ← 집을 나와 산 기간이다
 *
 *   M4.5  "딸 카드값 보고 손이 떨렸어요"
 *         본문에 '카드값'도 '손이 떨렸다'도 없다 (프롬프트 예시를 그대로 차용했다)
 *
 * **모델의 자기 신고를 신뢰할 수 없다.** 그래서 기계가 한 번 더 본다.
 *
 * ## 설계 원칙
 *
 * 완벽한 검증기가 아니다. **위험한 제목을 원제목으로 되돌리는 보수적 장치**다.
 * 애매하면 통과시키지 않는다 — 잃는 것은 제목 개선 기회 하나뿐이고,
 * 통과시켰다가 틀리면 고객 신뢰가 깨진다.
 *
 * 🚫 이 검증은 **발행을 차단하지 않는다.** 실패하면 원제목으로 정상 발행된다.
 */

/** 검증 실패 사유 — 로그·집계용 */
export type TitleValidationReason =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'TOO_SHORT'
  | 'SAME_AS_ORIGINAL'
  | 'NUMBER_NOT_IN_SOURCE'
  | 'ENTITY_NOT_IN_SOURCE'
  | 'MEDICAL_ASSERTION'
  | 'BLOGGY_OR_NEWSY'
  | 'CLICKBAIT'
  | 'BANNED_WORD'
  | 'CAFE_NAME_LEAK'

/** 사람이 봐야 할 유형 — DB 필드를 만들지 않고 결과 객체·로그에만 싣는다 */
export type HumanReviewFlag =
  | 'MEDICAL'
  | 'LEGAL'
  | 'FAMILY_RUPTURE'
  | 'MONEY_OR_PERIOD'
  | 'MODEL_RISK_FLAGGED'
  | 'BORDERLINE'

export interface TitleValidationResult {
  ok: boolean
  reason: TitleValidationReason | null
  detail: string
  /** ok=true여도 채워질 수 있다. 운영 초기에는 이게 있으면 사람이 훑어본다 */
  humanReview: HumanReviewFlag[]
}

/** 최대 길이 — M5 확정 20건 평균 34.1자, 최장 52자. 80은 안전 상한이다 */
export const MAX_TITLE_LENGTH = 80
/** 8자 미만은 원제목보다 나을 수 없다 */
export const MIN_TITLE_LENGTH = 8

/** 의료 효과 단정 — 본문이 유보적인데 제목이 단정하면 광고가 된다 */
const MEDICAL_ASSERTION_PATTERN =
  /(사라졌|없어졌|치료됐|나았|완치|효과 ?(확실|만점|보장)|무조건 ?(좋|효과)|100% ?효과|낫습니다|해결됐)/

/** 의약품·시술 언급 — 단정형과 결합될 때만 문제가 된다 */
const MEDICAL_TOPIC_PATTERN =
  /마운자로|위고비|삭센다|보톡스|필러|리프팅|시술|주사|호르몬제|약물|한약|영양제|수술|성형/

/** AI 블로그체·뉴스체 */
const BLOGGY_PATTERN =
  /완벽 ?정리|총정리|한눈에|하는 \d+ ?가지|꼭 알아야|반드시 알아야|꿀팁|해결법|해결책|원인과 ?대처|대처법|노하우|비법|가이드|체크리스트|Best ?\d|TOP ?\d/i

/** 낚시 */
const CLICKBAIT_PATTERN =
  /충격|경악|반전|소름|대박 ?사건|꼭 ?보세요|안 ?보면 ?후회|모두가 ?몰랐|난리 ?났|발칵/

/** 브랜드 금지어 — CLAUDE.md 제품 규칙 */
const BANNED_WORD_PATTERN = /시니어|노인|어르신|실버|노년/

/**
 * 외부 카페 호칭 — 제목에 남으면 안 된다.
 * ⚠️ `replaceCafeReferences`가 본문·제목에서 '우갱'→'우나어'로 치환하는데,
 *   '레테'(레몬테라스)처럼 **다른 카페**를 가리키는 말까지 우나어로 바꾸면
 *   "다른 카페 글을 봤다"가 "우리 카페 글을 봤다"로 **사실이 뒤집힌다**(M4 실측).
 *   제목 단계에서는 아예 남기지 않는다.
 */
const CAFE_NAME_PATTERN = /우갱|레테|레몬테라스|우리가 ?갱년기|중년게시판|맘카페/

/** 20~30대 인터넷 말투 — 50대 커뮤니티 톤과 어긋난다(M5 #15에서 실측) */
const YOUNG_SLANG_PATTERN = /실화(예요|냐|임)|~?각\b|ㅇㅈ|ㄹㅇ|레전드|찐[이인]|극혐|오지[네구]/

/** 법률 */
const LEGAL_PATTERN = /변호사|소송|고소|고발|이혼 ?(소송|조정)|법적 ?대응|합의금|위자료/

/** 가족관계 단절 */
const FAMILY_RUPTURE_PATTERN = /절연|의절|연 ?끊|안 ?본 ?지|남남|파양|호적/

/** 숫자를 뽑는다 — 콤마·단위 제거 후 순수 숫자열만 */
function extractNumbers(s: string): string[] {
  return (s.replace(/,/g, '').match(/\d+/g) ?? []).filter(n => n.length > 0)
}

/**
 * 제목의 핵심 명사가 본문에 있는지 볼 때 쓰는 후보군.
 * 한국어 형태소 분석기를 붙이지 않는다 — 2글자 이상 한글 덩어리를 그대로 본다.
 * 조사가 붙어 다를 수 있으므로 **앞 2글자**가 원문에 있으면 통과로 친다(보수적으로 느슨하게).
 */
const CHECKED_ENTITY_PATTERN =
  /(며느리|사위|시어머니|시아버지|시누|올케|동서|형님|손주|손녀|손자|친정|시댁|남편|아내|아들|딸|조카|사돈|이모|고모|삼촌)/g

/** 나이·직업 표기 */
const AGE_JOB_PATTERN = /(\d{1,2}살|\d{1,2}세|\d0대|간호사|교사|공무원|사장님?|약사|의사|기사님?|사모님)/g

/**
 * 기계 검증 — 위험하면 원제목으로 되돌린다.
 *
 * @param rewritten 모델이 만든 제목
 * @param originalTitle 발행된 원제목
 * @param body 원문 본문 plain text
 * @param modelRiskFlags 모델이 스스로 단 riskFlags (참고만 한다 — 신뢰하지 않는다)
 */
export function validateRewrittenTitle(
  rewritten: string,
  originalTitle: string,
  body: string,
  modelRiskFlags: readonly string[] = [],
): TitleValidationResult {
  const humanReview: HumanReviewFlag[] = []
  const fail = (reason: TitleValidationReason, detail: string): TitleValidationResult =>
    ({ ok: false, reason, detail, humanReview })

  const t = (rewritten ?? '').trim()
  if (!t) return fail('EMPTY', '빈 제목')
  if (t.length > MAX_TITLE_LENGTH) return fail('TOO_LONG', `${t.length}자 — 상한 ${MAX_TITLE_LENGTH}자`)
  if (t.length < MIN_TITLE_LENGTH) return fail('TOO_SHORT', `${t.length}자 — 하한 ${MIN_TITLE_LENGTH}자`)
  if (t === originalTitle.trim()) return fail('SAME_AS_ORIGINAL', '원제목과 동일 — 바꿀 이유가 없다')

  // 근거 원본 = 본문 + 원제목. 원제목에 있던 정보는 유지해도 된다.
  //   (예: "마운자로 3펜째. (21일차)" → 3·21은 원제목에서 왔다)
  const source = `${originalTitle} ${body}`.replace(/,/g, '')

  // ── 금지어·톤 ──
  const banned = t.match(BANNED_WORD_PATTERN)
  if (banned) return fail('BANNED_WORD', `브랜드 금지어(${banned[0]})`)

  const bloggy = t.match(BLOGGY_PATTERN)
  if (bloggy) return fail('BLOGGY_OR_NEWSY', `블로그·기사체(${bloggy[0]})`)

  const slang = t.match(YOUNG_SLANG_PATTERN)
  if (slang) return fail('BLOGGY_OR_NEWSY', `20~30대 말투(${slang[0]}) — 50대 톤과 어긋난다`)

  const bait = t.match(CLICKBAIT_PATTERN)
  if (bait) return fail('CLICKBAIT', `낚시 표현(${bait[0]})`)

  const cafe = t.match(CAFE_NAME_PATTERN)
  if (cafe) return fail('CAFE_NAME_LEAK', `외부 카페 호칭(${cafe[0]}) — 치환 시 사실이 바뀐다`)

  // ── 의료 단정 ──
  const medTopic = MEDICAL_TOPIC_PATTERN.test(t)
  const medAssert = t.match(MEDICAL_ASSERTION_PATTERN)
  if (medTopic && medAssert) {
    return fail('MEDICAL_ASSERTION', `의료 효과 단정(${medAssert[0]}) — 본문 유보 표현을 유지해야 한다`)
  }
  if (medTopic) humanReview.push('MEDICAL')

  // ── 숫자 근거 ──
  // 제목에 새 숫자가 생기면 대개 환각이다. 원제목·본문 어디에도 없으면 되돌린다.
  const srcNumbers = new Set(extractNumbers(source))
  for (const n of extractNumbers(t)) {
    if (!srcNumbers.has(n)) {
      return fail('NUMBER_NOT_IN_SOURCE', `제목의 숫자 ${n}이 원문에 없다`)
    }
  }

  // ── 가족관계·나이·직업 근거 ──
  // M4의 "절연한 지 10년"은 숫자로 잡히지만, 관계 자체를 지어내는 경우도 막는다.
  for (const re of [CHECKED_ENTITY_PATTERN, AGE_JOB_PATTERN]) {
    re.lastIndex = 0
    for (let m = re.exec(t); m; m = re.exec(t)) {
      if (!source.includes(m[0])) {
        return fail('ENTITY_NOT_IN_SOURCE', `제목의 "${m[0]}"가 원문에 없다`)
      }
    }
  }

  // ── 사람 검수 신호 (통과시키되 표시한다) ──
  if (LEGAL_PATTERN.test(t)) humanReview.push('LEGAL')
  if (FAMILY_RUPTURE_PATTERN.test(t)) humanReview.push('FAMILY_RUPTURE')
  if (/\d/.test(t)) humanReview.push('MONEY_OR_PERIOD')
  if (modelRiskFlags.some(f => f && f !== 'NONE')) humanReview.push('MODEL_RISK_FLAGGED')

  return { ok: true, reason: null, detail: `검증 통과 — ${t.length}자`, humanReview }
}

// ─────────────────────────────────────────────────────────────
// P0-3 — seoDescription 검증 (2026-08-17)
//
// 왜 필요한가: 신규 발행글의 seoDescription 98%가 본문 앞부분 복사다(최근 7일 641건 실측).
//   NULL은 3.3%뿐이라 "빈칸 채우기"가 아니라 "원문 발췌를 고유 설명으로 덮어쓰기"가 목적이다.
//   따라서 이 검증의 핵심은 길이가 아니라 **원문과 얼마나 다른가**다.
//
// 설계: 제목 검증(validateRewrittenTitle)의 패턴을 최대한 재사용한다.
//   금지어·카페명·의료단정·낚시·블로그체·숫자·가족관계·나이/직업 근거는 전부 같은 상수를 쓴다.
//   새로 만드는 것은 길이·원문복사·제목중복 세 가지뿐이다.
//
// 실패해도 발행과 title 적용을 막지 않는다 — 호출부가 seoDescription만 제외한다.
// ─────────────────────────────────────────────────────────────

export type DescriptionValidationReason =
  | 'EMPTY'
  | 'DESC_TOO_SHORT'
  | 'DESC_TOO_LONG'
  | 'DESC_COPIED_FROM_SOURCE'
  | 'DESC_SAME_AS_TITLE'
  | 'NUMBER_NOT_IN_SOURCE'
  | 'ENTITY_NOT_IN_SOURCE'
  | 'MEDICAL_ASSERTION'
  | 'BLOGGY_OR_NEWSY'
  | 'CLICKBAIT'
  | 'BANNED_WORD'
  | 'CAFE_NAME_LEAK'

export interface DescriptionValidationResult {
  ok: boolean
  reason: DescriptionValidationReason | null
  detail: string
}

/**
 * 네이버·구글 스니펫이 잘리지 않는 구간. 짧으면 정보가 없고 길면 뒤가 버려진다.
 *
 * 상한 130→140 (2026-08-18, P0-4 관찰 근거): 거부 표본 10건 중 DESC_TOO_LONG 8건이
 * 전부 133~159자였고 그중 5건이 131~140 — 상한 바로 위에서 멀쩡한 후보가 잘리고,
 * 거부되면 원문 발췌가 그대로 남아 P0-3의 목적과 반대로 간다. 141~160 표본(3건)이
 * 있으므로 160까지는 열지 않는다 — 이번 완화는 140까지만이다.
 */
export const MIN_DESC_LENGTH = 70
export const MAX_DESC_LENGTH = 140

/** 원문 복사 판정에 쓰는 본문 앞부분 길이 — description은 대개 여기서 베껴진다 */
const SOURCE_HEAD_CHARS = 120

/** description 앞부분이 본문 앞부분에 그대로 들어 있으면 복사로 본다 */
const COPY_PREFIX_CHARS = 25
const COPY_LOOKUP_CHARS = 40

/** 본문 앞부분과의 어절 자카드 유사도 상한 (이상이면 재배열 수준으로 본다) */
const MAX_SOURCE_SIMILARITY = 0.6

/** 제목과의 어절 겹침 상한 (이상이면 같은 문장 반복으로 본다) */
const MAX_TITLE_OVERLAP = 0.8

const normalize = (s: string): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** 2글자 이상 어절만 남긴다 — 조사·한 글자는 노이즈라 유사도를 왜곡한다 */
function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/[\s,.!?~…·"'()\[\]]+/)
      .map(w => w.replace(/[^0-9A-Za-z가-힣]/g, ''))
      .filter(w => w.length >= 2),
  )
}

/** |A∩B| / |A| — description이 대상 텍스트에 얼마나 잠겨 있는지 */
function containmentRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  return hit / a.size
}

/**
 * seoDescription 기계 검증. 실패하면 seoDescription을 쓰지 않고 기존 값을 유지한다.
 *
 * @param description 모델이 만든 설명문
 * @param newTitle    같은 응답에서 나온 제목(또는 KEEP 시 원제목) — 반복 방지용
 * @param originalTitle 발행된 원제목 (숫자·엔티티 근거에 포함)
 * @param body        원문 본문 plain text
 */
export function validateSeoDescription(
  description: string,
  newTitle: string,
  originalTitle: string,
  body: string,
): DescriptionValidationResult {
  const fail = (reason: DescriptionValidationReason, detail: string): DescriptionValidationResult =>
    ({ ok: false, reason, detail })

  const d = normalize(description)
  if (!d) return fail('EMPTY', '빈 설명문')
  if (d.length < MIN_DESC_LENGTH) return fail('DESC_TOO_SHORT', `${d.length}자 — 하한 ${MIN_DESC_LENGTH}자`)
  if (d.length > MAX_DESC_LENGTH) return fail('DESC_TOO_LONG', `${d.length}자 — 상한 ${MAX_DESC_LENGTH}자`)

  // ── 금지어·톤 (제목 검증과 동일 상수 재사용) ──
  const banned = d.match(BANNED_WORD_PATTERN)
  if (banned) return fail('BANNED_WORD', `브랜드 금지어(${banned[0]})`)

  const cafe = d.match(CAFE_NAME_PATTERN)
  if (cafe) return fail('CAFE_NAME_LEAK', `외부 카페 호칭(${cafe[0]})`)

  const bloggy = d.match(BLOGGY_PATTERN)
  if (bloggy) return fail('BLOGGY_OR_NEWSY', `블로그·기사체(${bloggy[0]})`)

  const slang = d.match(YOUNG_SLANG_PATTERN)
  if (slang) return fail('BLOGGY_OR_NEWSY', `20~30대 말투(${slang[0]})`)

  const bait = d.match(CLICKBAIT_PATTERN)
  if (bait) return fail('CLICKBAIT', `낚시 표현(${bait[0]})`)

  if (MEDICAL_TOPIC_PATTERN.test(d)) {
    const medAssert = d.match(MEDICAL_ASSERTION_PATTERN)
    if (medAssert) return fail('MEDICAL_ASSERTION', `의료 효과 단정(${medAssert[0]})`)
  }

  // ── 사실 근거 (제목 검증과 동일 로직) ──
  const source = `${originalTitle} ${body}`.replace(/,/g, '')
  const srcNumbers = new Set(extractNumbers(source))
  for (const n of extractNumbers(d)) {
    if (!srcNumbers.has(n)) return fail('NUMBER_NOT_IN_SOURCE', `설명문의 숫자 ${n}이 원문에 없다`)
  }
  for (const re of [CHECKED_ENTITY_PATTERN, AGE_JOB_PATTERN]) {
    re.lastIndex = 0
    for (let m = re.exec(d); m; m = re.exec(d)) {
      if (!source.includes(m[0])) return fail('ENTITY_NOT_IN_SOURCE', `설명문의 "${m[0]}"가 원문에 없다`)
    }
  }

  // ── ★ 원문 복사 (P0-3의 존재 이유) ──
  const bodyHead = normalize(body).slice(0, SOURCE_HEAD_CHARS)
  const prefix = d.slice(0, COPY_PREFIX_CHARS)
  if (prefix.length >= COPY_PREFIX_CHARS && bodyHead.slice(0, COPY_LOOKUP_CHARS).includes(prefix.slice(0, 20))) {
    return fail('DESC_COPIED_FROM_SOURCE', '본문 첫 문장을 그대로 옮겼다')
  }
  const sim = containmentRatio(tokenize(d), tokenize(bodyHead))
  if (sim >= MAX_SOURCE_SIMILARITY) {
    return fail('DESC_COPIED_FROM_SOURCE', `본문 앞부분과 어절 유사도 ${(sim * 100).toFixed(0)}% — 재배열 수준`)
  }

  // ── 제목 반복 ──
  const titleOverlap = containmentRatio(tokenize(d), tokenize(newTitle))
  if (titleOverlap >= MAX_TITLE_OVERLAP) {
    return fail('DESC_SAME_AS_TITLE', `제목과 어절 ${(titleOverlap * 100).toFixed(0)}% 중복 — 같은 문장 반복`)
  }

  return { ok: true, reason: null, detail: `검증 통과 — ${d.length}자` }
}
