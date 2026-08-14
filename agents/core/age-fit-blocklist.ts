/**
 * 발화자 연령/타깃 부적합 hard block (룰 기반 — AI 미사용).
 *
 * 우나어 타깃 = 40대 중반~60대 여성. 발화자가 명백히 이 타깃이 아닌 글
 * (젊은 연령 자기소개·저연령 육아·입시 학부모·미혼 연애)을 Haiku 이전 단계에서 기계적으로 차단한다.
 *
 * ⚠️ 핵심 원칙: "단어"가 아니라 "발화자 정체"를 본다. 아래는 모두 **허용**한다:
 *      - "20대 아들이 취직을 했어요" / "29살 딸이 남친을 데려왔어요"   (자녀 언급)
 *      - "손주 어린이집 데려다주고 왔어요"                              (조부모 시점)
 *      - "출산한 지 30년 만에 딸이 결혼해요" / "임신인 줄 알았는데 폐경" (과거 회상·갱년기)
 *      - "학원 그만둔 지 30년" / "남편이 학원 강사"                     (직업·과거 맥락)
 *      - "고등학교 동창을 만났어요"                                     (회상)
 *      - "50대 워킹맘 고민" / "50대 여자인데 다이어트"                   (타깃 본인)
 *    차단하는 건 오직 "발화자가 젊은 세대/저연령 자녀 양육자로 보이는 신호"다.
 *
 * ⚠️ bare 단어(배우자·워킹맘·학원·고등학교) 단독 매칭 절대 금지 — 반드시 결합 패턴 또는
 *    소거(EXCLUDE) 선처리 후 매칭. 애매한 톤은 여기서 막지 않고 Haiku 단계로 남긴다.
 *
 * ⚠️ founder 관리: 차단 키워드/패턴을 아래 카테고리별 상수에 추가/수정한다.
 *    이 한 곳만 고치면 crawler(SECONDARY 크롤 필터)와 content-curator(발행 게이트)에 즉시 반영된다.
 */

// ── 0) 오탐 소거 패턴 — 위반 검사 전에 텍스트에서 제거한다 (자녀/손주/회상/직업 맥락) ──
export const AGE_FIT_EXCLUDE_PATTERNS: readonly RegExp[] = [
  // 자녀·타인의 연령 언급 ("20대 아들", "30대 아들이 아직 독립을", "29살 딸")
  /[123]0대 ?(초반|중반|후반)? ?(아들|딸|자녀|자식|애들?|아이|조카|손주|손녀|후배|직원|알바|막내)/g,
  /(1[0-9]|2[0-9]|3[0-9]) ?살 ?(된 ?)?(아들|딸|자녀|자식|애|아이|조카|손주|손녀)/g,
  // 자녀·조카의 연애 상대 ("딸이 남친을", "아들 여친이")
  /(아들|딸|자녀|자식|조카|손주|손녀)(이|가|의)? ?(남친|여친|남자친구|여자친구)/g,
  // 과거 출산·임신 회상, 사회 담론, 갱년기 문맥
  /출산(한 ?지|하고 ?나서|했을 ?때|한 ?후)|출산율|출산 ?장려|저출산/g,
  /임신(한 ?줄|인 ?줄|했을 ?때|기 ?때|중이던)/g,
  // 직업·과거 맥락의 학원/교육 시설
  /학원 ?(그만둔|끊은|접은|다니던) ?지|학원 ?(차리|운영|강사|원장|버스)/g,
  /(고등학교|중학교|초등학교) ?(동창|친구|동기|시절|때|졸업)/g,
  // 조부모 시점의 저연령 시설·육아 (손주 문맥)
  /손주(들)?.{0,15}(어린이집|유치원|아기|이유식|돌잔치)|(어린이집|유치원).{0,10}손주/g,
] as const

