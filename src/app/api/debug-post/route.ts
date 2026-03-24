import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('id') ?? 'cmn3617au000cey2u11lxlmx7'

  const steps: Record<string, unknown> = {}

  try {
    // Step 1: Raw post query without relations
    const rawPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, title: true, authorId: true, status: true, boardType: true },
    })
    steps.rawPost = rawPost

    if (!rawPost) {
      return NextResponse.json({ error: 'Post not found', steps })
    }

    // Step 2: Check if author exists
    const author = await prisma.user.findUnique({
      where: { id: rawPost.authorId },
      select: { id: true, nickname: true, grade: true },
    })
    steps.author = author ?? 'AUTHOR NOT FOUND'

    // Step 3: Full post with author relation
    const fullPost = await prisma.post.findUnique({
      where: { id: postId, status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        content: true,
        author: {
          select: { id: true, nickname: true, grade: true, profileImage: true },
        },
      },
    })
    steps.fullPost = fullPost ? { id: fullPost.id, title: fullPost.title, authorNick: fullPost.author.nickname } : null

    // Step 4: sanitizeHtml test
    if (fullPost) {
      const { sanitizeHtml } = await import('@/lib/sanitize')
      const sanitized = sanitizeHtml(fullPost.content)
      steps.sanitizeOk = true
      steps.contentLength = fullPost.content.length
      steps.sanitizedLength = sanitized.length
    }

    return NextResponse.json({ success: true, steps })
  } catch (e) {
    steps.error = e instanceof Error ? { message: e.message, stack: e.stack?.split('\n').slice(0, 5) } : String(e)
    return NextResponse.json({ success: false, steps }, { status: 500 })
  }
}
