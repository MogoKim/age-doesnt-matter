import { NextRequest, NextResponse } from 'next/server'
import { rateLimitDistributed } from '@/lib/rate-limit'

/**
 * API 라우트용 IP 기반 rate limit 체크 (분산 환경 지원)
 * - x-real-ip (Vercel 신뢰 헤더) 우선
 * - x-forwarded-for 마지막 항목 폴백 (스푸핑 방지 — [0] 아님)
 * - 초과 시 429 Response 반환, 통과 시 null 반환
 */
export async function checkApiRateLimit(
  request: NextRequest,
  prefix: string,
  options?: { max?: number; windowMs?: number },
): Promise<NextResponse | null> {
  const ip =
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    'anonymous'

  const rl = await rateLimitDistributed(`${prefix}:${ip}`, {
    max: options?.max ?? 60,
    windowMs: options?.windowMs ?? 60_000,
  })

  if (!rl.success) {
    return NextResponse.json(
      { error: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    )
  }

  return null
}
