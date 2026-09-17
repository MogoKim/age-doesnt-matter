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
 * 조회수·댓글수·좋아요수 **자체**는 무효화하지 않는다.
 * 조회할 때마다 캐시를 날리면 캐시 자체가 무의미해진다.
 *
 * ⚠️ **자동 승격은 예외다(2026-09-17 변경).** 승격은 카운터와 달리 카드에 보인다 —
 * `promotionLevel === 'HOT'` → `JobCardItem.isUrgent` → **급구 배지**.
 * 그래서 `revalidateJobPromotion`·`revalidateJobPromotionBulk` 로 무효화한다.
 * 승격은 카운터처럼 매 조회마다 일어나지 않아 스래싱 걱정이 없다.
 */
import { revalidateTag, updateTag } from 'next/cache'

/** `/jobs` 목록 1페이지 캐시(`jobs-list-page1`) + 홈·목록하단 최신 공고(`latest-jobs`) 공용 */
/**
 * ⚠️ **실행 문맥에 따라 API 가 다르다** (Next 16).
 *
 * - `revalidateJobCreated` — **Route Handler 전용**(`/api/bot/jobs`). `updateTag` 는 Server Action
 *   밖에서 던지므로 `revalidateTag(tag, 'max')` 를 쓴다. 봇 수집은 즉시 반영이 필요 없다.
 * - `revalidateJobPost` · `revalidateJobPostsBulk` — **Server Action 전용**
 *   (`actions/reports` · `admin.content` · `admin.reports` · `admin.members`).
 *   어드민이 바꾸고 바로 확인하는 경로라 read-your-own-writes 가 필요하다 → `updateTag`.
 *
 * 새 호출부를 추가할 때 문맥이 다르면 **함수를 나눠라.** 하나로 합치면 둘 중 하나가 조용히 깨진다.
 */
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
  revalidateTag(JOBS_LIST_TAG, 'max')
  revalidateTag(HOME_JOBS_TAG, 'max')
  revalidateTag(SITEMAP_POSTS_TAG, 'max')
}

/**
 * 단건 JOB 변경(상태·본문·고정·승격·게시판 이동) 후 무효화.
 *
 * 대상 글을 특정할 수 있으므로 전역 `job-detail` 대신 per-id 태그를 쓴다.
 * `includeSitemap` 은 sitemap 노출에 영향을 주는 변경(상태·게시판·본문)일 때만 true.
 * **반드시 DB write 성공 후에만 호출한다.**
 */
export function revalidateJobPost(postId: string, options?: { includeSitemap?: boolean }): void {
  updateTag(JOBS_LIST_TAG)
  updateTag(HOME_JOBS_TAG)
  updateTag(jobDetailCacheTag(postId))
  if (options?.includeSitemap !== false) updateTag(SITEMAP_POSTS_TAG)
}

/**
 * 일괄 JOB 변경 후 무효화.
 *
 * 대상 글이 여러 건이라 per-id 태그를 나열할 수 없을 때 전역 `job-detail` 을 쓴다.
 * **반드시 DB write/transaction 성공 후에만 호출한다.**
 */
/**
 * 자동 승격 전용 — **`after()` 콜백 안에서 부른다.**
 *
 * `checkAndPromotePost`·`retroactivePromotionUpdate` 는 응답을 보낸 뒤에 끝날 수 있다.
 * 예전에는 호출부가 `void fn(...).catch(...)` 였는데, 그러면 **응답 처리가 끝난 뒤에
 * 등록된 무효화가 요청의 캐시 처리에서 빠질 수 있다**(Next 16.3.4 재현).
 * 그래서 호출부를 `after(async () => { await fn(...) })` 로 바꿨다 —
 * 응답 이후에도 **요청 수명 안에서** 돌아 등록이 살아난다.
 *
 * ⚠️ 정정: "detached 면 `updateTag` 가 반드시 던진다" 는 설명은 **정확하지 않았다.**
 *    문제는 예외가 아니라 **등록 시점**이다. 여기서 `revalidateTag(tag, 'max')` 를 쓰는 이유도
 *    "던지지 않게 하려고" 가 아니라, 승격이 즉시 반영될 필요가 없는 지연 허용 갱신이기 때문이다.
 *    read-your-own-writes 가 필요한 어드민 단건 경로는 계속 `updateTag` 를 쓴다.
 *
 * 🔴 즉시 최신값 보장은 아니다 — 승격 반영은 다음 재검증부터다.
 *
 * `SITEMAP_POSTS_TAG` 는 넣지 않는다. 승격은 `status` 를 바꾸지 않아
 * sitemap 구성원이 달라지지 않는다.
 */
export function revalidateJobPromotion(postId: string): void {
  // 태그를 변수로 뽑는다 — `cache-api-context.test.ts` 의 2인자 검사기가
  // 중첩 괄호를 읽지 못해 `revalidateTag(jobDetailCacheTag(x), 'max')` 를 1인자로 오인한다.
  const detailTag = jobDetailCacheTag(postId)
  revalidateTag(JOBS_LIST_TAG, 'max')
  revalidateTag(HOME_JOBS_TAG, 'max')
  revalidateTag(detailTag, 'max')
}

/** 일괄 재계산용 — 대상이 여러 건이라 글별 태그 대신 전역 상세 태그를 쓴다. */
export function revalidateJobPromotionBulk(): void {
  revalidateTag(JOBS_LIST_TAG, 'max')
  revalidateTag(HOME_JOBS_TAG, 'max')
  revalidateTag(JOB_DETAIL_TAG, 'max')
}

export function revalidateJobPostsBulk(): void {
  updateTag(JOBS_LIST_TAG)
  updateTag(HOME_JOBS_TAG)
  updateTag(JOB_DETAIL_TAG)
  updateTag(SITEMAP_POSTS_TAG)
}
