import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { getKstToday } from '@/lib/votes'
import VoteEventManager, {
  type VoteEventData,
  type VoteStats,
  type BotOption,
  type VoteEventListItem,
} from '@/components/admin/VoteEventManager'
import { type FeedbackEventItem } from '@/components/admin/FeedbackEventForm'
import { type SurveyEventItem } from '@/components/admin/SurveyEventForm'

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
      date: event.date.toISOString().slice(0, 10),
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

  // 봇 댓글/판깔기 페르소나 드롭다운 — 공식 이벤트 계정("우리 나이가 어때서"/official@unao.bot)은 제외
  const botUsers = await prisma.user.findMany({
    where: {
      email: { endsWith: '@unao.bot' },
      status: 'ACTIVE',
      nickname: { not: '우리 나이가 어때서' },
      NOT: { email: 'official@unao.bot' },
    },
    select: { id: true, nickname: true },
    orderBy: { nickname: 'asc' },
  })
  const botOptions: BotOption[] = botUsers.map((b) => ({ id: b.id, nickname: b.nickname }))

  // 예약(미래 날짜) / 지난(과거) 목록
  const [upcomingRows, pastRows] = await Promise.all([
    prisma.voteEvent.findMany({ where: { date: { gt: today } }, orderBy: { date: 'asc' } }),
    prisma.voteEvent.findMany({ where: { date: { lt: today } }, orderBy: { date: 'desc' }, take: 30 }),
  ])
  // 예약+지난 목록 실 표(USER/GUEST) 집계 — 한 번에 groupBy (예약 삭제 가드용으로 upcoming도 포함)
  const listIds = [...upcomingRows, ...pastRows].map((r) => r.id)
  const listBallots = listIds.length
    ? await prisma.voteBallot.groupBy({
        by: ['voteEventId', 'voterType', 'choice'],
        where: { voteEventId: { in: listIds }, voterType: { in: ['USER', 'GUEST'] } },
        _count: { _all: true },
      })
    : []
  const realVotesOf = (id: string) =>
    listBallots.filter((b) => b.voteEventId === id).reduce((s, b) => s + b._count._all, 0)

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

  const upcoming = upcomingRows.map((r) => toListItem(r, true))
  const past = pastRows.map((r) => toListItem(r, true))

  // ── 의견수렴형(FEEDBACK) 이벤트 목록 (Phase 3a) — 실 의견 수 + 오늘/예약/지난 버킷
  let feedbackEvents: FeedbackEventItem[] = []
  try {
    const feedbackRows = await prisma.event.findMany({ where: { type: 'FEEDBACK' }, orderBy: { startAt: 'desc' } })
    const fbPostIds = feedbackRows.map((e) => e.bodyPostId).filter((x): x is string => !!x)
    const allBots = await prisma.user.findMany({ where: { email: { endsWith: '@unao.bot' } }, select: { id: true } })
    const botIds = allBots.map((b) => b.id)
    const opinionGroups = fbPostIds.length
      ? await prisma.comment.groupBy({
          by: ['postId'],
          where: {
            postId: { in: fbPostIds },
            status: 'ACTIVE',
            OR: [{ authorId: null }, { authorId: { notIn: botIds } }],
          },
          _count: { _all: true },
        })
      : []
    const opinionOf = (pid: string | null) => (pid ? opinionGroups.find((g) => g.postId === pid)?._count._all ?? 0 : 0)
    const nowMs = Date.now()
    const bucketOf = (s: Date, e: Date): 'today' | 'upcoming' | 'past' =>
      nowMs < s.getTime() ? 'upcoming' : nowMs >= e.getTime() ? 'past' : 'today'
    feedbackEvents = feedbackRows.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      bodyPostId: e.bodyPostId,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      isActive: e.isActive,
      tier: e.tier,
      showBottomPopup: e.showBottomPopup,
      showHero: e.showHero,
      realOpinions: opinionOf(e.bodyPostId),
      bucket: bucketOf(e.startAt, e.endAt),
    }))
  } catch (err) {
    console.error('[admin/vote-events] FEEDBACK 이벤트 조회 실패:', err)
  }

  // ── 1분 의견함(SURVEY) 목록 (Phase 5) — 응답 수(회원/비회원) + 오늘/예약/지난 버킷
  let surveyEvents: SurveyEventItem[] = []
  try {
    const surveyRows = await prisma.event.findMany({ where: { type: 'SURVEY' }, orderBy: { startAt: 'desc' } })
    const forms = await prisma.surveyForm.findMany({
      where: { eventId: { in: surveyRows.map((e) => e.id) } },
      select: { id: true, eventId: true, questions: true, description: true, consentText: true },
    })
    const formByEvent = new Map(forms.map((f) => [f.eventId, f]))
    const respGroups = forms.length
      ? await prisma.surveyResponse.groupBy({ by: ['surveyFormId', 'userId'], where: { surveyFormId: { in: forms.map((f) => f.id) } }, _count: { _all: true } })
      : []
    const countsOf = (formId: string) => {
      const rows = respGroups.filter((g) => g.surveyFormId === formId)
      const member = rows.filter((g) => g.userId).reduce((s, g) => s + g._count._all, 0)
      const guest = rows.filter((g) => !g.userId).reduce((s, g) => s + g._count._all, 0)
      return { total: member + guest, member, guest }
    }
    const nowMs2 = Date.now()
    const bucketOf2 = (s: Date, e: Date): 'today' | 'upcoming' | 'past' => (nowMs2 < s.getTime() ? 'upcoming' : nowMs2 >= e.getTime() ? 'past' : 'today')
    surveyEvents = surveyRows.map((e) => {
      const f = formByEvent.get(e.id)
      const c = f ? countsOf(f.id) : { total: 0, member: 0, guest: 0 }
      return {
        id: e.id,
        title: e.title,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        isActive: e.isActive,
        tier: e.tier,
        showBottomPopup: e.showBottomPopup,
        showHero: e.showHero,
        responseCount: c.total,
        memberCount: c.member,
        guestCount: c.guest,
        bucket: bucketOf2(e.startAt, e.endAt),
        questions: (f?.questions as unknown as SurveyEventItem['questions']) ?? [],
        description: f?.description ?? e.description,
        consentText: f?.consentText ?? null,
      }
    })
  } catch (err) {
    console.error('[admin/vote-events] SURVEY 이벤트 조회 실패:', err)
  }

  return (
    <div className="space-y-4">
      <VoteEventManager
        event={eventData}
        stats={stats}
        botOptions={botOptions}
        upcoming={upcoming}
        past={past}
        feedbackEvents={feedbackEvents}
        surveyEvents={surveyEvents}
      />
    </div>
  )
}
