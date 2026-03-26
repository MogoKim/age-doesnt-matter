import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import * as xClient from './platforms/x-client.js'
import * as threadsClient from './platforms/threads-client.js'

/**
 * CMO Social Poster — SNS 자동 게시 에이전트
 *
 * 흐름:
 * 1. 현재 활성 실험(SocialExperiment) 읽기
 * 2. 실험 변수에 따라 콘텐츠 유형/톤/페르소나 결정
 * 3. 홍보 믹스(PURE 60% / SOFT 25% / DIRECT 15%) 적용
 * 4. AI로 SNS 게시글 생성
 * 5. Threads + X에 실제 게시 (or AdminQueue 승인 대기)
 * 6. SocialPost DB 저장 + Slack 알림
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL ?? 'https://www.age-doesnt-matter.com'

// ─── 게시 시간 슬롯 감지 ───

function detectSlot(): string {
  const hour = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false })
  const h = parseInt(hour, 10)
  if (h >= 6 && h < 11) return 'morning'
  if (h >= 11 && h < 14) return 'lunch'
  if (h >= 14 && h < 17) return 'afternoon'
  return 'evening'
}

// ─── 페르소나 정의 (SNS용 4명) ───

const SNS_PERSONAS: Record<string, { nickname: string; tone: string; style: string }> = {
  A: { nickname: '영숙이맘', tone: 'warm', style: '아이고~ 일상 수다, 친근한 아줌마 톤, 이모지 적당히' },
  B: { nickname: '은퇴신사', tone: 'informational', style: '차분한 어르신 톤, 경험 공유, "~합니다" 체' },
  C: { nickname: '웃음보', tone: 'humorous', style: '짧고 재밌게, ㅋㅋ와 이모지 적극, 관찰 유머' },
  H: { nickname: '건강박사', tone: 'informational', style: '건강 정보 전달, 실용적, "오늘의 건강 한 줄"' },
}

// ─── 콘텐츠 소스 수집 ───

async function getPopularPosts() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(0, 0, 0, 0)

  return prisma.post.findMany({
    where: { status: 'PUBLISHED', createdAt: { gte: yesterday }, likeCount: { gte: 2 } },
    orderBy: { likeCount: 'desc' },
    take: 5,
    select: { id: true, title: true, content: true, boardType: true, likeCount: true, commentCount: true },
  })
}

async function getRecentMagazines() {
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  return prisma.post.findMany({
    where: { status: 'PUBLISHED', boardType: 'MAGAZINE', createdAt: { gte: threeDaysAgo } },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { id: true, title: true, content: true },
  })
}

async function getRecentJobs() {
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  return prisma.post.findMany({
    where: { status: 'PUBLISHED', boardType: 'JOB', createdAt: { gte: twoDaysAgo } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, title: true },
  })
}

// ─── 현재 실험 조회 ───

async function getActiveExperiment() {
  return prisma.socialExperiment.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })
}

// ─── 자동 게시 여부 판단 ───
// 처음 2주: 모든 게시물 AdminQueue 승인 필요
// 3주차~: exploit(검증된 우승 공식) → 자동, explore(새 실험) → 승인 필요

async function shouldAutoPost(experiment: Awaited<ReturnType<typeof getActiveExperiment>>): Promise<boolean> {
  const completedExperiments = await prisma.socialExperiment.count({
    where: { status: 'ANALYZED' },
  })
  // 처음 2주는 모두 승인제
  if (completedExperiments < 2) return false
  // 활성 실험이 없으면 자동 게시 (검증된 공식 운영 중)
  if (!experiment) return true
  // 활성 실험이 있고, 현재 게시가 실험군이면 승인 필요
  // → 70% exploit은 자동, 30% explore는 확률적으로 실험 참여
  return Math.random() < 0.7 // 70% 확률로 자동 게시 (exploit)
}

// ─── 홍보 레벨 결정 (60/25/15 비율) ───

function decidePromotionLevel(): 'PURE' | 'SOFT' | 'DIRECT' {
  const rand = Math.random() * 100
  if (rand < 60) return 'PURE'
  if (rand < 85) return 'SOFT'
  return 'DIRECT'
}

// ─── 콘텐츠 유형 결정 ───

function decideContentType(experiment: Awaited<ReturnType<typeof getActiveExperiment>>): string {
  if (experiment?.variable === 'contentType') {
    return Math.random() < 0.5 ? experiment.controlValue : experiment.testValue
  }
  // 기본: 랜덤 분배
  const types = ['PERSONA', 'COMMUNITY', 'JOB_ALERT', 'MAGAZINE', 'HUMOR', 'PRACTICAL']
  return types[Math.floor(Math.random() * types.length)]
}

function decideTone(experiment: Awaited<ReturnType<typeof getActiveExperiment>>): string {
  if (experiment?.variable === 'tone') {
    return Math.random() < 0.5 ? experiment.controlValue : experiment.testValue
  }
  const tones = ['warm', 'humorous', 'informational', 'emotional']
  return tones[Math.floor(Math.random() * tones.length)]
}

function decidePersona(experiment: Awaited<ReturnType<typeof getActiveExperiment>>): string {
  if (experiment?.variable === 'persona') {
    return Math.random() < 0.5 ? experiment.controlValue : experiment.testValue
  }
  const ids = ['A', 'B', 'C', 'H']
  return ids[Math.floor(Math.random() * ids.length)]
}

// ─── boardType slug 매핑 ───

const BOARD_SLUG: Record<string, string> = {
  STORY: 'stories', HUMOR: 'humor', JOB: 'jobs', MAGAZINE: 'magazine', WEEKLY: 'weekly',
}

// ─── AI 콘텐츠 생성 ───

interface GeneratedContent {
  threadsText: string
  xText: string
  threadsHashtags: string[]
  xHashtags: string[]
}

async function generateContent(params: {
  contentType: string
  tone: string
  promotionLevel: string
  personaId: string
  sourceTitle?: string
  sourcePreview?: string
  sourceUrl?: string
}): Promise<GeneratedContent> {
  const persona = SNS_PERSONAS[params.personaId]
  const isPromo = params.promotionLevel !== 'PURE'

  const systemPrompt = `당신은 50-60대 시니어 커뮤니티 "우리 나이가 어때서"의 SNS 마케터입니다.
${persona ? `페르소나: ${persona.nickname} (${persona.style})` : ''}

규칙:
- Threads용: 대화체, 따뜻한 톤, 100-150자
- X용: 간결, 정보형, 100-140자 (링크 공간 확보)
- 톤: ${params.tone}
- 해시태그: Threads 2-3개, X 4-5개 (한글)
${isPromo ? '- 우나어 커뮤니티 언급 자연스럽게 포함' : '- 홍보 없이 순수 콘텐츠로'}
${params.promotionLevel === 'DIRECT' ? '- "우리 나이가 어때서" 커뮤니티를 직접 추천 (가입 유도)' : ''}
- 정치/종교/혐오 절대 금지
- 50-60대가 공감할 수 있는 표현

반드시 JSON으로만 응답:
{"threads_text": "...", "x_text": "...", "threads_hashtags": ["...", "..."], "x_hashtags": ["...", "...", "...", "...", "..."]}`

  let userContent: string
  if (params.sourceTitle) {
    userContent = `원본: "${params.sourceTitle}"\n${params.sourcePreview ? `내용: ${params.sourcePreview.slice(0, 200)}` : ''}\n콘텐츠 유형: ${params.contentType}\n${params.sourceUrl ? `링크: ${params.sourceUrl}` : ''}`
  } else {
    userContent = `콘텐츠 유형: ${params.contentType}\n톤: ${params.tone}\n${persona ? `페르소나 "${persona.nickname}"로 일상 이야기를 만들어주세요.` : '50-60대가 공감할 일상 이야기를 만들어주세요.'}`
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()

  try {
    const parsed = JSON.parse(jsonStr) as {
      threads_text: string; x_text: string
      threads_hashtags: string[]; x_hashtags: string[]
    }
    return {
      threadsText: parsed.threads_text,
      xText: parsed.x_text,
      threadsHashtags: parsed.threads_hashtags ?? [],
      xHashtags: parsed.x_hashtags ?? [],
    }
  } catch (err) {
    console.error('[SocialPoster] JSON 파싱 실패, 원본:', jsonStr.slice(0, 200))
    await notifySlack({
      level: 'important',
      agent: 'CMO_SOCIAL',
      title: 'SNS 콘텐츠 생성 실패 — AI JSON 파싱 오류',
      body: `원본: ${jsonStr.slice(0, 150)}...\n${err instanceof Error ? err.message : ''}`,
    })
    return { threadsText: '', xText: '', threadsHashtags: [], xHashtags: [] }
  }
}

// ─── 게시 + DB 저장 ───

async function publishAndSave(params: {
  platform: 'THREADS' | 'X'
  text: string
  hashtags: string[]
  contentType: string
  tone: string
  personaId: string
  promotionLevel: string
  sourcePostId?: string
  linkUrl?: string
  experimentId?: string
  slot: string
}) {
  const fullText = params.hashtags.length > 0
    ? `${params.text}\n\n${params.hashtags.map(h => `#${h}`).join(' ')}`
    : params.text

  // 링크 추가 (SOFT/DIRECT 홍보)
  const finalText = params.linkUrl && params.platform === 'X'
    ? `${fullText}\n${params.linkUrl}`
    : fullText

  let platformPostId: string | undefined
  let status: 'POSTED' | 'FAILED' = 'FAILED'

  try {
    if (params.platform === 'THREADS' && threadsClient.isConfigured()) {
      const result = await threadsClient.postThread(finalText)
      platformPostId = result.id
      status = 'POSTED'
    } else if (params.platform === 'X' && xClient.isConfigured()) {
      const result = await xClient.postTweet(finalText)
      platformPostId = result.id
      status = 'POSTED'
    } else {
      console.log(`[SocialPoster] ${params.platform} API 미설정 — DB에만 기록`)
      status = 'DRAFT' as 'POSTED' // Draft if not configured
    }
  } catch (err) {
    console.error(`[SocialPoster] ${params.platform} 게시 실패:`, err)
    status = 'FAILED'
  }

  // DB 저장
  const post = await prisma.socialPost.create({
    data: {
      platform: params.platform,
      experimentId: params.experimentId ?? null,
      contentType: params.contentType,
      tone: params.tone,
      personaId: params.personaId,
      promotionLevel: params.promotionLevel,
      postText: params.text,
      hashtags: params.hashtags,
      sourcePostId: params.sourcePostId ?? null,
      platformPostId: platformPostId ?? null,
      postingSlot: params.slot,
      linkUrl: params.linkUrl ?? null,
      status: status === 'POSTED' ? 'POSTED' : status === 'FAILED' ? 'FAILED' : 'DRAFT',
      postedAt: status === 'POSTED' ? new Date() : null,
    },
  })

  return { post, status, platformPostId }
}

// ─── 메인 실행 ───

async function main() {
  console.log('[SocialPoster] 시작')
  const startTime = Date.now()
  const slot = detectSlot()

  // 1. 현재 실험 조회
  const experiment = await getActiveExperiment()
  if (experiment) {
    console.log(`[SocialPoster] 활성 실험: ${experiment.hypothesis} (${experiment.variable}: ${experiment.controlValue} vs ${experiment.testValue})`)
  }

  // 2. 소스 콘텐츠 수집
  const [popularPosts, magazines, jobs] = await Promise.all([
    getPopularPosts(),
    getRecentMagazines(),
    getRecentJobs(),
  ])

  // 3. 콘텐츠 파라미터 결정
  const contentType = decideContentType(experiment)
  const tone = decideTone(experiment)
  const personaId = decidePersona(experiment)
  const promotionLevel = decidePromotionLevel()

  console.log(`[SocialPoster] 결정: type=${contentType}, tone=${tone}, persona=${personaId}, promo=${promotionLevel}, slot=${slot}`)

  // 4. 소스 선택
  let sourceTitle: string | undefined
  let sourcePreview: string | undefined
  let sourceUrl: string | undefined
  let sourcePostId: string | undefined

  if (contentType === 'COMMUNITY' && popularPosts.length > 0) {
    const post = popularPosts[Math.floor(Math.random() * popularPosts.length)]
    sourceTitle = post.title
    sourcePreview = post.content.replace(/<[^>]*>/g, '').slice(0, 200)
    sourceUrl = `${SITE_URL}/community/${BOARD_SLUG[post.boardType] ?? 'stories'}/${post.id}`
    sourcePostId = post.id
  } else if (contentType === 'MAGAZINE' && magazines.length > 0) {
    const mag = magazines[Math.floor(Math.random() * magazines.length)]
    sourceTitle = mag.title
    sourcePreview = mag.content.replace(/<[^>]*>/g, '').slice(0, 200)
    sourceUrl = `${SITE_URL}/community/magazine/${mag.id}`
    sourcePostId = mag.id
  } else if (contentType === 'JOB_ALERT' && jobs.length > 0) {
    const job = jobs[Math.floor(Math.random() * jobs.length)]
    sourceTitle = job.title
    sourceUrl = `${SITE_URL}/community/jobs/${job.id}`
    sourcePostId = job.id
  }

  // 5. AI 콘텐츠 생성
  const linkUrl = promotionLevel !== 'PURE' ? (sourceUrl ?? SITE_URL) : undefined
  const content = await generateContent({
    contentType, tone, promotionLevel, personaId,
    sourceTitle, sourcePreview, sourceUrl: linkUrl,
  })

  if (!content.threadsText && !content.xText) {
    console.log('[SocialPoster] 콘텐츠 생성 실패 — 스킵')
    await disconnect()
    return
  }

  // 6. 자동 게시 여부 판단 (AdminQueue 승인 워크플로우)
  const autoPost = await shouldAutoPost(experiment)
  const results: Array<{ platform: string; status: string; id?: string }> = []

  if (!autoPost) {
    // AdminQueue에 승인 요청 등록, DB에 QUEUED 상태로 저장
    const preview = [
      `[${contentType}] ${SNS_PERSONAS[personaId]?.nickname ?? personaId} / ${tone} / ${promotionLevel}`,
      content.threadsText ? `\nThreads: ${content.threadsText.slice(0, 80)}...` : '',
      content.xText ? `\nX: ${content.xText.slice(0, 80)}...` : '',
      linkUrl ? `\n🔗 ${linkUrl}` : '',
    ].join('')

    await prisma.adminQueue.create({
      data: {
        type: 'CONTENT_PUBLISH',
        title: `SNS 게시 승인 — ${SNS_PERSONAS[personaId]?.nickname ?? personaId} (${contentType})`,
        description: preview,
        payload: {
          contentType, tone, personaId, promotionLevel, slot, linkUrl,
          threadsText: content.threadsText, xText: content.xText,
          threadsHashtags: content.threadsHashtags, xHashtags: content.xHashtags,
          sourcePostId, experimentId: experiment?.id,
        },
        requestedBy: 'CMO_SOCIAL',
        status: 'PENDING',
      },
    })

    // QUEUED 상태로 DB 저장 (승인 후 별도 게시 필요)
    if (content.threadsText) {
      await prisma.socialPost.create({
        data: {
          platform: 'THREADS', experimentId: experiment?.id ?? null,
          contentType, tone, personaId, promotionLevel,
          postText: content.threadsText, hashtags: content.threadsHashtags,
          sourcePostId: sourcePostId ?? null, postingSlot: slot,
          linkUrl: linkUrl ?? null, status: 'QUEUED',
        },
      })
      results.push({ platform: 'Threads', status: 'QUEUED' })
    }
    if (content.xText) {
      await prisma.socialPost.create({
        data: {
          platform: 'X', experimentId: experiment?.id ?? null,
          contentType, tone, personaId, promotionLevel,
          postText: content.xText, hashtags: content.xHashtags,
          sourcePostId: sourcePostId ?? null, postingSlot: slot,
          linkUrl: linkUrl ?? null, status: 'QUEUED',
        },
      })
      results.push({ platform: 'X', status: 'QUEUED' })
    }

    await notifySlack({
      level: 'info',
      agent: 'CMO_SOCIAL',
      title: `SNS 게시 승인 대기 — /una-approve 로 승인`,
      body: preview,
    })
  } else {
    // 자동 게시 (exploit 모드)
    if (content.threadsText) {
      const r = await publishAndSave({
        platform: 'THREADS', text: content.threadsText, hashtags: content.threadsHashtags,
        contentType, tone, personaId, promotionLevel,
        sourcePostId, linkUrl, experimentId: experiment?.id, slot,
      })
      results.push({ platform: 'Threads', status: r.status, id: r.platformPostId })
    }

    if (content.xText) {
      const r = await publishAndSave({
        platform: 'X', text: content.xText, hashtags: content.xHashtags,
        contentType, tone, personaId, promotionLevel,
        sourcePostId, linkUrl, experimentId: experiment?.id, slot,
      })
      results.push({ platform: 'X', status: r.status, id: r.platformPostId })
    }
  }

  // 7. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'SOCIAL_POST',
      status: results.some(r => r.status === 'POSTED') ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({ contentType, tone, personaId, promotionLevel, slot, results }),
      itemCount: results.length,
      executionTimeMs: durationMs,
    },
  })

  // 8. Slack 알림
  const persona = SNS_PERSONAS[personaId]
  const statusEmoji = (s: string) => s === 'POSTED' ? '✅' : s === 'DRAFT' ? '📝' : '❌'

  const preview = [
    `*페르소나*: ${persona?.nickname ?? personaId} | *유형*: ${contentType} | *톤*: ${tone} | *홍보*: ${promotionLevel}`,
    content.threadsText ? `\n*Threads*: ${content.threadsText}\n${content.threadsHashtags.map(h => `#${h}`).join(' ')}` : '',
    content.xText ? `\n*X*: ${content.xText}\n${content.xHashtags.map(h => `#${h}`).join(' ')}` : '',
    `\n${results.map(r => `${statusEmoji(r.status)} ${r.platform}: ${r.status}${r.id ? ` (ID: ${r.id})` : ''}`).join(' | ')}`,
    linkUrl ? `\n🔗 ${linkUrl}` : '',
  ].join('')

  await notifySlack({
    level: 'info',
    agent: 'CMO_SOCIAL',
    title: `SNS 게시 완료 — ${results.filter(r => r.status === 'POSTED').length}/${results.length}개 성공`,
    body: preview,
  })

  console.log(`[SocialPoster] 완료 — ${results.length}개 게시, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[SocialPoster] 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO_SOCIAL',
    title: 'SNS 게시 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
