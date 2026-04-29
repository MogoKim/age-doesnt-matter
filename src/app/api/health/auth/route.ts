import { prisma } from '@/lib/prisma'

export async function GET() {
  const dbOk = await prisma.user.count({ take: 1 }).then(() => true).catch(() => false)
  const authSecret = !!process.env.AUTH_SECRET
  const kakaoOk = !!(process.env.KAKAO_CLIENT_ID && process.env.KAKAO_CLIENT_SECRET)
  const ok = dbOk && authSecret && kakaoOk

  return Response.json(
    { ok, db: dbOk, authSecret, kakao: kakaoOk, ts: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  )
}
