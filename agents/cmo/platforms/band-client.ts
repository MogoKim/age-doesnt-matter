/**
 * 네이버 밴드 Open API 클라이언트 (v2.2)
 * - 밴드에 텍스트 + 이미지 게시
 * - 밴드 목록 조회
 * - 게시글 목록 조회
 *
 * API 문서: https://developers.band.us/develop/guide/api
 */

const BAND_API = 'https://openapi.band.us/v2.2'

const accessToken = process.env.BAND_ACCESS_TOKEN ?? ''
const bandKey = process.env.BAND_KEY ?? ''

export function isConfigured(): boolean {
  return !!(accessToken && bandKey)
}

export interface BandPostResult {
  postKey: string
}

export interface BandPost {
  postKey: string
  content: string
  commentCount: number
  emotionCount: number
  createdAt: number
}

/**
 * Rate limit 대응: 1회 재시도 (3초 대기)
 */
async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const res = await fetch(url, options)

  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    return fetch(url, options)
  }

  return res
}

/**
 * 밴드에 텍스트 게시
 */
export async function postText(content: string): Promise<BandPostResult> {
  const params = new URLSearchParams({
    access_token: accessToken,
    band_key: bandKey,
    content,
    do_push: 'true',
  })

  const res = await fetchWithRetry(`${BAND_API}/band/post/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Band 텍스트 게시 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as {
    result_code: number
    result_data: { post_key: string }
  }

  if (json.result_code !== 1) {
    throw new Error(`Band API 에러: result_code=${json.result_code}`)
  }

  return { postKey: json.result_data.post_key }
}

/**
 * 밴드에 이미지 + 텍스트 게시
 * Band API는 이미지 URL이 아닌 공개 접근 가능한 이미지 URL을 body 파라미터로 전달
 */
export async function postWithImage(
  content: string,
  imageUrls: string[],
): Promise<BandPostResult> {
  const body: Record<string, string> = {
    access_token: accessToken,
    band_key: bandKey,
    content,
    do_push: 'true',
  }

  // Band API는 body에 photo.image_url 파라미터로 이미지 전달
  // 최대 10장까지 지원
  for (let i = 0; i < Math.min(imageUrls.length, 10); i++) {
    body[`photo.image_url[${i}]`] = imageUrls[i]
  }

  const params = new URLSearchParams(body)

  const res = await fetchWithRetry(`${BAND_API}/band/post/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const resBody = await res.text()
    throw new Error(`Band 이미지 게시 실패 (${res.status}): ${resBody}`)
  }

  const json = (await res.json()) as {
    result_code: number
    result_data: { post_key: string }
  }

  if (json.result_code !== 1) {
    throw new Error(`Band API 에러: result_code=${json.result_code}`)
  }

  return { postKey: json.result_data.post_key }
}

/**
 * 밴드 게시글 목록 조회 (메트릭용)
 */
export async function getPosts(limit = 20): Promise<BandPost[]> {
  const url = `${BAND_API}/band/post/list?access_token=${accessToken}&band_key=${bandKey}&locale=ko_KR&limit=${limit}`

  const res = await fetchWithRetry(url, { method: 'GET' })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Band 게시글 조회 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as {
    result_code: number
    result_data: {
      items: Array<{
        post_key: string
        content: string
        comment_count: number
        emotion_count: number
        created_at: number
      }>
    }
  }

  if (json.result_code !== 1) {
    throw new Error(`Band API 에러: result_code=${json.result_code}`)
  }

  return json.result_data.items.map((item) => ({
    postKey: item.post_key,
    content: item.content,
    commentCount: item.comment_count,
    emotionCount: item.emotion_count,
    createdAt: item.created_at,
  }))
}
