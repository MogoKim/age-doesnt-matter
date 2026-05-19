// popular-curator.ts — 인기글 전용 큐레이터 (auto-run)
// runner.ts: 'cafe_crawler:popular-curate': () => import('../cafe/popular-curator.js').then(() => {})
// BUG-3: content-curator.ts는 module-level main().catch가 있어 import 금지 → curator-shared.ts 경유
import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { getBotUser } from '../seed/generator.js'
import {
  sanitizeForApi,
  stripMarkdown,
  getKstContext,
  matchPersona,
  guessDesire,
  DESIRE_TO_BOARD,
  type PersonaMatch,
} from './curator-shared.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()

const HEALTH_CAP = 2
const MAX_PUBLISH = 5

interface PopularCandidate {
  id: string
  title: string
  content: string
  cafeName: string
  desireCategory: string | null
  killerScore: number | null
}

async function generatePopularPost(
  post: PopularCandidate,
  persona: PersonaMatch,
): Promise<{ title: string; content: string } | null> {
  const quirksStr = persona.quirks.map(q => `- ${q}`).join('\n')
  const examplesStr = persona.examples.map(e => `"${e}"`).join('\n')
  const ref = sanitizeForApi(post.content.slice(0, 800))

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: `${getKstContext()}

당신은 "${persona.nickname}" (50~60대 커뮤니티 회원)입니다.
성격/스타일: ${persona.style}
말투: ${persona.patterns.join(', ')}

[글쓰기 습관 — 반드시 지킬 것]
${quirksStr}

[당신이 실제로 쓰는 글 예시 — 이 톤과 스타일을 유지하세요]
${examplesStr}

[수미상관 방식으로 글 쓰기 — 원본 90% 보존]
- 원본 카페 글의 핵심 내용(상황·사건·수치·정보)을 90% 그대로 살리세요
- 첫 문장: 당신 "${persona.nickname}" 말투로 시작 (공감·감탄·질문 중 하나)
- 마지막 문장: 당신 말투로 자연스럽게 마무리 (응원·공감·경험 한 줄)
- 중간 내용: 원본의 핵심 정보를 자신의 말투로 자연스럽게 전달 (재구성·재해석 금지)
- 식당명·연예인명·프로그램명·지역명·음식명·수치 등 고유명사는 반드시 원본 그대로 사용

[절대 하지 않는 것]
- "시니어", "액티브 시니어" 표현 금지
- 마크다운 문법(**, ##, *, _ 등) 금지. 순수 텍스트만.
- 정치/종교/혐오/광고 금지
- 오프라인 모임 모집 글 금지 ("같이 걸어요", "이번 수요일 모여요" 등)
- "어떤 드라마", "어느 식당" 식으로 추상적으로 쓰지 말 것 → 반드시 실제 이름 특정`,
    messages: [
      {
        role: 'user',
        content: `"${sanitizeForApi(post.title)}" 주제로 글을 써주세요.

[원본 카페 글 — 수미상관으로 재가공]
인기글 (${post.cafeName}): "${sanitizeForApi(post.title)}"
${ref}

응답 형식:
제목: (15~30자, 당신 말투로)
본문: (150~400자, 문단 2~3개)`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const titleMatch = text.match(/제목:\s*(.+)/)
  const bodyMatch = text.match(/본문:\s*([\s\S]+)/)

  if (!titleMatch || !bodyMatch) return null

  return {
    title: stripMarkdown(titleMatch[1].trim()),
    content: stripMarkdown(bodyMatch[1].trim()),
  }
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

async function main() {
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
      cafeName: true,
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

    const persona = matchPersona(post.title, desire)
    const generated = await generatePopularPost(post, persona)
    if (!generated) {
      console.warn(`[PopularCurator] 생성 실패 스킵: ${post.title.slice(0, 30)}`)
      continue
    }

    const boardInfo = DESIRE_TO_BOARD[desire] ?? DESIRE_TO_BOARD['GENERAL']
    const htmlContent = `<p>${generated.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`
    const summary = generated.content.replace(/\n/g, ' ').slice(0, 150).trim()

    // LIFE2 크로스소스 중복 방지 (Seed·ContentCurator와 동일 주제 중복 차단)
    if (boardInfo.boardType === 'LIFE2') {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const recentLife2 = await prisma.post.findMany({
        where: { boardType: 'LIFE2', createdAt: { gte: since24h } },
        select: { title: true },
      })
      if (recentLife2.length > 0) {
        const toNouns = (t: string) => t.match(/[가-힣]{2,2}/g) ?? []
        const newNouns = new Set(toNouns(generated.title))
        const isDuplicate = recentLife2.some(
          p => toNouns(p.title).filter(n => newNouns.has(n)).length >= 3
        )
        if (isDuplicate) {
          console.log(`[PopularCurator] LIFE2 중복 스킵: "${generated.title.slice(0, 20)}"`)
          continue
        }
      }
    }

    try {
      const userId = await getBotUser(persona.id)

      const postId = await prisma.$transaction(async tx => {
        const newPost = await tx.post.create({
          data: {
            title: generated.title,
            content: htmlContent,
            summary,
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
        // killerScore ≥ 85 → 발행 즉시 isFeatured=true (집중 부스트 자동 적용)
        if ((post.killerScore ?? 0) >= 85) {
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
      console.log(`[PopularCurator] 발행: ${generated.title.slice(0, 30)} (${persona.nickname})`)
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

main().catch(async err => {
  console.error('[PopularCurator] 치명적 오류:', err)
  await disconnect()
  process.exit(1)
})
