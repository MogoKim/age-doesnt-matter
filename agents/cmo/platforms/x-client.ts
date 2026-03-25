import crypto from 'crypto'

/**
 * X (Twitter) API v2 클라이언트
 * - OAuth 1.0a HMAC-SHA1 서명으로 트윗 게시
 * - public_metrics 조회 (Free tier)
 */

const API_BASE = 'https://api.twitter.com'

const CONSUMER_KEY = process.env.X_CONSUMER_KEY ?? ''
const CONSUMER_SECRET = process.env.X_CONSUMER_SECRET ?? ''
const ACCESS_TOKEN = process.env.X_ACCESS_TOKEN ?? ''
const ACCESS_SECRET = process.env.X_ACCESS_SECRET ?? ''

interface OAuthParams {
  oauth_consumer_key: string
  oauth_nonce: string
  oauth_signature_method: string
  oauth_timestamp: string
  oauth_token: string
  oauth_version: string
  oauth_signature?: string
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

function generateSignature(method: string, url: string, params: OAuthParams): string {
  const sortedParams = Object.entries(params)
    .filter(([k]) => k !== 'oauth_signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`)
    .join('&')

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(sortedParams)}`
  const signingKey = `${percentEncode(CONSUMER_SECRET)}&${percentEncode(ACCESS_SECRET)}`

  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')
}

function buildAuthHeader(method: string, url: string): string {
  const params: OAuthParams = {
    oauth_consumer_key: CONSUMER_KEY,
    oauth_nonce: generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: '1.0',
  }

  params.oauth_signature = generateSignature(method, url, params)

  const headerParts = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v!)}"`)
    .join(', ')

  return `OAuth ${headerParts}`
}

export function isConfigured(): boolean {
  return !!(CONSUMER_KEY && CONSUMER_SECRET && ACCESS_TOKEN && ACCESS_SECRET)
}

export interface XPostResult {
  id: string
  text: string
}

/**
 * 트윗 게시
 * @returns 게시된 트윗 ID + text
 */
export async function postTweet(text: string): Promise<XPostResult> {
  const url = `${API_BASE}/2/tweets`
  const auth = buildAuthHeader('POST', url)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`X API 게시 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as { data: { id: string; text: string } }
  return json.data
}

export interface XMetrics {
  likes: number
  retweets: number
  replies: number
  quotes: number
  bookmarks: number
  impressions: number
}

/**
 * 트윗 메트릭 조회 (Free tier: public_metrics만)
 */
export async function getTweetMetrics(tweetId: string): Promise<XMetrics> {
  const url = `${API_BASE}/2/tweets/${tweetId}?tweet.fields=public_metrics`
  const auth = buildAuthHeader('GET', url.split('?')[0])

  const res = await fetch(url, {
    headers: { Authorization: auth },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`X API 메트릭 조회 실패 (${res.status}): ${body}`)
  }

  const json = (await res.json()) as {
    data: { public_metrics: Record<string, number> }
  }

  const m = json.data.public_metrics
  return {
    likes: m.like_count ?? 0,
    retweets: m.retweet_count ?? 0,
    replies: m.reply_count ?? 0,
    quotes: m.quote_count ?? 0,
    bookmarks: m.bookmark_count ?? 0,
    impressions: m.impression_count ?? 0,
  }
}
