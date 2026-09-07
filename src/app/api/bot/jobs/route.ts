import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateBot } from '@/lib/bot-auth'
import { isBotWriteEnabled, logBotWriteBlocked, BOT_WRITE_BLOCKED_MESSAGE } from '@/lib/bot-write-gate'
import { sanitizeHtml } from '@/lib/sanitize'
import { revalidateJobCreated } from '@/lib/cache/job-cache'

/** POST /api/bot/jobs — 일자리 발행 */
export async function POST(req: NextRequest) {
  const auth = authenticateBot(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  // Rescue R4: 외부 봇 write 입구는 기본 차단 (BOT_WRITE_ENABLED='true' 일 때만 통과)
  if (!isBotWriteEnabled()) {
    logBotWriteBlocked('/api/bot/jobs', auth.botType)
    return NextResponse.json({ error: BOT_WRITE_BLOCKED_MESSAGE }, { status: 403 })
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

    // DB write 성공 후에만 무효화한다. 새 postId 에는 상세 캐시 엔트리가 없으므로
    // 목록·홈·sitemap 만 지운다(job-cache.ts revalidateJobCreated).
    revalidateJobCreated()

    return NextResponse.json({ success: true, postId: post.id })
  } catch (err) {
    console.error('[Bot/Jobs] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
