/**
 * Facebook Page API 클라이언트 (Graph API v21.0 기반)
 * - 복수 사진 게시 (unpublished upload → feed 게시)
 * - 단일 사진 게시
 * - 텍스트 전용 게시 (링크 첨부 선택)
 * - 메트릭 조회 (likes, comments, shares)
 */

const GRAPH_API = 'https://graph.facebook.com/v21.0'

const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? ''
const pageId = process.env.FACEBOOK_PAGE_ID ?? ''

export function isConfigured(): boolean {
  // pages_manage_posts 권한이 없어 Meta App Review 승인 전까지 비활성화
  // App Review 완료 후 GitHub Secret에 FACEBOOK_POSTING_ENABLED=true 추가하면 자동 활성화
  if (process.env.FACEBOOK_POSTING_ENABLED !== 'true') return false
  return !!(accessToken && pageId)
}

export interface FacebookMetrics {
  likes: number
  comments: number
  shares: number
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
 * Facebook 복수 사진 게시 (2단계)
 * 1. 각 사진을 unpublished로 업로드
 * 2. feed에 attached_media로 게시
 */
export async function postWithPhotos(
  imageUrls: string[],
  message: string,
): Promise<{ id: string }> {
  if (imageUrls.length === 0) {
    throw new Error('Facebook 사진 게시에는 최소 1장의 이미지가 필요합니다')
  }

  // Step 1: 각 사진 unpublished 업로드
  const mediaFbIds: string[] = []

  for (const url of imageUrls) {
    const res = await fetchWithRetry(`${GRAPH_API}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        published: false,
        access_token: accessToken,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Facebook 사진 업로드 실패 (${res.status}): ${body}`)
    }

    const json = (await res.json()) as { id: string }
    mediaFbIds.push(json.id)
  }

  // Step 2: Feed에 attached_media로 게시
  const attachedMedia = mediaFbIds.map((fbid) => ({ media_fbid: fbid }))

  const feedRes = await fetchWithRetry(`${GRAPH_API}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      attached_media: attachedMedia,
      access_token: accessToken,
    }),
  })

  if (!feedRes.ok) {
    const body = await feedRes.text()
    throw new Error(`Facebook 피드 게시 실패 (${feedRes.status}): ${body}`)
  }

  const result = (await feedRes.json()) as { id: string }
  return { id: result.id }
}

/**
 * Facebook 단일 사진 게시 (published: true)
 */
export async function postSinglePhoto(
  imageUrl: string,
  caption: string,
): Promise<{ id: string }> {
  const res = await fetchWithRetry(`${GRAPH_API}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      caption,
      published: true,
      access_token: accessToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Facebook 단일 사진 게시 실패 (${res.status}): ${body}`)
  }

  const result = (await res.json()) as { id: string }
  return { id: result.id }
}

/**
 * Facebook 텍스트 전용 게시 (링크 첨부 선택)
 */
export async function postText(
  message: string,
  linkUrl?: string,
): Promise<{ id: string }> {
  const payload: Record<string, string> = {
    message,
    access_token: accessToken,
  }

  if (linkUrl) {
    payload.link = linkUrl
  }

  const res = await fetchWithRetry(`${GRAPH_API}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Facebook 텍스트 게시 실패 (${res.status}): ${body}`)
  }

  const result = (await res.json()) as { id: string }
  return { id: result.id }
}

/**
 * Facebook 게시물 메트릭 조회
 */
export async function getPostMetrics(postId: string): Promise<FacebookMetrics> {
  const url = `${GRAPH_API}/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${accessToken}`

  const res = await fetchWithRetry(url, { method: 'GET' })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Facebook 메트릭 조회 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as {
    likes?: { summary?: { total_count?: number } }
    comments?: { summary?: { total_count?: number } }
    shares?: { count?: number }
  }

  return {
    likes: json.likes?.summary?.total_count ?? 0,
    comments: json.comments?.summary?.total_count ?? 0,
    shares: json.shares?.count ?? 0,
  }
}
