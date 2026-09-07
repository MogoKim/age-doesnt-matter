/**
 * 일자리(JOB) 캐시 태그 · 무효화 단일 소스.
 *
 * 배경: `unstable_cache` 엔트리는 경로가 아니라 **태그**로만 지워진다.
 * 어드민 mutation 들이 쓰는 `revalidateServicePaths` 는 `revalidatePath` 만 호출하므로
 * JOB 캐시를 하나도 지우지 못했고, 그래서 공고를 숨겨도 상세가 최대 5분,
 * sitemap 은 최대 1시간 옛 상태로 남았다.
 *
 * 태그 문자열과 무효화 순서를 호출부에 복붙하면 한 곳만 고쳐졌을 때 조용히 어긋난다.
 * 이 파일이 유일한 정의처다. 조회 쪽은 태그 상수만 import 하고,
 * mutation 쪽은 아래 무효화 함수만 호출한다.
 *
 * ── 의도적 eventual consistency (캐시 스래싱 방지) ──
 * 조회수·댓글수·좋아요수, 그리고 좋아요·댓글에 의해 발생하는 자동 승격은
 * 무효화하지 않는다. 조회할 때마다 캐시를 날리면 캐시 자체가 무의미해진다.
 * 허용 지연: 목록·홈 표시 최대 120초 / 상세 카운터 최대 300초.
 */
import { revalidateTag } from 'next/cache'

/** `/jobs` 목록 1페이지 캐시(`jobs-list-page1`) + 홈·목록하단 최신 공고(`latest-jobs`) 공용 */
export const JOBS_LIST_TAG = 'jobs-list'

/** 홈 일자리 섹션(`page.tsx`의 `getCachedJobs`) */
export const HOME_JOBS_TAG = 'home-jobs'

/** 일자리 상세 전역 — 일괄 변경처럼 대상 글을 특정할 수 없을 때 쓴다 */
export const JOB_DETAIL_TAG = 'job-detail'

/** sitemap 게시글 목록(`sitemap.ts`의 `getSitemapPosts`, TTL 3600) */
export const SITEMAP_POSTS_TAG = 'sitemap-posts'

/**
 * 글 단위 상세 태그.
 *
 * Next 는 캐시 태그를 `x-next-cache-tags` 헤더에 실으므로 ASCII 안전 토큰만 쓴다.
 * JOB 상세 URL 은 `/jobs/{cuid}` 로 slug 를 쓰지 않아 postId 가 항상 ASCII 다.
 * (커뮤니티의 `postDetailCacheTag` 는 한글 slug 때문에 해시 정규화가 필요했다.)
 */
export function jobDetailCacheTag(postId: string): string {
  return `job-detail-${postId}`
}

/**
 * 신규 JOB 발행 후 무효화.
 *
 * 새 postId 에는 상세 캐시 엔트리가 존재할 수 없으므로 상세 태그는 지우지 않는다.
 * **반드시 DB write 성공 후에만 호출한다.**
 */
export function revalidateJobCreated(): void {
  revalidateTag(JOBS_LIST_TAG)
  revalidateTag(HOME_JOBS_TAG)
  revalidateTag(SITEMAP_POSTS_TAG)
}

/**
 * 단건 JOB 변경(상태·본문·고정·승격·게시판 이동) 후 무효화.
 *
 * 대상 글을 특정할 수 있으므로 전역 `job-detail` 대신 per-id 태그를 쓴다.
 * `includeSitemap` 은 sitemap 노출에 영향을 주는 변경(상태·게시판·본문)일 때만 true.
 * **반드시 DB write 성공 후에만 호출한다.**
 */
export function revalidateJobPost(postId: string, options?: { includeSitemap?: boolean }): void {
  revalidateTag(JOBS_LIST_TAG)
  revalidateTag(HOME_JOBS_TAG)
  revalidateTag(jobDetailCacheTag(postId))
  if (options?.includeSitemap !== false) revalidateTag(SITEMAP_POSTS_TAG)
}

/**
 * 일괄 JOB 변경 후 무효화.
 *
 * 대상 글이 여러 건이라 per-id 태그를 나열할 수 없을 때 전역 `job-detail` 을 쓴다.
 * **반드시 DB write/transaction 성공 후에만 호출한다.**
 */
export function revalidateJobPostsBulk(): void {
  revalidateTag(JOBS_LIST_TAG)
  revalidateTag(HOME_JOBS_TAG)
  revalidateTag(JOB_DETAIL_TAG)
  revalidateTag(SITEMAP_POSTS_TAG)
}
