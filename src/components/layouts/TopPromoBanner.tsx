/* [DIAG-9] 임시 진단 — TopPromoBanner 를 synchronous null 로 교체한다.
   Suspense 구조는 원래대로 두고, async Server Component(+unstable_cache DB 조회)가
   hydration mismatch 의 원인인지 가른다. 최종 diff 에서 원복한다. */
export default function TopPromoBanner() {
  return null
}
