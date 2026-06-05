import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkApiRateLimit } from '@/lib/api-rate-limit'

// 중복 노출 방지: 동일 IP + adId 조합을 60초 동안 1번만 카운트
const recentImpressions = new Map<string, number>()
const COOLDOWN_MS = 60_000

export async function POST(request: NextRequest) {
  const rateLimited = await checkApiRateLimit(request, 'ad-impression', { max: 240, windowMs: 60_000 })
  if (rateLimited) return rateLimited

  try {
    const body = (await request.json()) as { adId?: string }
    if (!body.adId || typeof body.adId !== 'string') {
      return NextResponse.json({ error: 'adId required' }, { status: 400 })
    }

    const ad = await prisma.adBanner.findUnique({ where: { id: body.adId }, select: { id: true } })
    if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // 동일 IP에서 60초 이내 같은 배너 재노출 → 카운트 스킵 (200 반환)
    const ip = request.headers.get('x-real-ip')?.trim() ||
      request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown'
    const key = `${ip}:${body.adId}`
    const lastSeen = recentImpressions.get(key) ?? 0
    if (Date.now() - lastSeen < COOLDOWN_MS) {
      return NextResponse.json({ ok: true })
    }
    recentImpressions.set(key, Date.now())

    await prisma.adBanner.update({
      where: { id: body.adId },
      data: { impressions: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
