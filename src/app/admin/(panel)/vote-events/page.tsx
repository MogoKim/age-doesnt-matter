import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getKstToday } from '@/lib/votes'
import VoteEventManager, {
  type VoteEventData,
  type VoteStats,
  type BotOption,
  type VoteEventListItem,
} from '@/components/admin/VoteEventManager'

export const metadata: Metadata = { title: '참여 이벤트 — 오늘의 투표' }
export const dynamic = 'force-dynamic'

export default async function AdminVoteEventsPage() {
  const today = getKstToday()
  const event = await prisma.voteEvent.findUnique({ where: { date: today } })

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

  // 예약(미래 날짜) / 지난(과거) 목록
  const [upcomingRows, pastRows] = await Promise.all([
    prisma.voteEvent.findMany({ where: { date: { gt: today } }, orderBy: { date: 'asc' } }),
    prisma.voteEvent.findMany({ where: { date: { lt: today } }, orderBy: { date: 'desc' }, take: 30 }),
  ])
  // 지난 목록 실 표(USER/GUEST) 집계 — 한 번에 groupBy
  const pastIds = pastRows.map((r) => r.id)
  const pastBallots = pastIds.length
    ? await prisma.voteBallot.groupBy({
        by: ['voteEventId', 'voterType', 'choice'],
        where: { voteEventId: { in: pastIds }, voterType: { in: ['USER', 'GUEST'] } },
        _count: { _all: true },
      })
    : []
  const realVotesOf = (id: string) =>
    pastBallots.filter((b) => b.voteEventId === id).reduce((s, b) => s + b._count._all, 0)

  const toListItem = (r: (typeof pastRows)[number], withReal: boolean): VoteEventListItem => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    question: r.question,
    optionA: r.optionA,
    optionB: r.optionB,
    status: r.status,
    linkedPostId: r.linkedPostId,
    seedTotal: r.seedCountA + r.seedCountB,
    realVotes: withReal ? realVotesOf(r.id) : 0,
    displayViews: r.displayViews,
  })

  const upcoming = upcomingRows.map((r) => toListItem(r, false))
  const past = pastRows.map((r) => toListItem(r, true))

  return (
    <div className="space-y-4">
      <VoteEventManager
        event={eventData}
        stats={stats}
        botOptions={botOptions}
        upcoming={upcoming}
        past={past}
      />
    </div>
  )
}
