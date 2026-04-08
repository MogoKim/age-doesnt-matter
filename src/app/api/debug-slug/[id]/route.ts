import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPostDetail } from '@/lib/queries/posts'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Raw Prisma query
  const rawPost = await prisma.post.findFirst({
    where: {
      status: { in: ['PUBLISHED', 'SEO_ONLY'] },
      OR: [{ id }, { slug: id }],
    },
    select: { id: true, slug: true, status: true, boardType: true, title: true },
  })

  // Via getPostDetail (React cache wrapped)
  let cachedResult: 'found' | 'null' | 'error' = 'null'
  try {
    const detail = await getPostDetail(id)
    cachedResult = detail ? 'found' : 'null'
  } catch {
    cachedResult = 'error'
  }

  return NextResponse.json({
    received_id: id,
    raw_post_found: !!rawPost,
    getPostDetail_result: cachedResult,
    raw_post: rawPost ? { id: rawPost.id, slug: rawPost.slug, status: rawPost.status } : null,
  })
}
