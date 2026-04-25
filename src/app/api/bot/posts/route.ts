import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateBot } from '@/lib/bot-auth'
import { sanitizeHtml } from '@/lib/sanitize'

/** POST /api/bot/posts — 유머/이야기 발행 */
export async function POST(req: NextRequest) {
  const auth = authenticateBot(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { title, content, boardType, category, authorId, thumbnailUrl } = body

    if (!title || !content || !boardType || !authorId) {
      return NextResponse.json({ error: 'title, content, boardType, authorId 필수' }, { status: 400 })
    }

    if (!['STORY', 'HUMOR', 'LIFE2'].includes(boardType)) {
      return NextResponse.json({ error: 'boardType은 STORY, HUMOR, LIFE2 중 하나' }, { status: 400 })
    }

    const post = await prisma.post.create({
      data: {
        title,
        content: sanitizeHtml(content),
        boardType,
        category,
        authorId,
        source: 'BOT',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        thumbnailUrl,
      },
    })

    return NextResponse.json({ success: true, postId: post.id })
  } catch (err) {
    console.error('[Bot/Posts] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
