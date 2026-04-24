import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateBot } from '@/lib/bot-auth'
import { sanitizeHtml } from '@/lib/sanitize'

/** POST /api/bot/jobs — 일자리 발행 */
export async function POST(req: NextRequest) {
  const auth = authenticateBot(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { title, content, company, salary, workHours, workDays, location, region, jobType, applyUrl, pickPoints, qna, quickTags, tier, expiresAt, authorId } = body

    if (!title || !content || !company || !authorId) {
      return NextResponse.json({ error: 'title, content, company, authorId 필수' }, { status: 400 })
    }

    const post = await prisma.post.create({
      data: {
        title,
        content: sanitizeHtml(content),
        boardType: 'JOB',
        authorId,
        source: 'BOT',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        jobDetail: {
          create: {
            company,
            salary: salary ?? '',
            workHours: workHours ?? '',
            workDays,
            location: location ?? '',
            region: region ?? '',
            jobType: jobType ?? '',
            applyUrl: applyUrl ?? '',
            pickPoints: pickPoints ?? [],
            qna: qna ?? [],
            quickTags: quickTags ?? [],
            tier: tier ?? 4,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          },
        },
      },
      include: { jobDetail: true },
    })

    return NextResponse.json({ success: true, postId: post.id })
  } catch (err) {
    console.error('[Bot/Jobs] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
