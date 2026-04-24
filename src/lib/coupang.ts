/**
 * Coupang Partners API — CPS 딥링크 생성
 *
 * HMAC 서명 인증으로 상품 URL을 CPS 트래킹 URL로 변환
 */
import crypto from 'crypto'

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY ?? ''
const SECRET_KEY = process.env.COUPANG_SECRET_KEY ?? ''

const COUPANG_API_HOST = 'https://api-gateway.coupang.com'
const DEEP_LINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink'

interface DeepLinkRequest {
  coupangUrls: string[]
  subId?: string
}

interface DeepLinkResponse {
  rCode: string
  rMessage: string
  data: Array<{
    originalUrl: string
    landingUrl: string
    shortenUrl: string
  }>
}

/**
 * HMAC 서명 생성 (쿠팡 파트너스 API 인증)
 */
function generateHmac(method: string, path: string, datetime: string): string {
  const message = `${datetime}${method}${path}`
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(message)
    .digest('hex')
}

/**
 * 쿠팡 상품 URL을 CPS 딥링크로 변환
 */
export async function createDeepLink(
  urls: string[],
  subId?: string,
): Promise<Array<{ originalUrl: string; trackingUrl: string }>> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    console.warn('[Coupang] API 키 미설정 — 딥링크 생성 불가')
    return urls.map((url) => ({ originalUrl: url, trackingUrl: url }))
  }

  const datetime = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const hmac = generateHmac('POST', DEEP_LINK_PATH, datetime)

  const body: DeepLinkRequest = { coupangUrls: urls }
  if (subId) body.subId = subId

  try {
    const response = await fetch(`${COUPANG_API_HOST}${DEEP_LINK_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        Authorization: `CEA algorithm=HmacSHA256, access-key=${ACCESS_KEY}, signed-date=${datetime}, signature=${hmac}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.error(`[Coupang] API 오류: ${response.status}`)
      return urls.map((url) => ({ originalUrl: url, trackingUrl: url }))
    }

    const result: DeepLinkResponse = await response.json()

    if (result.rCode !== '0') {
      console.error(`[Coupang] API 응답 오류: ${result.rMessage}`)
      return urls.map((url) => ({ originalUrl: url, trackingUrl: url }))
    }

    return result.data.map((item) => ({
      originalUrl: item.originalUrl,
      trackingUrl: item.shortenUrl || item.landingUrl,
    }))
  } catch (err) {
    console.error('[Coupang] 딥링크 생성 실패:', err)
    return urls.map((url) => ({ originalUrl: url, trackingUrl: url }))
  }
}
