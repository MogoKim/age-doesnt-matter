import { prisma } from '@/lib/prisma'

// R1-D 인증 관측 복구 — 이 응답은 절대 캐시되면 안 된다.
// 2026-09-05 실측: 정적 캐시된 12일 전 `db: true`가 x-vercel-cache: HIT로 반환돼 실제 DB 장애(28P01)를 가렸다.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const dbOk = await prisma.user.count({ take: 1 }).then(() => true).catch(() => false)
  const authSecret = !!process.env.AUTH_SECRET
  const kakaoOk = !!(process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET)
  const ok = dbOk && authSecret && kakaoOk

  return Response.json(
    { ok, db: dbOk, authSecret, kakao: kakaoOk, ts: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}
