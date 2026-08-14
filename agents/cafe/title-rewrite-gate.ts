/**
 * 제목 리라이팅 후보 gate — 순수 함수 (2026-08-14)
 *
 * ⚠️ **아직 어디에도 연결되지 않았다.** content-curator·popular-curator 모두 미호출.
 *   이 파일을 추가해도 고객 화면·발행 동작은 바이트 단위로 동일하다.
 *
 * 역할: Sonnet 제목 리라이팅을 호출하기 **전에** "돈 쓸 자격이 있는 글"만 통과시킨다.
 *   실측(2026-08-14 발행 652건 분류): 33%가 리라이팅 대상이 아니었고
 *   28%는 본문 80자 미만이라 리라이팅 재료 자체가 없었다.
 *   앞단에서 거르지 않으면 비용도 낭비하고, 나쁜 글에 좋은 제목을 붙여 더 퍼뜨리게 된다.
 *
 * 🚫 이 gate는 **발행을 차단하지 않는다.** 제외된 글도 정상 발행되며 제목만 원문 그대로 나간다.
 *   발행 차단은 Haiku quality gate(haiku-quality-gate.ts)의 역할이고 이 파일과 무관하다.
 *
 * 1차 운영 범위: wgang 단독.
 *   근거(실측) — REJECT 필요 글 0건 · 본문 중앙 199자 · 우리 나이 신호 40%(5개 소스 중 최고)
 *   · 발행 사용률 43% · 하루 리라이팅 대상 약 22건(월 Sonnet 비용 $9 미만).
 */
import { SHADOW_CAFE_IDS } from './config.js'
// ⚠️ author 판정만 재사용한다. findMedicalAdSignal(본문 결합형)은 여우야 저장 차단 전용이라
//   후보 gate에서는 쓰지 않는다 — 회원 개인의 병원비·건강 고민을 광고로 오인했다(실측 오탐 3/3).
import { findMedicalAuthorSignal } from '../core/age-fit-blocklist.js'
import {
  ACADEMIC_CONTEXT_PATTERN,
  AD_STRONG_PATTERNS,
  AD_WEAK_CONTEXT,
  AD_WEAK_PATTERN,
  ADULT_RELATION_PATTERN,
  CHILD_SOFT_PATTERN,
  COMMERCIAL_CONTEXT_PATTERN,
  ENTERTAINMENT_PATTERN,
  MALE_SELF_PATTERNS,
  MEDICAL_PROCEDURE_PATTERN,
  MEDICAL_PROMO_CONTEXT_PATTERN,
  MIN_BODY_LENGTH_FOR_REWRITE,
  NEWS_CONTEXT_PATTERN,
  NEWS_MARK_PATTERN,
  NEWS_PRESS_PATTERN,
  OUR_AGE_TOPIC_PATTERN,
  PARENTING_CONTEXT_PATTERN,
  PARENTING_SCHOOL_CONTEXT_PATTERN,
  PARENTING_STRONG_PATTERNS,
  PAST_RECALL_PATTERN,
  PREGNANCY_FIRST_PERSON,
  PREGNANCY_PATTERN,
  ADULT_CHILD_PATTERN,
  PROFESSION_PATTERN,
  GRADE_PAST_SUFFIX_PATTERN,
  SCHOOL_GRADE_PATTERN,
  SELF_MIDDLE_AGE_PATTERN,
  YOUNG_ROMANCE_OWN_PATTERN,
  YOUNG_SELF_AGE_PATTERN,
  YOUNG_SELF_STAGE_PATTERN,
  type RewriteGateResult,
} from './title-rewrite-rules.js'

/**
 * 1차 limited 대상 source. 확대는 검수 PASS 후 별도 판단한다.
 * ⚠️ yeowooya는 넣지 않는다 — shadow 관찰 중이고 본문 중앙값이 26자라 재료가 없다.
 */
export const TITLE_REWRITE_SOURCES: readonly string[] = ['wgang'] as const

