import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

/**
 * API 라우트용 IP 기반 rate limit 체크
 * 초과 시 429 Response 반환, 통과 시 null 반환
 */
export function checkApiRateLimit(
  request: NextRequest,
  prefix: string,
  options?: { max?: number; windowMs?: number },
): NextResponse | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rl = rateLimit(`${prefix}:${ip}`, {
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
