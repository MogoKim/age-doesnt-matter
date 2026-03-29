import { prisma, disconnect } from '../core/db.js'
import { notifyAdmin } from '../core/notifier.js'
import { generatePost, generateComment, generateReply, getBotUser } from './generator.js'

/**
 * 시드 콘텐츠 스케줄러 (35명 — A~T + U~Z + AA~AI)
 * 크롤링 08:30/12:30/20:40에 연동하여 시드봇 활동
 * 활동: 글쓰기, 댓글, 대댓글, 좋아요
 *
 * 성격 분포: 긍정(12) + 중립(10) + 부정/비판(8) + 특이(5) = 35명
 * 게시판 분포: STORY(25) + HUMOR(4) + JOB(1) + WEEKLY(3) + 크로스보드 활동
 */

type ActivityType = 'post' | 'comment' | 'reply' | 'like'

interface Activity {
  personaId: string
  type: ActivityType
  board?: string
  count?: number
}

/**
 * 시간대별 활동 스케줄 (35명)
 * 08:30 크롤링 → 09:00/10:00 시드
 * 12:30 크롤링 → 13:00/14:00 시드
 * 20:40 크롤링 → 21:00/22:00 시드
 * + 15:00/16:00/19:00 자체 활동
 *
 * 일일 목표: 글 18-22개, 댓글 80-100개, 좋아요 60-80개, 대댓글 25-35개
 */
