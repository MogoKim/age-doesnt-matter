import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('id') ?? 'cmn3617au000cey2u11lxlmx7'
  const steps: Record<string, unknown> = { postId, timestamp: new Date().toISOString() }

  // Step 1: DB test
  try {
    const { prisma } = await import('@/lib/prisma')
    const rawPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, title: true, authorId: true, status: true },
    })
    steps.dbOk = true
    steps.rawPost = rawPost
    if (!rawPost) {
      return NextResponse.json({ success: false, error: 'Post not found', steps })
    }

    // Step 2: Author check
    const author = await prisma.user.findUnique({
      where: { id: rawPost.authorId },
      select: { id: true, nickname: true },
    })
    steps.authorExists = !!author
    steps.author = author

    // Step 3: Full post with relation
    const fullPost = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        author: { select: { id: true, nickname: true, grade: true, profileImage: true } },
      },
    })
    steps.fullPostOk = !!fullPost
  } catch (e) {
    steps.dbError = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, steps }, { status: 500 })
  }

  // Step 4: Sanitize test (separate try-catch)
  try {
    const { sanitizeHtml } = await import('@/lib/sanitize')
    const result = sanitizeHtml('<p>hello</p>')
    steps.sanitizeOk = true
    steps.sanitizeResult = result
  } catch (e) {
    steps.sanitizeError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({ success: true, steps })
}