// ── 1) AGE — 발화자 연령 자기언급 미스매치 (10~30대 초중반 자기소개) ──
export const AGE_SELF_MISMATCH_PATTERNS: readonly RegExp[] = [
  // "20대초부터", "20대 초반인데", "30대 초반 여자입니다" — 서술 결합형
  /(?<![0-9가-힣])(10대|20대 ?(초반?|중반|후반)?|30대 ?(초반?|중반)?)(?=인데|이에요|예요|에요|입니다|이구요|이고|라서|부터|인 ?여자|인 ?저|중반인|초반인| ?여자입니다| ?여성입니다)/,
  // "23살인데", "31살 여자" — 나이 자기언급 (34살까지)
  /(?<![0-9])(1[0-9]|2[0-9]|3[0-4]) ?살(?=인데|이에요|이라|입니다| ?여자| ?여성| ?직장인)/,
  // "35-45세" 같은 젊은 범위 명시 (하한이 30대인 범위)
  /3[0-9] ?[-~] ?4[0-9] ?세/,
  // 미혼 자기소개
  /미혼(인데|이라|입니다|이에요| ?여성| ?여자)|비혼(인데|이라|입니다)/,
] as const

// ── 2) PARENT — 저연령 자녀 육아 (crawler SHADOW_AGE_HARD_REJECT와 단일 진실 공유) ──
// crawler passesShadowAgeFilter 는 이 배열을 그대로 사용(소거 없이 보수적),
// curator 는 위 EXCLUDE 소거 후 사용(정밀). 값 수정 시 양쪽 모두에 반영된다.
export const PARENTING_HARD_KEYWORDS: readonly string[] = [
  '임신', '출산', '산후', '신생아', '아기', '돌잔치', '이유식', '기저귀',
  '어린이집', '유치원', '유아', '초등학생', '초등', '워킹맘 복직',
  '등하원', '등원시키', // 2026-07-11 추가 — 24h 톤 감사에서 확인된 누수 계열
  '초산', // 2026-07-12 추가 — 맘카페 온보딩 사전조사("초산모님들 나이가…"). '산후'는 산후도우미를 부분 매칭으로 이미 커버.
] as const

// ── 3) STUDENT — 입시·학원 학부모 (단독 단어 금지 — 결합 패턴만) ──
export const STUDENT_COMBO_PATTERNS: readonly RegExp[] = [
  /고[123] ?(딸|아들|아이|애|자녀)/,
  /(중간|기말)고사 ?(준비|기간|끝|성적|공부)/,
  /(수능|입시) ?(준비|공부|스트레스|설명회|얼마 ?안)/,
  /학부모 ?(모임|상담|총회|참관|면담)/,
  /특별전형/,
  /(딸|아들|애|아이) ?(학원|과외) ?(보내|다니|숙제|픽업|라이딩)/,
  /(남아|여아|아들|딸|아이|애) ?사춘기|사춘기 ?(남아|여아|아들|딸|아이|애|팬티|자녀)/, // 2026-07-12 — "남아 사춘기 팬티" 계열 (단독 '사춘기'는 갱년기 비유 오탐 위험이라 결합만)
] as const

// ── 4) ROMANCE — 미혼·연애 (발화자 본인의 연애 신호) ──
export const ROMANCE_KEYWORDS: readonly string[] = [
  '소개팅', '결혼정보회사', '결혼정보 업체', '혼수 준비', '상견례 준비',
  '남친이', '남친과', '남친랑', '여친이', '여친과', '여친랑',
  '남자친구가', '남자친구랑', '남자친구와', '여자친구가', '여자친구랑',
] as const

// ── 5) TRADE — 지역 거래/홍보/공구/동네 Q&A (2026-07-12, 맘카페 온보딩 대비 — cafeId 무관 전역) ──
// 우나어는 전국 독자 커뮤니티 — 특정 지역 시설 추천 Q&A·중고 거래·공구·체험단 글은 발행 부적합.
// ⚠️ bare 단어 금지: '분양'(아파트 분양=LIFE2 정보글)·'공구'(연장)·'나눔'(이웃 정) → 결합 패턴만.
export const LOCAL_TRADE_KEYWORDS: readonly string[] = [
  '삽니다', '팝니다', '구해요', '구합니다', '판매합니다', '판매해요',
  '공동구매', '체험단', '나눔합니다', '무료나눔',
] as const
export const LOCAL_TRADE_PATTERNS: readonly RegExp[] = [
  /(햄스터|강아지|고양이|앵무|토끼|병아리|물고기) ?분양|분양(해요|합니다|받으실 ?분)/, // 동물 분양 (아파트 분양 미해당)
  /공구 ?(해요|합니다|모집|진행|링크|오픈)/,                                            // 공동구매 (연장 '공구' 미해당)
  /(병원|의원|치과|한의원|소아과|학원|맛집|미용실|네일|숙소|산후조리원|업체)[가-힣 ]{0,12}(추천|어디|잘하는|괜찮은 ?곳|어때요|어떤가요)/, // 지역 시설 Q&A (사이 수식어 허용: "병원 정신의학과 어때요")
  /잘하는 ?곳 ?(추천|어디|있|아시)/, // 시설명 없이도 "잘하는곳 추천" 자체가 지역 Q&A 신호 ("임플란트 잘하는곳 추천")
] as const
export function findLocalTradeSignal(title: string, content: string): string | null {
  const flat = `${title} ${content}`.replace(/\n/g, ' ')
  for (const k of LOCAL_TRADE_KEYWORDS) if (flat.includes(k)) return `TRADE:${k}`
  for (const re of LOCAL_TRADE_PATTERNS) {
    const m = flat.match(re)
    if (m) return `TRADE:${m[0]}`
  }
  return null
}