const SCHEDULE: Record<string, Activity[]> = {
  // ── 아침 (크롤링 08:30 후) ──
  '09': [
    // 글쓰기 — 아침형 페르소나
    { personaId: 'A', type: 'post' },                          // 하늘바라기 일상
    { personaId: 'F', type: 'post' },                          // 텃밭할배 아침 텃밭
    { personaId: 'J', type: 'post' },                          // 맛있는거좋아 아침 요리
    { personaId: 'L', type: 'post' },                          // 손주러브 가족
    { personaId: 'Q', type: 'post' },                          // 멍멍이아빠 아침 산책
    { personaId: 'U', type: 'post' },                          // 부산아지매 시장 이야기
    { personaId: 'AI', type: 'post' },                         // 시골아낙네 아침 텃밭
    // 댓글
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 3 },  // ㅋㅋ요정 리액션
    { personaId: 'U', type: 'comment', board: 'STORY', count: 2 },  // 부산아지매 직설 반응
    // 좋아요
    { personaId: 'E', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'L', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AI', type: 'like', board: 'STORY', count: 2 },
  ],

  '10': [
    // 글쓰기 — 정보형 + 활발형
    { personaId: 'B', type: 'post' },                          // 정호씨 정보
    { personaId: 'G', type: 'post' },                          // 여행이좋아 여행
    { personaId: 'K', type: 'post' },                          // 예쁘게살자 패션
    { personaId: 'M', type: 'post' },                          // 산이좋아 등산
    { personaId: 'V', type: 'post' },                          // 세상에나 불만 (부정)
    { personaId: 'AF', type: 'post', board: 'HUMOR' },         // 하하호호 아재개그
    { personaId: 'R', type: 'post', board: 'HUMOR' },          // 밤새봤다 드라마 감상
    { personaId: 'C', type: 'post', board: 'HUMOR' },          // ㅋㅋ요정 유머
    // 대댓글 — 아침 글에 답글
    { personaId: 'A', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'U', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'C', type: 'like', board: 'HUMOR', count: 3 },
    { personaId: 'K', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'V', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 점심 (크롤링 12:30 후) ──
  '13': [
    // 댓글 위주 — 부정/비판 캐릭터 활동 시작
    { personaId: 'D', type: 'comment', board: 'JOB', count: 2 },     // 궁금한건못참아 질문
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },   // 봄바람 공감
    { personaId: 'W', type: 'comment', board: 'STORY', count: 2 },   // 참나진짜 비판 (!)
    { personaId: 'X', type: 'comment', board: 'STORY', count: 2 },   // 걱정인형 걱정
    { personaId: 'N', type: 'comment', board: 'STORY', count: 2 },   // 알뜰맘 정보
    { personaId: 'AC', type: 'comment', board: 'STORY', count: 1 },  // 느긋이 느긋 반응
    // 좋아요
    { personaId: 'D', type: 'like', board: 'JOB', count: 2 },
    { personaId: 'J', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'X', type: 'like', board: 'STORY', count: 2 },
  ],

  '14': [
    // 글쓰기 — 오후 활동
    { personaId: 'H', type: 'post' },                          // 매일걷기 건강 데이터
    { personaId: 'N', type: 'post' },                          // 알뜰맘 살림 팁
    { personaId: 'T', type: 'post' },                          // 배움은즐거워 교육
    { personaId: 'X', type: 'post' },                          // 걱정인형 걱정 글 (부정)
    { personaId: 'AA', type: 'post' },                         // 어휴답답 한탄 (부정)
    { personaId: 'AG', type: 'post' },                         // 비교분석왕 비교 리뷰
    // 댓글
    { personaId: 'J', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'AA', type: 'comment', board: 'STORY', count: 1 },  // 어휴답답 한탄 댓글
    // 대댓글
    { personaId: 'E', type: 'reply', board: 'STORY', count: 2 },
    { personaId: 'W', type: 'reply', board: 'STORY', count: 1 },   // 참나진짜 반박 답글
    { personaId: 'H', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'N', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'T', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AG', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 오후 자체 활동 ──
  '15': [
    // 글쓰기 — 감성 + 논쟁
    { personaId: 'P', type: 'post' },                          // 오후세시 감성 에세이
    { personaId: 'Z', type: 'post' },                          // 혼자잘산다 자조 유머
    { personaId: 'AB', type: 'post', board: 'WEEKLY' },        // 따져보자 토론 주제
    { personaId: 'Y', type: 'post', board: 'WEEKLY' },         // 솔직히말해서 현실 팩폭
    { personaId: 'AD', type: 'post' },                         // 그때그시절 회고
    // 댓글
    { personaId: 'K', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'R', type: 'comment', board: 'HUMOR', count: 2 },
    { personaId: 'AB', type: 'comment', board: 'STORY', count: 2 },  // 따져보자 반론
    { personaId: 'Z', type: 'comment', board: 'STORY', count: 1 },   // 혼자잘산다 한마디
    // 좋아요
    { personaId: 'P', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'G', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'Z', type: 'like', board: 'STORY', count: 2 },
  ],

  '16': [
    // 댓글 중심 — 다양한 반응
    { personaId: 'A', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'F', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'L', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'Q', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'AD', type: 'comment', board: 'STORY', count: 2 },  // 그때그시절 "옛날에는~"
    { personaId: 'AH', type: 'comment', board: 'STORY', count: 2 },  // 피곤해요 공감
    { personaId: 'Y', type: 'comment', board: 'WEEKLY', count: 1 },  // 솔직히말해서 팩폭
    // 대댓글
    { personaId: 'L', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AB', type: 'reply', board: 'WEEKLY', count: 1 },
    // 좋아요
    { personaId: 'A', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'F', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AH', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 저녁 ──
  '19': [
    // 글쓰기 — 저녁 감성 + 문화
    { personaId: 'I', type: 'post' },                          // 한페이지 독서
    { personaId: 'O', type: 'post' },                          // 올드팝 음악
    { personaId: 'W', type: 'post' },                          // 참나진짜 비판 리뷰
    { personaId: 'AH', type: 'post' },                         // 피곤해요 하루 TMI
    { personaId: 'S', type: 'post' },                          // 제주살이 저녁 풍경
    { personaId: 'R', type: 'post', board: 'HUMOR' },          // 밤새봤다 저녁 드라마
    { personaId: 'T', type: 'post', board: 'WEEKLY' },         // 배움은즐거워 수다방
    // 댓글
    { personaId: 'E', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'G', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'M', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'P', type: 'comment', board: 'STORY', count: 2 },
    { personaId: 'V', type: 'comment', board: 'STORY', count: 2 },   // 세상에나 불만 댓글
    { personaId: 'AC', type: 'comment', board: 'STORY', count: 1 },  // 느긋이 느긋 반응
    // 좋아요
    { personaId: 'I', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'O', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'M', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'like', board: 'STORY', count: 2 },
  ],

  // ── 밤 (크롤링 20:40 후) ──
  '21': [
    // 밤 감성 페르소나 활동
    { personaId: 'AE', type: 'post' },                         // 새벽감성 밤 글
    { personaId: 'AC', type: 'post' },                         // 느긋이 느긋한 하루 마무리
    // 댓글
    { personaId: 'C', type: 'comment', board: 'HUMOR', count: 2 },
    { personaId: 'H', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'I', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'N', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'O', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'R', type: 'comment', board: 'HUMOR', count: 2 },
    { personaId: 'AF', type: 'comment', board: 'HUMOR', count: 2 },  // 하하호호 유머 댓글
    { personaId: 'AE', type: 'comment', board: 'STORY', count: 1 },  // 새벽감성 밤 댓글
    // 대댓글
    { personaId: 'C', type: 'reply', board: 'HUMOR', count: 1 },
    { personaId: 'R', type: 'reply', board: 'HUMOR', count: 1 },
    { personaId: 'V', type: 'reply', board: 'STORY', count: 1 },
    // 좋아요
    { personaId: 'B', type: 'like', board: 'STORY', count: 3 },
    { personaId: 'Q', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'S', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AE', type: 'like', board: 'STORY', count: 2 },
  ],

  '22': [
    // 마무리 활동
    { personaId: 'B', type: 'comment', board: 'STORY', count: 1 },
    { personaId: 'AD', type: 'comment', board: 'STORY', count: 1 },  // 그때그시절 밤 회고
    // 대댓글
    { personaId: 'B', type: 'reply', board: 'STORY', count: 1 },
    { personaId: 'AF', type: 'reply', board: 'HUMOR', count: 1 },
    // 좋아요 마무리
    { personaId: 'H', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'R', type: 'like', board: 'HUMOR', count: 2 },
    { personaId: 'W', type: 'like', board: 'STORY', count: 2 },
    { personaId: 'AA', type: 'like', board: 'STORY', count: 2 },
  ],
}

async function getRandomPosts(board: string, limit: number) {
  return prisma.post.findMany({
    where: { boardType: board as 'STORY' | 'HUMOR' | 'JOB', status: 'PUBLISHED' },
    orderBy: { createdAt: 'desc' },
    take: limit * 3,
    select: { id: true, title: true, content: true, authorId: true },
  })
}

/** 댓글이 달린 글에서 대댓글 타겟 찾기 */
async function getReplyTargets(board: string, limit: number) {
  const comments = await prisma.comment.findMany({
    where: {
      post: { boardType: board as 'STORY' | 'HUMOR' | 'JOB', status: 'PUBLISHED' },
      parentId: null,
      status: 'ACTIVE',
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 4,
    select: {
      id: true,
      content: true,
      postId: true,
      authorId: true,
      post: { select: { title: true } },
    },
  })
  return comments.sort(() => Math.random() - 0.5).slice(0, limit)
}

/** 좋아요할 글 찾기 (아직 좋아요 안 한 글) */
async function getLikeTargets(userId: string, board: string, limit: number) {
  const posts = await prisma.post.findMany({
    where: {
      boardType: board as 'STORY' | 'HUMOR' | 'JOB',
      status: 'PUBLISHED',
      NOT: { likes: { some: { userId } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit * 2,
    select: { id: true, authorId: true },
  })
  return posts.sort(() => Math.random() - 0.5).slice(0, limit)
}

async function runActivity(activity: Activity): Promise<void> {
  const userId = await getBotUser(activity.personaId)

  if (activity.type === 'post') {
    const { title, content, boardType, category } = await generatePost(activity.personaId, activity.board)
    const htmlContent = `<p>${content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
    const summary = content.replace(/\n/g, ' ').slice(0, 150).trim()

    await prisma.post.create({
      data: {
        title,
        content: htmlContent,
        summary,
        boardType: boardType as 'STORY' | 'HUMOR' | 'WEEKLY',
        category: category ?? null,
        authorId: userId,
        source: 'BOT',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    })
    console.log(`[Seed] ${activity.personaId} posted: "${title}"`)
  }

  if (activity.type === 'comment') {
    const posts = await getRandomPosts(activity.board ?? 'STORY', activity.count ?? 1)
    for (const post of posts.slice(0, activity.count ?? 1)) {
      const existingComment = await prisma.comment.findFirst({
        where: { postId: post.id, authorId: userId },
      })
      if (existingComment) continue

      const botCommentCount = await prisma.comment.count({
        where: {
          postId: post.id,
          author: { email: { endsWith: '@unao.bot' } },
        },
      })
      if (botCommentCount >= 2) continue

      const commentText = await generateComment(activity.personaId, post.title, post.content)
      if (commentText) {
        await prisma.comment.create({
          data: { postId: post.id, authorId: userId, content: commentText },
        })
        await prisma.post.update({
          where: { id: post.id },
          data: { commentCount: { increment: 1 } },
        })
        console.log(`[Seed] ${activity.personaId} commented on: "${post.title.slice(0, 30)}"`)
      }
    }
  }

  if (activity.type === 'reply') {
    const targets = await getReplyTargets(activity.board ?? 'STORY', activity.count ?? 1)
    for (const target of targets) {
      if (target.authorId === userId) continue

      const existingReply = await prisma.comment.findFirst({
        where: { parentId: target.id, authorId: userId },
      })
      if (existingReply) continue

      const replyText = await generateReply(activity.personaId, target.post.title, target.content)
      if (replyText) {
        await prisma.comment.create({
          data: {
            postId: target.postId,
            authorId: userId,
            content: replyText,
            parentId: target.id,
          },
        })
        await prisma.post.update({
          where: { id: target.postId },
          data: { commentCount: { increment: 1 } },
        })
        console.log(`[Seed] ${activity.personaId} replied to comment: "${target.content.slice(0, 30)}"`)
      }
    }
  }

  if (activity.type === 'like') {
    const targets = await getLikeTargets(userId, activity.board ?? 'STORY', activity.count ?? 1)
    for (const target of targets) {
      try {
        await prisma.like.create({
          data: { userId, postId: target.id },
        })
        await prisma.post.update({
          where: { id: target.id },
          data: { likeCount: { increment: 1 } },
        })
        await prisma.user.update({
          where: { id: target.authorId },
          data: { receivedLikes: { increment: 1 } },
        })
        // promotionLevel 승격 체크
        const updatedPost = await prisma.post.findUnique({
          where: { id: target.id },
          select: { likeCount: true },
        })
        if (updatedPost) {
          if (updatedPost.likeCount >= 50) {
            await prisma.post.updateMany({
              where: { id: target.id, promotionLevel: { in: ['NORMAL', 'HOT'] } },
              data: { promotionLevel: 'HALL_OF_FAME' },
            }).catch(() => {})
          } else if (updatedPost.likeCount >= 10) {
            await prisma.post.updateMany({
              where: { id: target.id, promotionLevel: 'NORMAL' },
              data: { promotionLevel: 'HOT' },
            }).catch(() => {})
          }
        }
        console.log(`[Seed] ${activity.personaId} liked post ${target.id.slice(0, 8)}`)
      } catch {
        // unique constraint 위반 시 무시
      }
    }
  }
}

/**
 * 집중 좋아요 라운드 — HOT 문턱(10) 근처 글에 좋아요 집중 투입
 * 하루 최대 2-3개 글만 타겟 → 자연스러움 유지
 */
async function focusedLikeRound(): Promise<number> {
  const nearHot = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      promotionLevel: 'NORMAL',
      likeCount: { gte: 5, lt: 10 },
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { likeCount: 'desc' },
    take: 3,
    select: { id: true, authorId: true, likeCount: true },
  })

  if (nearHot.length === 0) return 0

  // 다양한 페르소나로 집중 투입 (긍정+중립+부정 믹스)
  const boostBotIds = ['B', 'E', 'G', 'K', 'M', 'AC', 'AI']
  let boosted = 0

  for (const post of nearHot) {
    for (const botId of boostBotIds) {
      const userId = await getBotUser(botId)
      try {
        await prisma.like.create({ data: { userId, postId: post.id } })
        await prisma.post.update({
          where: { id: post.id },
          data: { likeCount: { increment: 1 } },
        })
        await prisma.user.update({
          where: { id: post.authorId },
          data: { receivedLikes: { increment: 1 } },
        })
        boosted++
      } catch {
        continue
      }
    }
    const updated = await prisma.post.findUnique({
      where: { id: post.id },
      select: { likeCount: true },
    })
    if (updated && updated.likeCount >= 10) {
      await prisma.post.updateMany({
        where: { id: post.id, promotionLevel: 'NORMAL' },
        data: { promotionLevel: 'HOT' },
      }).catch(() => {})
      console.log(`[Seed] 집중 좋아요로 HOT 승격: ${post.id.slice(0, 8)} (${updated.likeCount}개)`)
    }
  }

  return boosted
}

async function main() {
  const now = new Date()
  const kstHour = (now.getUTCHours() + 9) % 24
  const hour = kstHour.toString().padStart(2, '0')
  const activities = SCHEDULE[hour]

  if (!activities || activities.length === 0) {
    console.log(`[Seed] ${hour}시 — 예정된 활동 없음`)
    await disconnect()
    return
  }

  let successCount = 0
  let errorCount = 0

  for (const activity of activities) {
    try {
      await runActivity(activity)
      successCount++
    } catch (err) {
      console.error(`[Seed] ${activity.personaId} ${activity.type} 실패:`, err)
      errorCount++
    }
  }

  // 21시: 집중 좋아요 라운드
  let focusedCount = 0
  if (hour === '21') {
    focusedCount = await focusedLikeRound()
    if (focusedCount > 0) {
      console.log(`[Seed] 집중 좋아요 ${focusedCount}개 투입 완료`)
    }
  }

  await prisma.botLog.create({
    data: {
      botType: 'SEED' as const,
      action: `SCHEDULE_${hour}`,
      status: errorCount === 0 ? 'SUCCESS' as const : 'PARTIAL' as const,
      details: JSON.stringify({
        hour,
        success: successCount,
        errors: errorCount,
        totalActivities: activities.length,
        ...(focusedCount > 0 ? { focusedLikes: focusedCount } : {}),
      }),
      itemCount: successCount,
      executionTimeMs: 0,
    },
  })

  console.log(`[Seed] ${hour}시 완료: 성공 ${successCount}, 실패 ${errorCount}`)
  await disconnect()
}

main().catch((err) => {
  console.error('[Seed] 치명적 오류:', err)
  process.exit(1)
})
