// popular-curator.ts — 인기글 전용 큐레이터 (auto-run)
// runner.ts: 'cafe_crawler:popular-curate': () => import('../cafe/popular-curator.js').then(m => m.main())
// BUG-3: content-curator.ts는 module-level main().catch가 있어 import 금지 → curator-shared.ts 경유
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import {
  stripMarkdown,
  replaceCafeReferences,
  toCuratedHtmlContent,
  toCuratedSummary,
  matchPersona,
  guessDesire,
  DESIRE_TO_BOARD,
  PERSONAS,
} from './curator-shared.js'
import { getCuratorBotUser, countTodayPostsByPersona, AUTHOR_DAILY_POST_CAP } from './curator-users.js'

const HEALTH_CAP = 2
const MAX_PUBLISH = 5


async function enqueueCommentWave(postId: string, cafePostId: string, authorPersonaId: string) {
  const now = new Date()
  await prisma.commentWaveQueue.create({
    data: {
      postId,
      cafePostId,
      authorPersonaId,
      wave1At: new Date(now.getTime() + 60_000),
      wave2At: new Date(now.getTime() + 300_000),
      wave3At: new Date(now.getTime() + 1_800_000),
      wave4At: new Date(now.getTime() + 3_600_000),
      expiresAt: new Date(now.getTime() + 216_000_000),
    },
  })
}

export async function main() {
  console.log('[PopularCurator] 시작')
  const startTime = Date.now()

  const candidates = await prisma.cafePost.findMany({
    where: { isPopular: true, isUsable: true, usedAt: null },
    orderBy: { killerScore: 'desc' },
    take: 15,
    select: {
      id: true,
      title: true,
      content: true,
      desireCategory: true,
      killerScore: true,
    },
  })

  if (candidates.length === 0) {
    console.log('[PopularCurator] 후보 없음 — 종료')
    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        action: 'POPULAR_CURATE',
        status: 'SKIP',
        details: JSON.stringify({ reason: '후보 없음' }),
        executionTimeMs: 0,
      },
    })
    await disconnect()
    return
  }

  let healthCount = 0
  let publishedCount = 0

  for (const post of candidates) {
    if (publishedCount >= MAX_PUBLISH) break
    const desire = post.desireCategory ?? guessDesire(post.title)
    if (desire === 'HEALTH' && healthCount >= HEALTH_CAP) continue

    let persona = matchPersona(post.title, desire)
    const todayCount = await countTodayPostsByPersona(persona.id)
    if (todayCount >= AUTHOR_DAILY_POST_CAP) {
      const sameBoard = PERSONAS.filter(p => p.board === persona.board && p.id !== persona.id)
      for (const alt of sameBoard) {
        const altCount = await countTodayPostsByPersona(alt.id)
        if (altCount < AUTHOR_DAILY_POST_CAP) { persona = alt; break }
      }
    }
    // 원문 기반 발행 — AI 재창작 없이 원본 CafePost title/content 그대로 사용
    const title = replaceCafeReferences(stripMarkdown(post.title.trim()))
    const rawContent = replaceCafeReferences(stripMarkdown(post.content.trim()))
    if (!title || !rawContent) {
      console.warn(`[PopularCurator] 원본 내용 없음 스킵: ${post.title.slice(0, 30)}`)
      continue
    }

    const boardInfo = DESIRE_TO_BOARD[desire] ?? DESIRE_TO_BOARD['GENERAL']
    const htmlContent = toCuratedHtmlContent(rawContent)
    const summary = toCuratedSummary(rawContent)

    // LIFE2 크로스소스 중복 방지 (Seed·ContentCurator와 동일 주제 중복 차단)
    if (boardInfo.boardType === 'LIFE2') {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recentLife2 = await prisma.post.findMany({
        where: { boardType: 'LIFE2', createdAt: { gte: since24h } },
        select: { title: true },
      })
      if (recentLife2.length > 0) {
        const toNouns = (t: string) => t.match(/[가-힣]{2,2}/g) ?? []
        const newNouns = new Set(toNouns(title))
        const isDuplicate = recentLife2.some(
          p => toNouns(p.title).filter(n => newNouns.has(n)).length >= 3
        )
        if (isDuplicate) {
          console.log(`[PopularCurator] LIFE2 중복 스킵: "${title.slice(0, 20)}"`)
          continue
        }
      }
    }

    try {
      const userId = await getCuratorBotUser(persona)

      const postId = await prisma.$transaction(async tx => {
        const newPost = await tx.post.create({
          data: {
            title,
            content: htmlContent,
            summary,
            cafePostId: post.id,
            boardType: boardInfo.boardType,
            category: boardInfo.category ?? '자유수다',
            authorId: userId,
            source: 'BOT',
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
        })
        await tx.cafePost.update({
          where: { id: post.id },
          data: { usedAt: new Date() },
        })
        // killerScore ≥ 75 → 발행 즉시 isFeatured=true (집중 부스트 자동 적용)
        if ((post.killerScore ?? 0) >= 75) {
          await tx.post.update({
            where: { id: newPost.id },
            data: { isFeatured: true, featuredAt: new Date() },
          })
        }
        return newPost.id
      })

      await enqueueCommentWave(postId, post.id, persona.id)

      if (desire === 'HEALTH') healthCount++
      publishedCount++
      console.log(`[PopularCurator] 발행: ${title.slice(0, 30)} (${persona.nickname})`)
    } catch (err) {
      console.error(`[PopularCurator] 발행 실패 스킵:`, err)
    }
  }

  const durationMs = Date.now() - startTime

  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: 'POPULAR_CURATE',
      status: publishedCount > 0 ? 'SUCCESS' : 'SKIP',
      details: JSON.stringify({ publishedCount, candidateCount: candidates.length }),
      executionTimeMs: durationMs,
    },
  })

  await notifySlack({
    level: 'info',
    agent: 'POPULAR_CURATOR',
    title: '인기글 큐레이션 완료',
    body: `${publishedCount}건 발행 (후보 ${candidates.length}건 중)`,
  })

  console.log(`[PopularCurator] 완료 — ${publishedCount}건 발행`)
  await disconnect()
}

// runner.ts에서 m.main()으로 호출됨 — 모듈 레벨 self-call 제거 (process.exit 경쟁 방지)
