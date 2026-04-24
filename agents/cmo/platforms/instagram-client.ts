/**
 * Instagram Graph API 클라이언트 (Meta Graph API v21.0 기반)
 * - 캐러셀 이미지 게시 (container 생성 → carousel container → publish 3단계)
 * - 단일 이미지 게시 (container → publish 2단계)
 * - 메트릭 조회 (impressions, reach, likes, comments, shares, saved)
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0'

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN ?? ''
const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID ?? ''

export function isConfigured(): boolean {
  return !!(accessToken && accountId)
}

export interface InstagramMetrics {
  impressions: number
  reach: number
  likes: number
  comments: number
  shares: number
  saved: number
}

/**
 * Rate limit 대응: 1회 재시도 (5초 대기)
 */
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const res = await fetch(url, options)

  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    return fetch(url, options)
  }

  return res
}

/**
 * 컨테이너 상태 폴링 — FINISHED가 될 때까지 최대 60초 대기
 * Instagram은 이미지 다운로드/처리에 시간이 걸려 즉시 publish하면 실패함
 */
async function waitForContainerReady(containerId: string, maxWaitMs = 60000): Promise<void> {
  const pollInterval = 3000
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `${GRAPH_API}/${containerId}?fields=status_code,status&access_token=${accessToken}`,
    )
    if (res.ok) {
      const json = (await res.json()) as { status_code?: string; status?: string }
      const status = json.status_code ?? json.status
      if (status === 'FINISHED') return
      if (status === 'ERROR') {
        throw new Error(`Instagram 컨테이너 처리 실패: ${JSON.stringify(json)}`)
      }
      console.log(`[Instagram] 컨테이너 ${containerId} 상태: ${status}, 대기 중...`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Instagram 컨테이너 ${containerId} 준비 시간 초과 (${maxWaitMs / 1000}초)`)
}

/**
 * Instagram 캐러셀 게시 (3단계)
 * 1. 개별 이미지 container 생성 (is_carousel_item: true)
 * 2. Carousel container 생성 (children: container_ids)
 * 3. Publish
 */
export async function postCarousel(
  imageUrls: string[],
  caption: string,
): Promise<{ id: string }> {
  if (imageUrls.length < 2) {
    throw new Error('Instagram 캐러셀은 최소 2장의 이미지가 필요합니다')
  }
  if (imageUrls.length > 10) {
    throw new Error('Instagram 캐러셀은 최대 10장까지 가능합니다')
  }

  // Step 1: 개별 이미지 container 생성
  const containerIds: string[] = []

  for (const imageUrl of imageUrls) {
    const res = await fetchWithRetry(`${GRAPH_API}/${accountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        is_carousel_item: true,
        access_token: accessToken,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Instagram 캐러셀 아이템 container 생성 실패 (${res.status}): ${body}`)
    }

    const json = (await res.json()) as { id: string }
    containerIds.push(json.id)
  }

  // Step 2: Carousel container 생성
  const carouselRes = await fetchWithRetry(`${GRAPH_API}/${accountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: containerIds,
      caption,
      access_token: accessToken,
    }),
  })

  if (!carouselRes.ok) {
    const body = await carouselRes.text()
    throw new Error(`Instagram 캐러셀 container 생성 실패 (${carouselRes.status}): ${body}`)
  }

  const carousel = (await carouselRes.json()) as { id: string }

  // Step 2.5: 컨테이너 준비 대기 (FINISHED 상태까지 폴링)
  await waitForContainerReady(carousel.id)

  // Step 3: Publish
  const publishRes = await fetchWithRetry(`${GRAPH_API}/${accountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: carousel.id,
      access_token: accessToken,
    }),
  })

  if (!publishRes.ok) {
    const body = await publishRes.text()
    throw new Error(`Instagram 캐러셀 publish 실패 (${publishRes.status}): ${body}`)
  }

  const result = (await publishRes.json()) as { id: string }
  return { id: result.id }
}

/**
 * Instagram 단일 이미지 게시 (2단계: container → publish)
 */
export async function postSingleImage(
  imageUrl: string,
  caption: string,
): Promise<{ id: string }> {
  // Step 1: Container 생성
  const containerRes = await fetchWithRetry(`${GRAPH_API}/${accountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  })

  if (!containerRes.ok) {
    const body = await containerRes.text()
    throw new Error(`Instagram container 생성 실패 (${containerRes.status}): ${body}`)
  }

  const container = (await containerRes.json()) as { id: string }

  // Step 1.5: 컨테이너 준비 대기
  await waitForContainerReady(container.id)

  // Step 2: Publish
  const publishRes = await fetchWithRetry(`${GRAPH_API}/${accountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: container.id,
      access_token: accessToken,
    }),
  })

  if (!publishRes.ok) {
    const body = await publishRes.text()
    throw new Error(`Instagram publish 실패 (${publishRes.status}): ${body}`)
  }

  const result = (await publishRes.json()) as { id: string }
  return { id: result.id }
}

/**
 * Instagram 게시물 메트릭 조회
 */
export async function getPostMetrics(mediaId: string): Promise<InstagramMetrics> {
  const url = `${GRAPH_API}/${mediaId}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${accessToken}`

  const res = await fetchWithRetry(url, { method: 'GET' })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Instagram 메트릭 조회 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as {
    data: Array<{ name: string; values: Array<{ value: number }> }>
  }

  const metrics: InstagramMetrics = {
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saved: 0,
  }

  for (const item of json.data) {
    const value = item.values?.[0]?.value ?? 0
    switch (item.name) {
      case 'impressions': metrics.impressions = value; break
      case 'reach': metrics.reach = value; break
      case 'likes': metrics.likes = value; break
      case 'comments': metrics.comments = value; break
      case 'shares': metrics.shares = value; break
      case 'saved': metrics.saved = value; break
    }
  }

  return metrics
}
