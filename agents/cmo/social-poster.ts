import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.age-doesnt-matter.com'

interface SocialPost {
  type: 'post' | 'magazine'
  originalTitle: string
  text: string
  hashtags: string[]
  url: string
}

async function getPopularPosts() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  return prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      createdAt: { gte: yesterday },
      likeCount: { gte: 3 },
    },
    orderBy: { likeCount: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      content: true,
      boardType: true,
      likeCount: true,
      commentCount: true,
    },
  })
}

async function getRecentMagazines() {
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  return prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      boardType: 'MAGAZINE',
      createdAt: { gte: threeDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: {
      id: true,
      title: true,
      content: true,
    },
  })
}

// boardType slug 매핑
const BOARD_SLUG: Record<string, string> = {
  STORY: 'stories',
  HUMOR: 'humor',
  JOB: 'jobs',
  MAGAZINE: 'magazine',
  WEEKLY: 'weekly',
}

async function generateSocialPosts(
  posts: Awaited<ReturnType<typeof getPopularPosts>>,
  magazines: Awaited<ReturnType<typeof getRecentMagazines>>,
): Promise<SocialPost[]> {
  const items = [
    ...posts.map(p => ({
      type: 'post' as const,
      title: p.title,
      preview: p.content.replace(/<[^>]*>/g, '').slice(0, 200),
      url: `${SITE_URL}/community/${BOARD_SLUG[p.boardType] ?? 'stories'}/${p.id}`,
      meta: `좋아요 ${p.likeCount} 댓글 ${p.commentCount}`,
    })),
    ...magazines.map(m => ({
      type: 'magazine' as const,
      title: m.title,
      preview: m.content.replace(/<[^>]*>/g, '').slice(0, 200),
      url: `${SITE_URL}/magazine/${m.id}`,
      meta: '',
    })),
  ]

  if (items.length === 0) return []

  const itemList = items.map((item, i) =>
    `[${i + 1}] (${item.type === 'magazine' ? '매거진' : '인기글'}) "${item.title}"\n   ${item.preview}\n   ${item.meta}`,
  ).join('\n\n')

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: `당신은 5060 시니어 커뮤니티 "우리 나이가 어때서" SNS 마케터입니다.
주어진 콘텐츠를 Threads/X용 홍보 포스트로 변환합니다.

규칙:
- 따뜻하고 친근한 톤
- 100~150자 본문
- 해시태그 5개 (한글)
- 정치/종교/혐오 절대 금지
- 시니어가 공감할 수 있는 표현

반드시 JSON 배열로만 응답하세요.`,
    messages: [{
      role: 'user',
      content: `다음 콘텐츠들을 SNS 홍보 포스트로 만들어주세요.

${itemList}

응답 형식:
[
  {"index": 1, "text": "홍보 텍스트", "hashtags": ["해시태그1", "해시태그2", "해시태그3", "해시태그4", "해시태그5"]}
]`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()

  let parsed: Array<{ index: number; text: string; hashtags: string[] }>
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('[SocialPoster] JSON 파싱 실패')
    return []
  }

  return parsed.map(p => {
    const item = items[p.index - 1]
    if (!item) return null
    return {
      type: item.type,
      originalTitle: item.title,
      text: p.text,
      hashtags: p.hashtags,
      url: item.url,
    }
  }).filter((p): p is SocialPost => p !== null)
}

async function main() {
  console.log('[SocialPoster] 시작')
  const startTime = Date.now()

  const [posts, magazines] = await Promise.all([
    getPopularPosts(),
    getRecentMagazines(),
  ])

  if (posts.length === 0 && magazines.length === 0) {
    console.log('[SocialPoster] 홍보할 콘텐츠 없음 — 스킵')
    await disconnect()
    return
  }

  console.log(`[SocialPoster] 인기글 ${posts.length}개, 매거진 ${magazines.length}개 → SNS 콘텐츠 생성`)

  const socialPosts = await generateSocialPosts(posts, magazines)
  const durationMs = Date.now() - startTime

  // BotLog 저장 (나중에 실제 API 연동 시 여기서 포스팅)
  await prisma.botLog.create({
    data: {
      botType: 'THREAD',
      action: 'SOCIAL_POST_GENERATE',
      status: 'SUCCESS',
      details: JSON.stringify(socialPosts),
      itemCount: socialPosts.length,
      executionTimeMs: durationMs,
    },
  })

  // Slack 미리보기
  if (socialPosts.length > 0) {
    const preview = socialPosts.slice(0, 3).map((p, i) =>
      `${i + 1}. *${p.originalTitle}*\n${p.text}\n${p.hashtags.map(h => `#${h}`).join(' ')}\n${p.url}`,
    ).join('\n\n')

    await notifySlack({
      level: 'info',
      agent: 'CMO_SOCIAL',
      title: `SNS 콘텐츠 ${socialPosts.length}개 생성`,
      body: preview,
    })
  }

  console.log(`[SocialPoster] 완료 — ${socialPosts.length}개 생성, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[SocialPoster] 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO_SOCIAL',
    title: 'SNS 콘텐츠 생성 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
