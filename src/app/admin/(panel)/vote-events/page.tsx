import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getKstToday } from '@/lib/votes'
import VoteEventManager, { type VoteEventData, type VoteStats, type BotOption } from '@/components/admin/VoteEventManager'

export const metadata: Metadata = { title: '오늘의 투표 통제판' }
export const dynamic = 'force-dynamic'

export default async function AdminVoteEventsPage() {
  const event = await prisma.voteEvent.findUnique({ where: { date: getKstToday() } })

  let stats: VoteStats | null = null
  let eventData: VoteEventData | null = null

  if (event) {
    const grouped = await prisma.voteBallot.groupBy({
      by: ['voterType', 'choice'],
      where: { voteEventId: event.id },
      _count: { _all: true },
    })
    const count = (voterType: string, choice: string) =>
      grouped.find((g) => g.voterType === voterType && g.choice === choice)?._count._all ?? 0

    const userA = count('USER', 'A')
    const userB = count('USER', 'B')
    const guestA = count('GUEST', 'A')
    const guestB = count('GUEST', 'B')
    const botA = count('BOT', 'A')
    const botB = count('BOT', 'B')

    // 실 댓글 = 연동 게시글의 ACTIVE 댓글 중 봇(@unao.bot) 제외 (비회원 댓글은 실 댓글로 포함)
    let realComments = 0
    if (event.linkedPostId) {
      const botUsers = await prisma.user.findMany({
        where: { email: { endsWith: '@unao.bot' } },
        select: { id: true },
      })
      realComments = await prisma.comment.count({
        where: {
          postId: event.linkedPostId,
          status: 'ACTIVE',
          OR: [{ authorId: null }, { authorId: { notIn: botUsers.map((b) => b.id) } }],
        },
      })
    }

    stats = {
      // 표시 표수 = seed + 실 표(USER/GUEST) — BOT 불포함
      displayA: event.seedCountA + userA + guestA,
      displayB: event.seedCountB + userB + guestB,
      userVotes: userA + userB,
      guestVotes: guestA + guestB,
      botBallots: botA + botB,
      realComments,
    }
    eventData = {
      id: event.id,
      question: event.question,
      optionA: event.optionA,
      optionB: event.optionB,
      status: event.status,
      linkedPostId: event.linkedPostId,
      seedCountA: event.seedCountA,
      seedCountB: event.seedCountB,
      displayViews: event.displayViews,
    }
  }

  const botUsers = await prisma.user.findMany({
    where: { email: { endsWith: '@unao.bot' }, status: 'ACTIVE' },
    select: { id: true, nickname: true },
    orderBy: { nickname: 'asc' },
  })
  const botOptions: BotOption[] = botUsers.map((b) => ({ id: b.id, nickname: b.nickname }))

  return (
    <div className="space-y-4">
      <VoteEventManager event={eventData} stats={stats} botOptions={botOptions} />
    </div>
  )
}