/** gate 입력 — DB 모델에 의존하지 않는 최소 형태(테스트·오프라인 평가에서 그대로 쓴다) */
export interface RewriteGateInput {
  cafeId: string
  title: string
  /** 본문 plain text. HTML이면 호출부가 태그를 벗겨서 넘긴다 */
  content: string
  author?: string | null
  isUsable?: boolean
  commentCrawled?: boolean
  commentCount?: number
  /** psych-analyzer 결과 — 있으면 보호 신호 판정에 함께 쓴다 (채움률 실측 98%) */
  desireCategory?: string | null
  emotionTags?: readonly string[]
  psychInsight?: string | null
}

/** 본문 길이는 공백 정규화 후 센다 — 원문에 공백·개행이 과다한 카페가 있다 */
function normalizedLength(s: string): number {
  return s.replace(/\s+/g, ' ').trim().length
}

const reject = (reason: RewriteGateResult['reason'], detail: string): RewriteGateResult =>
  ({ eligible: false, reason, detail, signals: [] })

/**
 * 현재형 학년 표기를 찾는다. 뒤에 '때·시절'이 붙은 과거 회상은 건너뛴다.
 * 본문에 여러 학년이 나올 수 있어(예: "고3때보다 힘든 대2 딸") 전부 훑는다.
 */
function findCurrentSchoolGrade(flat: string): string | null {
  const re = new RegExp(SCHOOL_GRADE_PATTERN.source, 'g')
  for (let m = re.exec(flat); m; m = re.exec(flat)) {
    const tail = flat.slice(m.index + m[0].length, m.index + m[0].length + 3)
    if (!GRADE_PAST_SUFFIX_PATTERN.test(tail)) return m[0]
  }
  return null
}

/**
 * 보호 신호 수집 — 제외 판정과 무관하게, 통과한 글이 왜 좋은지 검수자에게 알려준다.
 * desire/emotion/insight가 있으면 함께 본다(제목만 보고 판단하지 않는다).
 */
function collectSignals(input: RewriteGateInput, flat: string): string[] {
  const s: string[] = []
  if (ADULT_RELATION_PATTERN.test(flat)) s.push('성인관계')
  if (OUR_AGE_TOPIC_PATTERN.test(flat)) s.push('우리나이주제')
  if (ENTERTAINMENT_PATTERN.test(flat)) s.push('연예방송')
  if (input.desireCategory) s.push(`desire:${input.desireCategory}`)
  if (input.emotionTags?.length) s.push(`emotion:${input.emotionTags.slice(0, 2).join('/')}`)
  if ((input.commentCount ?? 0) >= 5) s.push(`댓글${input.commentCount}`)
  return s
}

/**
 * 제목 리라이팅 후보인지 판정한다. 순수 함수 — DB·네트워크 접근 없음.
 *
 * 판정 순서 (앞에서 걸리면 즉시 제외)
 *   1) source        wgang 아니면 제외 · shadow는 별도 사유로 제외
 *   2) 기본 게이트    isUsable=false / 본문 80자 미만
 *   3) 광고·의료광고  ★ author 우선 · 시술·전문직은 상업 맥락 결합 시에만
 *   4) 뉴스 스크랩
 *   5) 학령기 육아    ★ 성인 관계축이 있으면 살린다 · 중·고는 입시 맥락 결합 시에만
 *   6) 화자 이탈      ★ 1인칭 자기지시 결합 · 중년 신호/과거 회상이면 무효
 *
 * ★ [PR-E 2026-08-14] 판정을 "단어 매칭"에서 "화자 귀속"으로 옮겼다.
 *   M3 wgang 실측에서 오탐 20건(전체의 5%)이 나왔고 그중 YOUNG_SELF가 11/11(100%)이었다.
 *   전부 나이·연애 표현이 **타인·과거·비교** 맥락인데 화자 본인으로 오인한 것이었다.
 *   자세한 사례는 title-rewrite-rules.ts의 화자 귀속 섹션에 남겼다.
 */
