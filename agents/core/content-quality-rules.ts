/**
 * 콘텐츠 품질 rule gate 1차 (PR-1, 2026-07-14) — AI 호출 없는 순수 함수.
 *
 * 대상 경로: image-router→Sheet→sheet-scraper (+외부 시트 row).
 * 근거: 창업자 숨김 70건 감사 — 날짜 스탬프 연재/브리핑/매매일지 9건·광고 2건·
 *   원카페 흔적 5건·요일 불일치 2건이 이 경로에서 무방비 발행됨.
 *
 * 원칙 (과차단 방지 — 창업자 확정):
 *  - 날짜만 있다고 차단하지 않는다. 미래 예정("8월 1일 예비사위가 와요")·과거 회고
 *    ("6월 30일까지 회사 다녔어요")·기념일("내년 5월 8일 결혼날짜")은 통과.
 *  - 차단은 날짜+리포트 포맷어(브리핑/결산/매매/일지…) 결합, 연월 스탬프([26년 5월])의
 *    발행월 불일치, 연재 참조(이전글/지난글), 시리즈명 단독(도보배달/월말기획/장전 브리핑)만.
 *  - 지역 생활글(동네 맛집/병원 후기/지역 마트)은 차단하지 않는다 — 광고/체험단/입점/거래만.
 *  - 손주/성인 자녀/지인 이야기는 이 모듈의 관심사가 아니다 (발화자 판정은 후속 Haiku gate).
 *
 * 반환 형식: '분류:매칭어' 또는 null — 로그·시트 error 컬럼에 그대로 기록.
 */

// ── 날짜와 결합해야만 차단되는 리포트 포맷어 (단독 무해: "배당금 받아 기분 좋아요") ──
const DATE_BOUND_REPORT_WORDS: readonly string[] = [
  '매수', '매도', '브리핑', '결산', '매매일지', '매매 일지', '시황', '수익률', '포트폴리오', '배당금', '리포트',
] as const

// ── 단독으로도 연재/리포트가 확정적인 시리즈 신호 ──
const STANDALONE_SERIES_PATTERNS: readonly RegExp[] = [
  /도보 ?배달/,          // "슬기로운 은퇴생활 - 도보배달" 연재 (숨김 5건 실측)
  /월말 ?기획/,          // "월말기획!! ETF"
  /장전 ?브리핑/,        // "6월19일 장전 브리핑"
  /(이전|지난|저번) ?글/, // 우리 사이트에 없는 연재 중간회차 참조 ("이전글 요약")
] as const

