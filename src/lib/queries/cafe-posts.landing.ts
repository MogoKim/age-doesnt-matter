/**
 * ⛔ 비활성 — 2026-08-24 네이버 대응 외부 노출 차단.
 *
 * 이 모듈은 `CafePost`(네이버 카페 원문 저장소)를 직접 조회해 본문·작성자 닉네임·
 * 카페 이름을 `/landing`에 렌더했다. `Post`를 거치지 않으므로 게시글 단위
 * `status='HIDDEN'` 처리로 차단되지 않는 유일한 노출 경로였다.
 *
 * 파일은 이력 보존을 위해 남긴다. **DB 조회 코드는 제거했다.**
 * 소비자였던 `src/app/landing/page.tsx`는 홈 redirect로 전환됐다.
 *
 * 🚫 재활성 금지 — 랜딩에 글을 다시 붙여야 한다면 `CafePost`가 아니라
 *    `Post`(status 필터 적용)를 조회해야 한다.
 */

export interface LandingCafePost {
  id: string
  title: string
  content: string
  author: string
  cafeName: string
  likeCount: number
  commentCount: number
  postedAt: Date
}

/**
 * 항상 빈 배열을 반환한다. DB에 접근하지 않는다.
 * @deprecated 외부 노출 차단으로 비활성. 재활성하지 말 것.
 */
export async function getLandingCafePosts(_t: string): Promise<LandingCafePost[]> {
  return []
}
