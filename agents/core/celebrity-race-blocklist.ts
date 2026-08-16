/**
 * 실존 인물 사생활·비방 / 국적·인종 비하 blocklist (2026-08-17)
 *
 * ## 왜 이 파일이 있나
 *
 * 5개 source 확대 후 발행된 글에서 두 유형이 나왔다. 둘 다 리라이팅 결함이 아니라
 * **원문 선택 문제**였다 — 제목은 오히려 원문보다 중립적으로 정리됐는데, 그 원문이
 * 애초에 우나어에 실릴 글이 아니었다.
 *
 *   · remonterrace  실존 배우 실명("강*자님") + 외박·불륜 사생활 비평
 *   · masanmam      외국인에 대한 위생·태도 비하
 *
 * 기존 필터 중 어느 것도 이 축을 보지 않는다(실측):
 *   · age-fit-blocklist  연령·연애·육아·학생·지역거래·의료광고 축
 *   · political-blocklist 정치 축
 *   · Haiku quality gate  "발화자가 누구인가" 축 — 가족 갈등 사연은 명시적으로 PASS 후보
 *   · 전 blocklist에 외도/스캔들/인종/외국인/국적/혐오 = 0개 파일
 *
 * ## 설계 원칙 — 결합해야만 막는다
 *
 * **단독 매칭은 절대 차단하지 않는다.** 최근 14일 발행 1,353건 실측:
 *
 *   인물 지칭 단독  62건 (4.58%)   ← 단독으로 쓰면 이만큼 과차단된다
 *   스캔들 단독     12건 (0.89%)
 *   국적 지칭 단독  16건 (1.18%)
 *   비하어 단독     49건 (3.62%)
 *   ────────────────────────────
 *   결합 적용 후     5건 (0.37%)
 *
 * 과차단도 실패다. "그 배우 연기 잘하더라", "동남아 여행 후기", "며느리가 외국인인데
 * 잘 지내요"는 전부 통과해야 하는 글이다.
 *
 * ## ⚠️ 원문(CafePost) 기준으로 써야 한다
 *
 * 발행본(Post)으로 검사하면 놓친다. 실측으로 확인했다:
 *
 *   원문   "저만불쾌한가요? 80대 나이드신 여배우님" / 본문 "강*자님.."
 *          → PERSON_REF "배우님" 매칭 ✅ + SCANDAL "불륜" ✅  = 차단됨
 *   발행본 "외박 불륜 용서하고 산 게…"(리라이팅) / 본문 "강자님.."(정화로 * 소실)
 *          → PERSON_REF 미매칭 🔴 = 놓침
 *
 * 리라이팅과 본문 정화가 인물 단서를 지운다. 그래서 content-curator의
 * getReferencePosts(원문 후보 필터) 계층에서 호출한다.
 */

/**
 * 실존 인물 지칭.
 *
 * ⚠️ `배우(?!자)` — '배우자'를 잡으면 안 된다. 실측에서 "외도하는사람은 배우자가
 *    싫은걸까요?"가 오탐으로 걸렸다. 이건 우나어 타깃 정중앙 고민글이다.
 * ⚠️ 실명 마스킹형(강*자님 / 김*희씨)을 포함한다 — 카페 글에서 실존 인물을 가리키는
 *    가장 흔한 표기다.
 */
export const PERSON_REF_PATTERNS: readonly RegExp[] = [
  /(배우(?!자)|가수|탤런트|개그맨|개그우먼|아나운서|연예인|아이돌|셀럽|여배우|남배우)\s*(님|분|씨)?/,
  /[가-힣]{1,3}\s*\*{1,3}\s*[가-힣]{0,2}\s*(님|씨)/, // 강*자님 · 김*희씨
] as const

/** 사생활 스캔들 — 인물 지칭과 결합될 때만 차단한다 */
export const SCANDAL_PATTERN =
  /불륜|외도|바람\s*(피|났|폈)|이혼\s*(사유|귀책|소송)|성추문|성추행|성희롱|음주운전|마약|도박|탈세|학폭|미투|사생활\s*(폭로|논란)|양다리|내연/

/** 인신 비방 — 인물 지칭과 결합될 때만 차단한다 */
export const DEFAME_PATTERN =
  /그만\s*좀\s*나왔으면|나오지\s*(말|마)|꼴\s*보기\s*싫|보기도\s*역겹|역겹|재수\s*없|한심|위선적?|가식|나대|망언|면상/

/** 국적·인종·출신 지칭 */
export const NATIONALITY_PATTERN =
  /외국인|조선족|중국인|중국\s*사람|일본인|베트남|필리핀|동남아|흑인|백인|이슬람|무슬림|난민|이주\s*노동자|다문화|짱깨|쪽바리/

/** 위생·태도 비하 — 국적 지칭과 결합될 때만 차단한다 */
export const DEGRADE_PATTERN =
  /냄새|쉰내|악취|위생|더럽|불결|기본이\s*안\s*(된|돼|됨)|수준\s*(이하|낮)|민폐|혐오|미개|천박|무식|짐승|벌레|추방|꺼졌으면/

