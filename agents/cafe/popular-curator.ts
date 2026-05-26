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
import { generateCommunitySlug } from '../core/slug.js'

const HEALTH_CAP = 2
const MAX_PUBLISH = 5

const PC_AI_REJECT_RE = /글 내용을|내용을 보여|볼 수가 없|상황을 모르|글의 내용을|어떤 상황인지|댓글을 작성할 수 없|내용 올려/
function computeUsableCount(topComments: unknown): number {
  if (!Array.isArray(topComments)) return 0
  const seen = new Set<string>()
  let n = 0
  for (const item of topComments) {
    const raw = (item as { content?: string })?.content ?? ''
    const cleaned = raw.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
    if (cleaned.length < 10 || PC_AI_REJECT_RE.test(cleaned) || seen.has(cleaned)) continue
    seen.add(cleaned)
    n++
  }
  return n
}

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

  // 기존 오염 CafePost 2차 방어 (isUsable=true이지만 접근 차단 안내문이 남아있는 경우)
  const ACCESS_BLOCKED_SIGNALS_PC = [
    '검색 비허용 게시물', '가입이 필요합니다', '카페의 멤버가 되어보세요',
    '카페에 가입하면 바로 글을 볼 수 있어요', '10초 만에 가입하기',
  ] as const
  const STRONG_PZP_SIGNALS_PC = [
    '.pzp', 'pzp-pc', 'pzp-poster', 'webplayer-internal-video',
    '광고 후 계속됩니다', '디버그 정보 다운로드', '고화질 재생이 가능한 영상입니다',
  ] as const
  const WEAK_PZP_SIGNALS_PC = [
    '재생 속도', '해상도', '자막', '음소거', '전체 화면', '자동 (480p)', '0초',
  ] as const

  const rawCandidates = await prisma.cafePost.findMany({
    where: { isPopular: true, isUsable: true, usedAt: null, imageUrls: { isEmpty: true }, videoUrls: { isEmpty: true } },
    orderBy: { killerScore: 'desc' },
    take: 15,
    select: {
      id: true,
      title: true,
      content: true,
      desireCategory: true,
      killerScore: true,
      topComments: true,
    },
  })

  const candidates = rawCandidates.filter(cp => {
    const content = cp.content ?? ''
    const blocked = ACCESS_BLOCKED_SIGNALS_PC.some(s => content.includes(s))
    if (blocked) { console.log(`[PopularCurator] 접근 차단 안내문 2차 필터 skip: "${cp.title.slice(0, 30)}"`)
      return false }
    const hasStrongPzp = STRONG_PZP_SIGNALS_PC.some(s => content.includes(s))
    const weakPzpCount = WEAK_PZP_SIGNALS_PC.filter(s => content.includes(s)).length
    const videoPzp = hasStrongPzp || weakPzpCount >= 2
    if (videoPzp) console.log(`[PopularCurator] PZP/동영상 2차 필터 skip: "${cp.title.slice(0, 30)}"`)
    return !videoPzp
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

      const slug = await generateCommunitySlug(title)

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
            slug,
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

      const usable = computeUsableCount(post.topComments)
      if (usable === 0) {
        console.log(`[PopularCurator] 댓글 없는 글 — wave queue 생략 postId=${postId} cafePostId=${post.id}`)
      } else {
        await enqueueCommentWave(postId, post.id, persona.id)
      }

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
