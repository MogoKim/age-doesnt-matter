import { redirect } from 'next/navigation'

/**
 * 광고 유입 랜딩 — 2026-08-24 외부 노출 차단으로 홈 redirect 전환.
 *
 * 배경: 이 페이지는 `CafePost`(네이버 카페 원문 저장소)를 **직접** 조회해
 *   본문·작성자 닉네임·카페 이름을 그대로 렌더했다. `Post`가 아니라 `CafePost`를
 *   보기 때문에 게시글 단위 `status='HIDDEN'` 처리로는 차단되지 않는 유일한 경로였다.
 *
 * 라우트를 지우지 않고 redirect로 두는 이유: 외부 광고에 이 URL이 남아 있어
 *   404보다 홈 착지가 낫다. 쿼리(`?t=`)는 무시한다.
 *
 * 되돌릴 때도 CafePost 직접 조회로는 복구하지 않는다.
 */
export const dynamic = 'force-static'

export default function LandingPage() {
  redirect('/')
}
