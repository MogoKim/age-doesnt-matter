/**
 * 원문 사이트명/카페 호칭 정규화 — 순수 모듈 (DB/SDK 의존 없음, vitest 직접 로드).
 * P0 출처 노출 제거 (2026-07-16 창업자 승인 PR-A). 발행 직전에만 적용 — CafePost/시트 원본 보존.
 */
/** 정규화 결과 */
export interface NormalizedSourceResult {
  text: string
  /** [원문 조각, 치환 결과] — 관측/디버깅용 */
  replacements: Array<[string, string]>
  /** D유형(원글/이전글/이 카페/댓글 보니) 맥락 의존 신호 — 치환하지 않고 기록만.
   *  차단 판단은 Haiku original_cafe_context / rule gate 몫 (이번 PR에서 차단 확장 금지) */
  flags: string[]
}

/**
 * 원문 사이트명/카페 호칭을 우나어 문맥으로 정규화 — 발행 직전에만 적용, CafePost 원본 DB 보존.
 * 적용 순서: A 출처 문구 일반화 → C 회원 호칭 → B 사이트명 단독. D유형은 flag만.
 * 절대 규칙: 숫자 82 단독·82세/82년생/82만원 불변, '동네 카페/카페라떼' 불변,
 *   '회원님들' 단독 불변(우나어 내부에서도 자연스러움 — 외부명 결합 시에만 치환),
 *   HUMOR 출처 문구는 삭제하지 않고 '출처: 온라인 커뮤니티'로 일반화만.
 * 30일 2,658건 dry-run: 치환 233건·오치환 0 (2026-07-16 감사)
 */
export function normalizeSourceReferences(text: string): NormalizedSourceResult {
  const replacements: Array<[string, string]> = []
  let t = text
  const apply = (re: RegExp, to: string) => {
    t = t.replace(re, m => {
      if (m !== to) replacements.push([m, to])
      return to
    })
  }
  // A. 출처 문구 — 외부 커뮤니티명을 일반화 (문구 자체는 유지)
  apply(/출처\s*:\s*(펨코|fmkorea|82\s?cook|82\s?쿡|네이버\s?카페|네이버\s?뿜|레몬테라스|오늘의유머|네이트판|bboom|뿜|와이고수|더쿠|인스티즈)/gi, '출처: 온라인 커뮤니티')
  // C. 원카페 회원 호칭 — 외부명과 결합된 경우만 ('회원님들' 단독은 불변)
  apply(/(은오|우갱|레테|줌마렐라|82\s?쿡|82\s?cook|82)\s?(선배님들|회원님들|님들|분들|언니들|여러분)/gi, '우나어 분들')
  apply(/(은오|우갱|레테|줌마렐라|82\s?쿡|82\s?cook)\s?님/g, '우나어 분')
  // B. 사이트명 단독 — 82는 쿡/cook 결합일 때만 (숫자 82 단독 치환 절대 금지)
  apply(/우아한\s?갱년기|은퇴\s?후\s?50년/g, '우나어')
  apply(/레몬테라스|줌마렐라|줌말레라/g, '우나어')
  apply(/82\s?쿡|82\s?cook/gi, '우나어')
  apply(/네이버\s?카페/g, '온라인 커뮤니티') // '우나어' 자기지칭은 어색 — 일반화
  apply(/은오|우갱/g, '우나어')
  // '레테' 단독 — 카페라테/라테/레테랑 등 오치환 가드 (한글 낱말 경계)
  apply(/(?<![가-힣a-zA-Z])레테(?![랑떼])/g, '우나어')

  const flags: string[] = []
  for (const [name, re] of [
    ['원글', /원글/],
    ['이전글/지난글', /이전\s?글|지난\s?글/],
    ['이/우리 카페', /이\s카페|우리\s카페/],
    ['댓글보니/인기글', /댓글\s?보니|인기글에서/],
  ] as Array<[string, RegExp]>) {
    if (re.test(t)) flags.push(name)
  }
  return { text: t, replacements, flags }
}