// ── 6) MEDICAL_AD — 병원 홍보/의료광고/단축링크 (2026-08-14, 뷰티 카페 온보딩 대비 — cafeId 무관 전역) ──
// 배경: 성형/뷰티 카페는 글마다 "게시판 안내" 박스와 *의료광고 배너를 자동 삽입한다. 회원이 쓴 본문이
//       아니라 카페가 끼워 넣는 홍보 블록이므로, 이게 우리 DB·발행 글에 들어오면 커뮤니티 신뢰가 무너진다.
//
// ⚠️ 핵심 원칙: "시술 단어"가 아니라 "광고 구조"를 본다. 아래는 모두 **허용**한다:
//      - "병원 다녀왔는데 갱년기래요"          (경험담 — P2 정희씨 핵심 주제)
//      - "피부가 푸석해서 고민이에요"           (자기관리 고민)
//      - "보톡스 고민 중인데 무서워요"          (시술 고민 = 우리가 원하는 대화)
//      - "화장품 바꿨는데 괜찮네요"             (후기)
//      - "나이 드니까 얼굴살이 빠지는 것 같아요" (외모 변화에 대한 마음)
//    차단하는 건 오직 "광고임을 드러내는 구조적 신호"다 — 의료광고 라벨·게시판 안내 박스·
//    단축 URL·시술명+가격/이벤트/예약 결합.
//
// ⚠️ bare 단어(보톡스·병원·필러·리프팅) 단독 매칭 절대 금지 — 반드시 광고 신호와 결합.

/** 광고임이 문서 구조로 확정되는 신호. 1개만 걸려도 광고로 본다. */
export const MEDICAL_AD_STRONG_PATTERNS: readonly RegExp[] = [
  /\*\s*의료광고/,                          // 네이버가 법적 표기로 강제하는 배너 라벨 — 가장 확실
  /게시판 ?안내를 ?확인해 ?주세요/,          // 카페가 전 글에 삽입하는 홍보 박스 시그니처
  /\b(bit\.ly|han\.gl|url\.kr|vo\.la|buly\.kr|abit\.ly)\/\S+/i, // 단축 URL = 광고 추적 링크
  /병원 ?이벤트|이벤트 ?당첨자 ?발표|제휴 ?및 ?체험단/,          // 카페 홍보 게시판 유입
] as const

/** 시술·병원 어휘 (단독으로는 차단하지 않음 — 아래 COMMERCE와 결합될 때만) */
const MEDICAL_TERMS = [
  '성형외과', '피부과', '의원', '병원',
  '양악', '윤곽', '광대', '사각턱', '턱끝', '가슴성형', '지방흡입', '지흡',
  '보톡스', '필러', '리프팅', '레이저제모', '눈코', '쁘띠', '스킨부스터', '비아핀',
] as const

/** 상거래 신호 (가격·이벤트·예약·상담). 시술 어휘와 같은 글에 있으면 광고로 본다. */
const COMMERCE_SIGNALS: readonly RegExp[] = [
  /\d{1,3}(,\d{3})+ ?원|\d+ ?만원|\d+ ?원부터/,   // 900원 / 39,000원 / 3만원 / 300원부터
  /이벤트가|특가|할인|프로모션|최저가|한정 ?특가/,
  /상담 ?(문의|예약|신청)|예약 ?(문의|하기|신청)|카톡 ?문의|전화 ?문의/,
  /지금 ?바로|선착순|마감 ?임박|무료 ?상담/,
] as const

