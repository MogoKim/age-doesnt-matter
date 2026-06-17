import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateBot } from '@/lib/bot-auth'
import { sanitizeHtml, stripMarkdownSyntax } from '@/lib/sanitize'
import { generateCommunitySlug } from '@/lib/seo/slug'
import { GREETING_CATEGORY } from '@/lib/greeting'

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

    // '가입인사'는 회원 첫 참여 온보딩 전용 — 봇/API로는 생성 차단(회원 createPost만 허용)
    if (category === GREETING_CATEGORY) {
      return NextResponse.json({ error: "'가입인사'는 회원만 작성할 수 있습니다" }, { status: 403 })
    }

    const slug = await generateCommunitySlug(title)
    const post = await prisma.post.create({
      data: {
        title,
        content: sanitizeHtml(stripMarkdownSyntax(content)),
        boardType,
        category,
        authorId,
        source: 'BOT',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        thumbnailUrl,
        slug,
      },
    })

    return NextResponse.json({ success: true, postId: post.id })
  } catch (err) {
    console.error('[Bot/Posts] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
