import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 중복 클릭 방지: 동일 IP + adId 조합을 60초 동안 1번만 카운트
// (서버리스 인스턴스별 메모리 — Redis 없이 간단하게 처리)
const recentClicks = new Map<string, number>()
const COOLDOWN_MS = 60_000

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return (forwarded?.split(',')[0] ?? 'unknown').trim()
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { adId?: string }
    if (!body.adId || typeof body.adId !== 'string') {
      return NextResponse.json({ error: 'adId required' }, { status: 400 })
    }

    const ad = await prisma.adBanner.findUnique({ where: { id: body.adId }, select: { id: true } })
    if (!ad) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // 동일 IP에서 60초 이내 같은 배너 재클릭 → 카운트 스킵 (200 반환)
    const ip = getClientIp(request)
    const key = `${ip}:${body.adId}`
    const lastClick = recentClicks.get(key) ?? 0
    if (Date.now() - lastClick < COOLDOWN_MS) {
      return NextResponse.json({ ok: true })
    }
    recentClicks.set(key, Date.now())

    await prisma.adBanner.update({
      where: { id: body.adId },
      data: { clicks: { increment: 1 } },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
