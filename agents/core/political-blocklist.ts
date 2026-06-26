/**
 * 정치 키워드 hard block (룰 기반 — AI 미사용).
 *
 * 우나어는 정치색 있는 글을 자동 발행하지 않는다. 제목 또는 본문에 아래 키워드가
 * 하나라도 있으면 큐레이션봇 / 이미지라우터 / 시트스크래퍼 / popular-curator가 게시하지 않는다.
 *
 * ⚠️ founder 관리: 정당·정치인·정치논쟁 키워드를 아래 POLITICAL_KEYWORDS에 추가/수정한다.
 *    이 한 곳만 고치면 모든 자동 발행 경로에 즉시 반영된다.
 */

// founder 제공 시드 목록. 필요 시 여기에 추가.
export const POLITICAL_KEYWORDS: readonly string[] = [
  '민주당',
  '국민의힘',
  '이재명',
  '한동훈',
  '세월호',
  '5·18',
  '5.18',
  '이태원참사',
  '정년연장 민주당',
]

/** HTML 태그·엔티티 제거 + 공백/줄바꿈 정규화 */
function normalizeText(s: string): string {
  return (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    if (t.includes(k)) return { keyword: k, field: 'title' }
    if (c.includes(k)) return { keyword: k, field: 'content' }
  }
  return null
}

/** 제목·본문에 정치 키워드가 하나라도 있으면 true */
export function hasPoliticalKeyword(title: string, content: string): boolean {
  return findPoliticalKeyword(title, content) !== null
}
