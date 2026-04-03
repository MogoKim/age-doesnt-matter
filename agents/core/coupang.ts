/**
 * 쿠팡 파트너스 API — CPS 딥링크 생성 (agents 환경용)
 * src/lib/coupang.ts와 동일 로직 — agents/src 크로스 바운더리 import 우회
 */
import crypto from 'crypto'

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY ?? ''
const SECRET_KEY = process.env.COUPANG_SECRET_KEY ?? ''

const COUPANG_API_HOST = 'https://api-gateway.coupang.com'
const DEEP_LINK_PATH = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink'

function generateHmac(method: string, path: string, datetime: string): string {
  const message = `${datetime}${method}${path}`
  return crypto.createHmac('sha256', SECRET_KEY).update(message).digest('hex')
}

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

  const body: { coupangUrls: string[]; subId?: string } = { coupangUrls: urls }
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

    const result = await response.json() as {
      rCode: string
      rMessage: string
      data: Array<{ originalUrl: string; landingUrl: string; shortenUrl: string }>
    }

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
