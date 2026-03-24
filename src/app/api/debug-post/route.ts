import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('id') ?? 'cmn3617au000cey2u11lxlmx7'

  const steps: Record<string, unknown> = { postId }

  try {
    // Step 1: Import prisma
    steps.step1 = 'importing prisma...'
    const { prisma } = await import('@/lib/prisma')
    steps.step1 = 'prisma imported'

    // Step 2: Simple count query
    steps.step2 = 'counting posts...'
    const count = await prisma.post.count()
    steps.step2 = `post count: ${count}`

    // Step 3: Raw post without relations
    steps.step3 = 'fetching raw post...'
    const rawPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, title: true, authorId: true, status: true },
    })
    steps.step3 = rawPost ?? 'NOT FOUND'

    if (!rawPost) {
      return NextResponse.json({ success: false, error: 'Post not found', steps })
    }

    // Step 4: Check author
    steps.step4 = 'checking author...'
    const author = await prisma.user.findUnique({
      where: { id: rawPost.authorId },
      select: { id: true, nickname: true },
    })
    steps.step4 = author ?? 'AUTHOR MISSING'

    // Step 5: Full post with author
    steps.step5 = 'fetching with author...'
    const fullPost = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        author: {
          select: { id: true, nickname: true, grade: true, profileImage: true },
        },
      },
    })
    steps.step5 = fullPost ? `ok - author: ${fullPost.author.nickname}` : 'null'

    // Step 6: sanitize
    steps.step6 = 'testing sanitize...'
    const { sanitizeHtml } = await import('@/lib/sanitize')
    sanitizeHtml('<p>test</p>')
    steps.step6 = 'sanitize ok'

    return NextResponse.json({ success: true, steps })
  } catch (e) {
    steps.error = e instanceof Error ? e.message : String(e)
    steps.stack = e instanceof Error ? e.stack?.split('\n').slice(0, 5) : undefined
    return NextResponse.json({ success: false, steps }, { status: 500 })
  }
}
