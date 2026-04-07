/**
 * Google Indexing API — 매거진 발행 시 즉시 인덱싱 요청
 *
 * 설정 필요:
 * 1. Google Cloud Console에서 Indexing API 활성화
 * 2. 서비스 계정 생성 + JSON 키 다운로드
 * 3. Search Console에서 서비스 계정 이메일에 "소유자" 권한 부여
 * 4. 환경변수 설정:
 *    GOOGLE_INDEXING_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
 *    GOOGLE_INDEXING_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...
 *
 * 미설정 시: 자동 skip (경고 로그만)
 *
 * 비용: Google Indexing API 무료 (하루 200회 쿼터)
 */

import { createSign } from 'crypto'

const INDEXING_API_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/indexing'

/** Base64url 인코딩 (JWT 표준) */
function base64url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * JWT RS256 서명 생성 (Node.js 내장 crypto 사용)
 * google-auth-library 패키지 없이 구현
 */
function createJwt(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))

  const signingInput = `${header}.${payload}`

  // PEM 키 정규화: 환경변수에서 \n 이스케이프 처리
  const normalizedKey = privateKey.replace(/\\n/g, '\n')

  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  sign.end()
  const signature = base64url(sign.sign(normalizedKey))

  return `${signingInput}.${signature}`
}

/**
 * Google OAuth2 액세스 토큰 발급
 * 서비스 계정 JWT를 사용해 Bearer 토큰을 받아옴
 */
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const jwt = createJwt(clientEmail, privateKey)

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OAuth2 토큰 발급 실패 (${response.status}): ${errorText}`)
  }

  const data = await response.json() as { access_token?: string }
  if (!data.access_token) {
    throw new Error('OAuth2 응답에 access_token 없음')
  }

  return data.access_token
}

/**
 * Google Indexing API에 URL 인덱싱 요청
 *
 * @param url - 인덱싱할 페이지 URL (예: https://age-doesnt-matter.com/magazine/123)
 *
 * 환경변수 미설정 시 graceful skip (에러 없이 조용히 종료)
 * 실패 시 에러를 throw하지 않고 console.warn만 (호출자에서 .catch로 처리)
 */
export async function requestGoogleIndexing(url: string): Promise<void> {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY

  // 환경변수 미설정 시 조용히 skip
  if (!clientEmail || !privateKey) {
    console.warn('[Indexing] GOOGLE_INDEXING_CLIENT_EMAIL / GOOGLE_INDEXING_PRIVATE_KEY 미설정 — 스킵')
    return
  }

  const accessToken = await getAccessToken(clientEmail, privateKey)

  const response = await fetch(INDEXING_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      url,
      type: 'URL_UPDATED',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Indexing API 실패 (${response.status}): ${errorText}`)
  }

  const result = await response.json() as { urlNotificationMetadata?: { url?: string } }
  console.log(`[Indexing] 인덱싱 요청 성공: ${result.urlNotificationMetadata?.url ?? url}`)
}