export function evaluateTitleRewriteCandidate(input: RewriteGateInput): RewriteGateResult {
  const flat = `${input.title} ${input.content}`.replace(/\n/g, ' ')

  // ── 1) source ──
  if (SHADOW_CAFE_IDS.includes(input.cafeId)) {
    return reject('SHADOW_SOURCE', `${input.cafeId}는 shadow 관찰 중 — 리라이팅 대상 아님`)
  }
  if (!TITLE_REWRITE_SOURCES.includes(input.cafeId)) {
    return reject('NOT_TARGET_SOURCE', `${input.cafeId}는 1차 limited 대상(${TITLE_REWRITE_SOURCES.join(',')}) 밖`)
  }

  // ── 2) 기본 게이트 ──
  if (input.isUsable === false) return reject('NOT_USABLE', 'isUsable=false')
  const len = normalizedLength(input.content)
  if (len < MIN_BODY_LENGTH_FOR_REWRITE) {
    return reject('BODY_TOO_SHORT', `본문 ${len}자 — 리라이팅 재료 부족(기준 ${MIN_BODY_LENGTH_FOR_REWRITE}자). 발행은 그대로 된다`)
  }

  // ── 3) 광고·의료광고 ──
  // ★ author 기반이 1순위다. "누가 썼나"가 "무슨 단어를 썼나"보다 정확하다(여우야 사고의 교훈).
  const medicalAuthor = findMedicalAuthorSignal(input.author)
  if (medicalAuthor) return reject('MEDICAL_AD', medicalAuthor)

  // 시술 어휘는 홍보 구조와 결합될 때만. 회원의 시술 고민·병원비 걱정은 살린다.
  const proc = flat.match(MEDICAL_PROCEDURE_PATTERN)
  if (proc && MEDICAL_PROMO_CONTEXT_PATTERN.test(flat)) {
    return reject('MEDICAL_AD', `시술 홍보 구조(${proc[0]}+예약/상담 유도)`)
  }

  for (const re of AD_STRONG_PATTERNS) {
    const m = flat.match(re)
    if (m) return reject('AD_OR_EVENT', `운영성 강신호(${m[0].slice(0, 20)})`)
  }
  // 전문직 명칭은 상업 유치 맥락과 결합될 때만. "변호사 알아봐야 하나"는 당사자의 고민이다.
  const prof = flat.match(PROFESSION_PATTERN)
  if (prof && COMMERCIAL_CONTEXT_PATTERN.test(flat)) {
    return reject('AD_OR_EVENT', `전문직+상업유치(${prof[0]})`)
  }
  const weak = flat.match(AD_WEAK_PATTERN)
  if (weak && AD_WEAK_CONTEXT.test(flat)) {
    return reject('AD_OR_EVENT', `이벤트 약신호+참여맥락(${weak[0]})`)
  }

  // ── 4) 뉴스 스크랩 ──
  const mark = flat.match(NEWS_MARK_PATTERN)
  if (mark) return reject('NEWS_SCRAP', `스크랩 표기(${mark[0]})`)
  const press = flat.match(NEWS_PRESS_PATTERN)
  if (press && NEWS_CONTEXT_PATTERN.test(flat)) {
    return reject('NEWS_SCRAP', `언론사+기사표기(${press[0]})`)
  }

  // ── 5) 학령기 육아 ──
  // ★ 성인 관계축이 함께 있으면 살린다. Haiku gate 감사에서 "시누·시댁·남편" 관계글이
  //   parenting으로 잘못 잡힌 사례가 있었다 — 같은 실수를 반복하지 않는다.
  //   단, 제목 자체에 학령기 표현이 있으면 그건 육아글이 맞다.
  const hasAdultRelation = ADULT_RELATION_PATTERN.test(flat)
  // ★ 성인 자녀 신호가 있으면 학령기 판정을 통째로 건너뛴다.
  //   실측 오탐 4건이 전부 이 유형이었다(군 복무·대학생·"다 키우고 나니").
  const hasAdultChild = ADULT_CHILD_PATTERN.test(flat)
  if (!hasAdultChild) {
    for (const re of PARENTING_STRONG_PATTERNS) {
      const m = flat.match(re)
      if (!m) continue
      const inTitle = re.test(input.title)
      if (hasAdultRelation && !inTitle) break // 관계글로 보고 살린다
      return reject('PARENTING_CURRENT', `학령기 육아(${m[0]})`)
    }
    // ★ 중·고 학년 표기는 입시·성적 관리 맥락과 결합될 때만 제외한다(창업자 결정 2026-08-14).
    //   `고3이가 두 달째 말을 안 한다`(관계) · `고등학생 부비동염 수술`(건강)은 살린다.
    //   학년 뒤에 '때·시절'이 붙으면 과거 회상이라 현재 학령기 자녀가 아니다.
    const currentGrade = findCurrentSchoolGrade(flat)
    if (currentGrade && (ACADEMIC_CONTEXT_PATTERN.test(flat) || PARENTING_CONTEXT_PATTERN.test(flat))) {
      return reject('PARENTING_CURRENT', `학령기 학년+양육/입시 맥락(${currentGrade})`)
    }
    const child = flat.match(CHILD_SOFT_PATTERN)
    if (child) {
      // 학교 일과는 강한 신호 — 성인 관계축이 있어도 살리지 않는다
      const school = flat.match(PARENTING_SCHOOL_CONTEXT_PATTERN)
      if (school) return reject('PARENTING_CURRENT', `자녀+학교일과(${school[0]})`)
      if (PARENTING_CONTEXT_PATTERN.test(flat) && !hasAdultRelation) {
        return reject('PARENTING_CURRENT', `자녀+양육 맥락(${child[0]})`)
      }
    }
  }

  // ── 6) 화자 이탈 — ★ 화자 귀속을 먼저 본다 ──
  // 중년 자기신호나 과거 회상이 있으면 20~30대 표현이 나와도 화자 본인의 현재가 아니다.
  const selfMiddleAge = SELF_MIDDLE_AGE_PATTERN.test(flat)
  const pastRecall = PAST_RECALL_PATTERN.test(flat)
  if (!selfMiddleAge) {
    const age = flat.match(YOUNG_SELF_AGE_PATTERN)
    if (age && !pastRecall) return reject('YOUNG_SELF', `본인 20~30대 자기지시(${age[0].slice(0, 20)})`)

    const stage = flat.match(YOUNG_SELF_STAGE_PATTERN)
    if (stage && !pastRecall) return reject('YOUNG_SELF', `20~30대 생애사건(${stage[0].slice(0, 16)})`)

    const preg = flat.match(PREGNANCY_PATTERN)
    if (preg && PREGNANCY_FIRST_PERSON.test(flat)) {
      return reject('YOUNG_SELF', `본인 임신·출산(${preg[0]})`)
    }
    const romance = flat.match(YOUNG_ROMANCE_OWN_PATTERN)
    if (romance && !pastRecall) return reject('YOUNG_SELF', `본인 연애(${romance[0].slice(0, 16)})`)
  }

  for (const re of MALE_SELF_PATTERNS) {
    const m = flat.match(re)
    if (m) return reject('MALE_SELF', `남성 화자 신호(${m[0].slice(0, 16)})`)
  }

  return {
    eligible: true,
    reason: null,
    detail: `후보 통과 — 본문 ${len}자`,
    signals: collectSignals(input, flat),
  }
}

/** 여러 건을 한 번에 분류한다. 오프라인 평가·검수표 생성용. */
export function partitionTitleRewriteCandidates<T extends RewriteGateInput>(
  rows: readonly T[],
): { eligible: T[]; excluded: { row: T; result: RewriteGateResult }[] } {
  const eligible: T[] = []
  const excluded: { row: T; result: RewriteGateResult }[] = []
  for (const row of rows) {
    const result = evaluateTitleRewriteCandidate(row)
    if (result.eligible) eligible.push(row)
    else excluded.push({ row, result })
  }
  return { eligible, excluded }
}