// ── 제목 날짜 스탬프 ──
const YEAR_MONTH_STAMP = /\[?\s*(\d{2}|\d{4})\s*년\s*(\d{1,2})\s*월/  // "[26년 5월]"
const MONTH_DAY = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/                    // "7월 8일"
const SLASH_DATE = /(?:^|[\s[(])(\d{1,2})\/(\d{1,2})(?:\D|$)/          // "5/29 도보배달"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
function kstParts(now: Date): { month: number; dayOfWeek: string } {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const DAYS = ['일', '월', '화', '수', '목', '금', '토']
  return { month: kst.getUTCMonth() + 1, dayOfWeek: DAYS[kst.getUTCDay()] }
}

/** 날짜 스탬프 연재물/시황 리포트 판정 — 발행 시점(now)과 어긋난 시리즈물 차단 */
export function findStaleSeriesOrReportViolation(title: string, content: string, now: Date): string | null {
  const head = `${title} ${content.replace(/\s+/g, ' ').slice(0, 300)}`

  // ① 단독 시리즈 신호 (날짜 불요)
  for (const re of STANDALONE_SERIES_PATTERNS) {
    const m = head.match(re)
    if (m) return `STALE_SERIES:${m[0]}`
  }

  // ② 제목의 연월 스탬프 — 발행월과 다르면 과거 결산물 ("[26년 5월] …" 7월 발행)
  const ym = title.match(YEAR_MONTH_STAMP)
  if (ym) {
    const { month } = kstParts(now)
    if (Number(ym[2]) !== month) return `STALE_STAMP:${ym[0].trim()}`
  }

  // ③ 제목의 날짜(M월D일·M/D) + 리포트 포맷어 결합 — 날짜 단독은 통과(미래 예정·회고 보호)
  const hasTitleDate = MONTH_DAY.test(title) || SLASH_DATE.test(title)
  if (hasTitleDate) {
    const word = DATE_BOUND_REPORT_WORDS.find(w => title.includes(w) || content.slice(0, 300).includes(w))
    if (word) return `STALE_REPORT:날짜+${word}`
  }

  return null
}

/** 원 카페 맥락 의존 글 판정 — 회원 저격·운영 공지·카페 메타 발화 */
export function findOriginalCafeContextViolation(title: string, content: string): string | null {
  const flat = `${title} ${content.replace(/\s+/g, ' ').slice(0, 500)}`

  // 특정 회원 저격/경고 — "○○님 선동 그만", "구땡님 어제밤에"
  if (/[가-힣A-Za-z0-9]{2,10}님[^\n]{0,20}(선동|경고|조심|그만|저격)/.test(flat)) return 'CAFE_CONTEXT:회원 저격'
  if (/댓글[^\n]{0,10}캡쳐|캡쳐[^\n]{0,10}들어갑니다/.test(flat)) return 'CAFE_CONTEXT:댓글 캡쳐 위협'
  // 도용 경고/운영 공지
  if (/도용[^\n]{0,10}(주의|당했)|글[^\n]{0,6}퍼가/.test(flat)) return 'CAFE_CONTEXT:도용 경고'
  // 원 카페 메타 발화 — "이 카페에 볼만한 글", "여기 은퇴까페지" ("동네 카페 다녀왔어요"는 미해당)
  if (/(이|우리|여기) ?카페[^\n]{0,15}(볼만한|인기글|가입|회원님|운영|글이 없)/.test(flat)) return 'CAFE_CONTEXT:카페 메타'
  if (/(여기|이) ?(은퇴)?까페(지|인데)/.test(flat)) return 'CAFE_CONTEXT:카페 메타'

  return null
}

/** 광고/체험단/입점 이벤트/거래 판정 — 지역 생활 후기는 미해당 */
export function findSheetAdOrTradeViolation(title: string, content: string): string | null {
  const flat = `${title} ${content.replace(/\s+/g, ' ').slice(0, 500)}`

  if (flat.includes('체험단')) return 'AD:체험단'
  if (/입점[^\n]{0,10}(기념|이벤트|환영)/.test(flat)) return 'AD:입점 이벤트'
  if (/이벤트[^\n]{0,10}(참여|응모|당첨|모집)|(댓글|퀴즈) ?이벤트/.test(flat)) return 'AD:이벤트 모집'
  // 거래 키워드는 제목만 검사 — 본문의 "참고 삽니다"(살다) 하소연 오탐 실측(dry-run 2건)으로
  // '삽니다'는 제외, 나머지도 제목 한정. 지역 거래 본문 방어는 crawler 단계 LOCAL_TRADE가 담당.
  if (/(팝니다|판매합니다|판매해요|공동구매|무료나눔|나눔합니다)/.test(title)) return 'AD:거래'

  return null
}

/** 요일 자기선언 불일치 — "금요일인데 다들 뭐하시나요"를 토요일에 발행. "목요일에 출발"(예정)은 통과 */
function findDayMismatch(title: string, content: string, now: Date): string | null {
  const flat = `${title} ${content.replace(/\s+/g, ' ').slice(0, 200)}`
  const m = flat.match(/([일월화수목금토])요일 ?(인데|이네요|입니다|이에요|이라 그런지)/)
  if (!m) return null
  const { dayOfWeek } = kstParts(now)
  return m[1] !== dayOfWeek ? `DAY_MISMATCH:${m[0]}(발행일 ${dayOfWeek}요일)` : null
}

/**
 * 통합 진입점 — image-router append 전 / sheet-scraper 발행 전 공용.
 * 위반 시 '분류:매칭어', 통과 시 null.
 */
export function findSheetContentQualityViolation(title: string, content: string, now: Date): string | null {
  return (
    findStaleSeriesOrReportViolation(title, content, now) ??
    findOriginalCafeContextViolation(title, content) ??
    findSheetAdOrTradeViolation(title, content) ??
    findDayMismatch(title, content, now)
  )
}