/**
 * 상업 의료기관 계정명 패턴 — **작성자(author)에만** 적용한다.
 *
 * 2026-08-14 실측 사고: 여우야 첫 회차에서 병원 계정이 쓴 고정 공지 3건이 저장됐다.
 *   author=일퍼센트성형외과 / 유앤유성형외과 / 서진성형외과
 * 셋 다 본문에 가격·할인·예약 문구가 없어 COMMERCE_SIGNALS 결합 조건을 통과했다.
 * 브랜드 홍보형 광고는 가격을 쓰지 않는다 — 그래서 본문 신호만으로는 못 잡는다.
 *
 * ⚠️ 이 목록을 title·content에 적용하면 절대 안 된다. "병원 다녀왔는데 갱년기래요"가
 *    막힌다. 광고 판정의 근거는 "무슨 단어를 썼나"가 아니라 **"누가 썼나"**다.
 *    회원 닉네임에 '병원'·'의원'이 들어갈 일은 거의 없고, 있다면 그건 광고 계정이다.
 */
const MEDICAL_AUTHOR_PATTERNS: readonly RegExp[] = [
  /성형외과|피부과|한의원|치과|안과|의원|병원|클리닉/,
  /모발이식|비만클리닉|여성의원|산부인과/,
] as const

/**
 * 작성자명이 상업 의료기관인지 검사. 위반 시 "MEDICAL_AD_AUTHOR:매칭어", 통과 시 null.
 * 본문·제목은 보지 않는다 — 작성 주체만 본다.
 */
export function findMedicalAuthorSignal(author: string | null | undefined): string | null {
  const name = (author ?? '').trim()
  if (!name) return null
  for (const re of MEDICAL_AUTHOR_PATTERNS) {
    const m = name.match(re)
    if (m) return `MEDICAL_AD_AUTHOR:${m[0].slice(0, 20)}`
  }
  return null
}

/**
 * 의료광고/병원 홍보 검사. 위반 시 "MEDICAL_AD…:매칭어", 통과 시 null.
 *
 * 판정 순서
 *   1) author 상업 계정      — 단독 차단 (작성 주체 기준. 가격 문구가 없어도 광고다)
 *   2) strong 구조 신호      — 단독 차단 (의료광고 라벨·안내박스·단축URL)
 *   3) 시술어휘 + 상거래 신호 — 결합 시에만 차단 (경험담 보호)
 *
 * author는 선택 인자다. 미전달 시 기존 동작(title+content)과 완전히 동일하다.
 */
export function findMedicalAdSignal(title: string, content: string, author?: string | null): string | null {
  const authorHit = findMedicalAuthorSignal(author)
  if (authorHit) return authorHit

  const flat = `${title} ${content}`.replace(/\n/g, ' ')
  for (const re of MEDICAL_AD_STRONG_PATTERNS) {
    const m = flat.match(re)
    if (m) return `MEDICAL_AD:${m[0].slice(0, 40)}`
  }
  const term = MEDICAL_TERMS.find(t => flat.includes(t))
  if (!term) return null
  for (const re of COMMERCE_SIGNALS) {
    const m = flat.match(re)
    if (m) return `MEDICAL_AD:${term}+${m[0].slice(0, 20)}`
  }
  return null
}

/**
 * 발화자 타깃 부적합 검사. 위반 시 "카테고리:매칭어" 문자열, 통과 시 null.
 * 카테고리: AGE(연령 자기언급) / PARENT(저연령 육아) / STUDENT(입시 학부모) / ROMANCE(미혼 연애) / TRADE(지역 거래·홍보)
 */
export function findAgeFitViolation(title: string, content: string): string | null {
  let flat = `${title} ${content}`.replace(/\n/g, ' ')
  for (const ex of AGE_FIT_EXCLUDE_PATTERNS) flat = flat.replace(ex, ' ')
  for (const re of AGE_SELF_MISMATCH_PATTERNS) {
    const m = flat.match(re)
    if (m) return `AGE:${m[0]}`
  }
  for (const k of PARENTING_HARD_KEYWORDS) {
    if (flat.includes(k)) return `PARENT:${k}`
  }
  for (const re of STUDENT_COMBO_PATTERNS) {
    const m = flat.match(re)
    if (m) return `STUDENT:${m[0]}`
  }
  for (const k of ROMANCE_KEYWORDS) {
    if (flat.includes(k)) return `ROMANCE:${k}`
  }
  return findLocalTradeSignal(title, content)
}
