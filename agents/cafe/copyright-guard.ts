/**
 * 저작권 안전장치 (순수 — DB/SDK 의존 없음, 테스트 대상).
 *
 * 배경: wgang(우아한 갱년기) 메인 크롤 재개 예정. 과거 이미지 포함 글 저작권 리스크.
 * 정책(엄격): wgang 글에 imageUrls 또는 videoUrls가 1개라도 있으면 **글 전체를 차단**(저장·후보 진입 금지).
 *   - "이미지만 삭제하고 텍스트만 살리는" 방식이 아니다. media가 하나라도 있으면 그 글 전체를 hard skip.
 *   - 텍스트가 길어도 media가 있으면 skip. wgang 텍스트-only 글만 허용.
 *   - wgang 외 카페는 이 가드의 영향을 받지 않는다(기존 정책 유지).
 */
export function shouldSkipWgangMediaPost(input: {
  cafeId: string
  imageUrls?: string[] | null
  videoUrls?: string[] | null
}): boolean {
  if (input.cafeId !== 'wgang') return false
  const imageCount = input.imageUrls?.length ?? 0
  const videoCount = input.videoUrls?.length ?? 0
  return imageCount > 0 || videoCount > 0
}
