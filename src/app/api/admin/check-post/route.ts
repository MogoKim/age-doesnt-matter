import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 진단용 임시 API — DB의 실제 post status 확인
export async function GET(req: Request) {
  const secret = req.headers.get('x-admin-secret')
  if (secret !== process.env.AUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, boardType: true, updatedAt: true },
  })
  return NextResponse.json(post ?? { error: 'not found' })
}