/**
 * 지칭어와 부정 서술이 **같은 맥락**에 있다고 볼 최대 거리(글자).
 *
 * 실측으로 정한 값이다:
 *   · masanmam "외국인…기본이 안된"      15자 → 차단되어야 한다
 *   · remonterrace "미국 살면서 느낀점"   90자 → 통과해야 한다(창업자 결정 2026-08-17)
 *     (본문에서 '백인/필리핀'은 인구 구성 설명이고 '미개'는 이민 1세대를 가리킨다 —
 *      서로 다른 대상이라 같은 맥락이 아니다)
 *
 * 60자면 두 사례가 정확히 갈린다. 긴 글에서 멀리 떨어진 단어끼리 우연히 결합해
 * 과차단되는 것을 막는 장치다.
 */
export const CONTEXT_WINDOW = 60

const flatten = (title: string, content: string): string =>
  `${title ?? ''} ${content ?? ''}`.replace(/\s+/g, ' ')

/** 패턴군의 모든 매칭 위치를 모은다 */
const allMatches = (patterns: readonly RegExp[], text: string): { word: string; at: number }[] => {
  const out: { word: string; at: number }[] = []
  for (const p of patterns) {
    const re = new RegExp(p.source, p.flags.includes('g') ? p.flags : `${p.flags}g`)
    for (let m = re.exec(text); m; m = re.exec(text)) {
      out.push({ word: m[0].trim(), at: m.index })
      if (m.index === re.lastIndex) re.lastIndex++ // 빈 매칭 방어
    }
  }
  return out
}

/**
 * 지칭어와 부정 서술이 CONTEXT_WINDOW 안에서 만나는 가장 가까운 쌍을 찾는다.
 * 멀리 떨어져 있으면 같은 맥락이 아니라고 보고 null을 돌려준다.
 */
const findNearPair = (
  refs: { word: string; at: number }[],
  negs: { word: string; at: number }[],
  titleLen: number,
): { ref: string; neg: string } | null => {
  if (negs.length === 0 || refs.length === 0) return null

  // ★ 제목에 지칭어가 있으면 그 글의 주제가 곧 그 대상이다 — 본문 어디에 부정 서술이
  //   있든 같은 맥락으로 본다. 근접성은 본문 안에서 우연히 만나는 경우를 거르는 장치이지,
  //   제목이 대상을 선언한 글까지 풀어주려는 게 아니다.
  //   (실측: "저만불쾌한가요? 80대 나이드신 여배우님" — 제목 지칭 + 본문 '불륜'이
  //    80자 넘게 떨어져 있어 근접성만으로는 놓쳤다. 이 글이 이 gate의 출발점이다.)
  const titleRef = refs.find(r => r.at < titleLen)
  if (titleRef) return { ref: titleRef.word, neg: negs[0].word }

  let best: { ref: string; neg: string; dist: number } | null = null
  for (const r of refs) {
    for (const n of negs) {
      const dist = Math.abs(r.at - n.at)
      if (dist <= CONTEXT_WINDOW && (!best || dist < best.dist)) {
        best = { ref: r.word, neg: n.word, dist }
      }
    }
  }
  return best ? { ref: best.ref, neg: best.neg } : null
}

/**
 * 실존 인물 사생활·비방 신호. 결합(지칭 + 스캔들/비방)일 때만 값을 돌려준다.
 * @returns `"CELEBRITY_SCANDAL:배우님+불륜"` 형태 또는 null
 */
export function findCelebrityScandalSignal(title: string, content: string): string | null {
  const flat = flatten(title, content)
  const persons = allMatches(PERSON_REF_PATTERNS, flat)
  if (persons.length === 0) return null // 인물 지칭 단독으로는 절대 차단하지 않는다

  const titleLen = (title ?? '').length
  const scandal = findNearPair(persons, allMatches([SCANDAL_PATTERN], flat), titleLen)
  if (scandal) return `CELEBRITY_SCANDAL:${scandal.ref}+${scandal.neg}`

  const defame = findNearPair(persons, allMatches([DEFAME_PATTERN], flat), titleLen)
  if (defame) return `CELEBRITY_DEFAME:${defame.ref}+${defame.neg}`

  return null
}

/**
 * 국적·인종 비하 신호. 결합(지칭 + 비하)일 때만 값을 돌려준다.
 *
 * ⚠️ 여행·문화·해외생활·다문화 가족 이야기는 비하어가 없어 통과한다.
 *    "미국 살면서 느낀점"(이민 1세대의 가부장성 서술)도 1차에서는 통과시킨다 —
 *    세대 차이 서술에 가깝고, 해외생활 후기까지 막으면 과차단이다.
 * @returns `"RACIAL_DEGRADE:외국인+쉰내"` 형태 또는 null
 */
export function findRacialDegradeSignal(title: string, content: string): string | null {
  const flat = flatten(title, content)
  const nations = allMatches([NATIONALITY_PATTERN], flat)
  if (nations.length === 0) return null // 국적 지칭 단독으로는 절대 차단하지 않는다

  const pair = findNearPair(nations, allMatches([DEGRADE_PATTERN], flat), (title ?? '').length)
  if (!pair) return null // 비하어 단독으로도, 멀리 떨어져 있어도 차단하지 않는다

  return `RACIAL_DEGRADE:${pair.ref}+${pair.neg}`
}

/**
 * 두 축을 한 번에 검사한다 — content-curator 후보 필터에서 쓰는 진입점.
 * @returns 매칭 사유 문자열 또는 null(통과)
 */
export function findCelebrityOrRaceViolation(title: string, content: string): string | null {
  return findCelebrityScandalSignal(title, content) ?? findRacialDegradeSignal(title, content)
}
