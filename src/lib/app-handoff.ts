import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * 앱(Capacitor) OAuth handoff 1회성 토큰 — 서버 전용.
 *
 * 시스템 브라우저에서 카카오 OAuth가 끝난 세션(auth())을 WebView로 넘기기 위한 토큰.
 *  - 형식: base64url(payload).base64url(HMAC-SHA256)
 *  - 보안: HMAC 위변조 방지 + 90초 만료 + nonce 1회 atomic consume(replay 차단) + userId 바인딩
 *  - 남성차단/온보딩은 발급 전(기존 signIn 콜백)에서 이미 처리 → 본 토큰은 "세션 발급"만 담당.
 *
 * ⚠️ auth.config.ts(Edge)에서 import 금지 — Prisma 포함(서버 전용).
 */

const TOKEN_TTL_MS = 90_000 // 90초

interface HandoffPayload {
  userId: string
  needsOnboarding: boolean
  cb: string
  nonce: string
  exp: number // epoch ms
}

function getSecret(): string {
  const secret = process.env.APP_HANDOFF_SECRET
  if (!secret) {
    throw new Error('APP_HANDOFF_SECRET 미설정 — 앱 handoff 토큰을 발급/검증할 수 없습니다.')
  }
  return secret
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(body: string): string {
  return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
}

/**
 * handoff 토큰 발급 — nonce를 DB에 기록(미소비 상태) 후 HMAC 서명 토큰 반환.
 * 호출 전 반드시 인증된 세션의 userId여야 한다(bridge에서 auth()로 확인).
 */
export async function issueHandoffToken(args: {
  userId: string
  needsOnboarding: boolean
  cb: string
}): Promise<string> {
  const nonce = crypto.randomBytes(32).toString('hex')
  const exp = Date.now() + TOKEN_TTL_MS

  await prisma.appHandoffToken.create({
    data: { nonce, userId: args.userId, expiresAt: new Date(exp) },
  })

  const payload: HandoffPayload = {
    userId: args.userId,
    needsOnboarding: args.needsOnboarding,
    cb: args.cb,
    nonce,
    exp,
  }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

/**
 * handoff 토큰 검증 + nonce 1회 소비(atomic).
 * 성공 시 payload, 실패(위변조/만료/이미소비/형식오류) 시 null.
 */
export async function verifyAndConsumeHandoffToken(
  token: string,
): Promise<{ userId: string; needsOnboarding: boolean; cb: string } | null> {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null

  const [body, sig] = token.split('.')
  if (!body || !sig) return null

  // 1) HMAC 위변조 검증 (timing-safe)
  const expected = sign(body)
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null
  }

  // 2) payload 파싱
  let payload: HandoffPayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as HandoffPayload
  } catch {
    return null
  }

  // 3) 만료 검증
  if (!payload.exp || Date.now() > payload.exp) return null

  // 4) nonce 1회 atomic consume — 미소비+미만료 row만 소비. 영향 행 0이면 replay/만료 → 거부.
  const now = new Date()
  const consumed = await prisma.appHandoffToken.updateMany({
    where: { nonce: payload.nonce, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  })
  if (consumed.count !== 1) return null

  return {
    userId: payload.userId,
    needsOnboarding: !!payload.needsOnboarding,
    cb: payload.cb,
  }
}
