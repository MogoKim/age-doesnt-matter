/**
 * 댓글/의견 본문 줄바꿈 정규화 — 저장 4경로 공통.
 * (createComment / editComment / createGuestComment / editGuestComment)
 *
 * 정책:
 *  - CRLF(\r\n)·CR(\r) → LF(\n) 정규화
 *  - 각 줄 끝 trailing 공백 제거 (연속 개행 판정 정확도 + 깔끔)
 *  - 3개 이상 연속 줄바꿈 → 2개로 축약 (빈 줄 도배 방지)
 *  - 앞뒤 공백/줄바꿈 trim
 *  - 내부(문단 사이) 줄바꿈은 보존
 *
 * ⚠️ 길이 제한(500자)은 호출부에서 이 함수 적용 '후'에 검증한다.
 * ⚠️ 회원 댓글의 sanitizeHtml 은 이 함수 뒤에 별도로 적용(줄바꿈 문자는 sanitize가 보존).
 */
export function normalizeCommentBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n') // CRLF, CR → LF
    .replace(/[ \t]+\n/g, '\n') // 줄 끝 공백/탭 제거
    .replace(/\n{3,}/g, '\n\n') // 3+ 연속 줄바꿈 → 2
    .trim() // 앞뒤 공백·줄바꿈
}

/**
 * 알림/푸시 미리보기용 — 줄바꿈/연속 공백을 단일 공백으로 눌러 한 줄로.
 * preview가 줄바꿈으로 깨지지 않게 한다.
 */
export function toNotificationPreview(text: string, max = 50): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}
