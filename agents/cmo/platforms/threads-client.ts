/**
 * Threads API 클라이언트 (Meta Graph API 기반)
 * - 텍스트 게시 (container → publish 2단계)
 * - 메트릭 조회 (views, likes, replies, reposts, quotes)
 * - Long-lived token 자동 갱신
 */

const GRAPH_API = 'https://graph.threads.net/v1.0'

const APP_ID = process.env.THREADS_APP_ID ?? ''
const APP_SECRET = process.env.THREADS_APP_SECRET ?? ''

// 런타임에서 토큰 사용 — GitHub Secrets / Vercel env에 저장
let accessToken = process.env.THREADS_ACCESS_TOKEN ?? ''

export function isConfigured(): boolean {
  return !!(accessToken && APP_ID)
}

export function setAccessToken(token: string): void {
  accessToken = token
}

export interface ThreadsPostResult {
  id: string
}

/**
 * Threads 텍스트 게시 (2단계: container → publish)
 */
export async function postThread(text: string): Promise<ThreadsPostResult> {
  return publishContainer(await createContainer({ media_type: 'TEXT', text }))
}

/**
 * Threads 이미지 + 텍스트 게시
 * @param text - 게시 텍스트
 * @param imageUrl - 공개 접근 가능한 이미지 URL (R2 등)
 */
export async function postThreadWithImage(text: string, imageUrl: string): Promise<ThreadsPostResult> {
  const containerId = await createContainer({ media_type: 'IMAGE', text, image_url: imageUrl })
  await waitForContainerReady(containerId)
  return publishContainer(containerId)
}

/**
 * 컨테이너 상태 폴링 — FINISHED가 될 때까지 최대 60초 대기
 * Threads도 Instagram과 동일하게 이미지 처리 후 publish해야 함
 */
async function waitForContainerReady(containerId: string, maxWaitMs = 60000): Promise<void> {
  const pollInterval = 3000
  const start = Date.now()

  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(
      `${GRAPH_API}/${containerId}?fields=status,error_message&access_token=${accessToken}`,
    )
    if (res.ok) {
      const json = (await res.json()) as { status?: string; error_message?: string }
      if (json.status === 'FINISHED') return
      if (json.status === 'ERROR') {
        throw new Error(`Threads 컨테이너 처리 실패: ${json.error_message ?? JSON.stringify(json)}`)
      }
      console.log(`[Threads] 컨테이너 ${containerId} 상태: ${json.status}, 대기 중...`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Threads 컨테이너 ${containerId} 준비 시간 초과 (${maxWaitMs / 1000}초)`)
}

/** Container 생성 (텍스트/이미지 공통) */
async function createContainer(params: Record<string, string>): Promise<string> {
  const userId = await getThreadsUserId()
  const containerRes = await fetch(`${GRAPH_API}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, access_token: accessToken }),
  })

  if (!containerRes.ok) {
    const body = await containerRes.text()
    throw new Error(`Threads container 생성 실패 (${containerRes.status}): ${body}`)
  }

  const container = (await containerRes.json()) as { id: string }
  return container.id
}

/** Container → Publish */
async function publishContainer(containerId: string): Promise<ThreadsPostResult> {
  const userId = await getThreadsUserId()
  const publishRes = await fetch(`${GRAPH_API}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  })

  if (!publishRes.ok) {
    const body = await publishRes.text()
    throw new Error(`Threads publish 실패 (${publishRes.status}): ${body}`)
  }

  const result = (await publishRes.json()) as { id: string }
  return { id: result.id }
}

export interface ThreadsMetrics {
  views: number
  likes: number
  replies: number
  reposts: number
  quotes: number
}

/**
 * Threads 게시물 메트릭 조회
 */
export async function getThreadMetrics(threadId: string): Promise<ThreadsMetrics> {
  const url = `${GRAPH_API}/${threadId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${accessToken}`

  const res = await fetch(url)

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Threads 메트릭 조회 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as {
    data: Array<{ name: string; values: Array<{ value: number }> }>
  }

  const metrics: ThreadsMetrics = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 }

  for (const item of json.data) {
    const value = item.values?.[0]?.value ?? 0
    switch (item.name) {
      case 'views': metrics.views = value; break
      case 'likes': metrics.likes = value; break
      case 'replies': metrics.replies = value; break
      case 'reposts': metrics.reposts = value; break
      case 'quotes': metrics.quotes = value; break
    }
  }

  return metrics
}

/**
 * 현재 유저 ID 조회
 */
let cachedUserId: string | null = null

async function getThreadsUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId

  const res = await fetch(`${GRAPH_API}/me?fields=id&access_token=${accessToken}`)
  if (!res.ok) {
    throw new Error(`Threads 유저 ID 조회 실패 (${res.status})`)
  }

  const json = (await res.json()) as { id: string }
  cachedUserId = json.id
  return json.id
}

/**
 * Long-lived token 갱신 (만료 7일 전에 호출)
 * @returns 새 토큰 (60일 유효)
 */
export async function refreshLongLivedToken(): Promise<string> {
  const url = `${GRAPH_API}/refresh_access_token?grant_type=th_refresh_token&access_token=${accessToken}`

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Threads 토큰 갱신 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as { access_token: string; expires_in: number }
  accessToken = json.access_token
  return json.access_token
}

/**
 * Short-lived token → Long-lived token 교환 (최초 1회)
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ token: string; expiresIn: number }> {
  const url = `${GRAPH_API}/access_token?grant_type=th_exchange_token&client_secret=${APP_SECRET}&access_token=${shortLivedToken}`

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Threads 토큰 교환 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as { access_token: string; expires_in: number }
  accessToken = json.access_token
  return { token: json.access_token, expiresIn: json.expires_in }
}
