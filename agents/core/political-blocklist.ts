/**
 * 정치 키워드 hard block (룰 기반 — AI 미사용).
 *
 * 우나어는 정치색 있는 글을 자동 발행하지 않는다. 제목 또는 본문에 아래 키워드가
 * 하나라도 있으면 큐레이션봇 / 이미지라우터 / 시트스크래퍼 / popular-curator가 게시하지 않는다.
 *
 * ⚠️ founder 관리: 정당·정치인·정치논쟁 키워드를 아래 POLITICAL_KEYWORDS에 추가/수정한다.
 *    이 한 곳만 고치면 모든 자동 발행 경로에 즉시 반영된다.
 */

// founder 제공 전체 목록 — 카테고리별. 필요 시 해당 섹션에 추가.
// ⚠️ 오탐 주의: 이념어 보수/진보/중도는 "bare 매칭 금지"(중도금·중도해지·보수공사 오탐) → 정치 맥락 복합어로만 차단.
//    '조국'(개인)도 bare 금지(조국=homeland 오탐) → '조국혁신당'으로만.
export const POLITICAL_KEYWORDS: readonly string[] = [
  // ── 정당 ──
  '민주당', '더불어민주당', '국민의힘', '조국혁신당', '개혁신당', '정의당', '진보당', '새누리당', '자유한국당', '국민의당',
  // ── 정치인 ──
  '이재명', '한동훈', '윤석열', '김건희', '문재인', '박근혜', '이명박', '추미애', '홍준표', '이준석',
  '안철수', '오세훈', '원희룡', '김동연', '이낙연', '정청래', '우원식', '나경원', '김기현', '한덕수',
  // ── 정치평론가/유튜브 ──
  '김어준', '유시민', '전원책', '진중권', '김용민', '주진우',
  // ── 사법/검찰/국회 ──
  '검수완박', '공수처', '탄핵소추', '탄핵', '특검', '검찰개혁', '검찰총장', '국정조사', '국정감사', '청문회',
  '패스트트랙', '필리버스터', '본회의',
  // ── 선거 ──
  '총선백서', '총선', '대선', '대선후보', '대선주자', '대선출마', '보궐선거', '비례대표', '사전투표', '부정선거', '공천', '경선',
  '정권교체', '정권심판', '지지율',
  // ── 정책 이슈 ──
  '연금개혁', '금투세', '종부세', '의대증원', '의료대란', '노란봉투법', '채상병', '채해병특검',
  '대장동', '김건희특검', '양곡관리법', '정년연장 민주당',
  // ── 외교/안보 ──
  '한미동맹', '북핵문제', '북핵', '사드', '대북', '한일관계', '위안부', '강제징용', '후쿠시마오염수', '전작권',
  // ── 이념/진영 (bare 보수·진보·중도 제외 — 복합어만) ──
  '중도층', '보수정당', '보수진영', '진보정당', '진보진영', '친명', '친윤', '반명', '친문', '좌파', '우파',
  // ── 언론/규제/여론 ──
  '가짜뉴스', '방심위', '방통위', '언론중재법', '여론조사',
  // ── 역사/사회참사 ──
  '세월호', '5·18', '5.18', '이태원참사', '광주민주화', '제주4·3',
]

/** HTML 태그·엔티티 제거 + 공백/줄바꿈 정규화 */
function normalizeText(s: string): string {
  return (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 짧은 키워드 문맥 매칭 — bare substring이 일상어를 정치어로 오인하는 키워드만 정규식으로 제한.
// 키워드 삭제 없음: 매칭 방식만 문맥 제한 (정치 문맥은 계속 차단).
// '사드': "감사드려요/인사드립니다"(앞 한글) 및 "사드릴까/사드렸어요"(드리다 활용) 오탐 차단.
//         뒤가 드리다-활용 음절(리려렸립린릴림)이 아니면 매칭 → "사드 배치"는 물론 "사드배치/사드를"도 차단 유지.
// '대선': "깍깍대선"류 오탐 차단 — 앞뒤 한글 경계 요구. 무공백 복합어는 목록의 '대선후보/대선주자/대선출마'가 커버.
const KEYWORD_MATCHERS: Partial<Record<string, RegExp>> = {
  '사드': /(?<![가-힣])사드(?![리려렸립린릴림])/,
  '대선': /(?<![가-힣])대선(?![가-힣])/,
}

function matchesKeyword(text: string, keyword: string): boolean {
  const matcher = KEYWORD_MATCHERS[keyword]
  return matcher ? matcher.test(text) : text.includes(keyword)
}

/**
 * 제목·본문에서 정치 키워드를 찾는다. 제목 우선, 없으면 본문.
 * @returns 매칭된 { keyword, field } 또는 null
 */
export function findPoliticalKeyword(
  title: string,
  content: string,
): { keyword: string; field: 'title' | 'content' } | null {
  const t = normalizeText(title)
  const c = normalizeText(content)
  for (const k of POLITICAL_KEYWORDS) {
    if (matchesKeyword(t, k)) return { keyword: k, field: 'title' }
    if (matchesKeyword(c, k)) return { keyword: k, field: 'content' }
  }
  return null
}

/** 제목·본문에 정치 키워드가 하나라도 있으면 true */
export function hasPoliticalKeyword(title: string, content: string): boolean {
  return findPoliticalKeyword(title, content) !== null
}
