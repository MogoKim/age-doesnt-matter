import crypto from 'crypto'

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? ''

/**
 * Slack 요청 서명 검증
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string,
): boolean {
  if (!signature || !timestamp || !SLACK_SIGNING_SECRET) return false

  // 5분 이상 된 요청 거부 (replay attack 방지)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > 300) return false

  const sigBasestring = `v0:${timestamp}:${body}`
  const hmac = crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest('hex')
  const expectedSignature = `v0=${hmac}`

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  )
}
