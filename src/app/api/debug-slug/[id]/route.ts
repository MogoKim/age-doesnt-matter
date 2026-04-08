import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const post = await prisma.post.findFirst({
    where: {
      status: { in: ['PUBLISHED', 'SEO_ONLY'] },
      OR: [{ id }, { slug: id }],
    },
    select: { id: true, slug: true, status: true, boardType: true, title: true },
  })

  return NextResponse.json({
    received_id: id,
    id_length: id.length,
    id_codepoints: [...id].slice(0, 5).map(c => `${c}(U+${c.codePointAt(0)!.toString(16).toUpperCase()})`),
    post_found: !!post,
    post: post ? { id: post.id, slug: post.slug, status: post.status, boardType: post.boardType } : null,
  })
}
