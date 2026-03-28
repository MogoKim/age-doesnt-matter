import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { createApprovalRequest } from '../core/approval-helper.js'
import * as xClient from './platforms/x-client.js'
import * as threadsClient from './platforms/threads-client.js'
import { getDayStrategy, getTopicTag, detectOptimalSlot, THREADS_TONE_GUIDE, DWELL_TIME_GUIDE } from './threads-config.js'

/**
 * CMO Social Poster — SNS 자동 게시 에이전트
 *
 * 흐름:
 * 1. 현재 활성 실험(SocialExperiment) 읽기
 * 2. 실험 변수에 따라 콘텐츠 유형/톤/페르소나 결정 (요일 전략 기반)
 * 3. 홍보 믹스(PURE 60% / SOFT 25% / DIRECT 15%) 적용
 * 4. AI로 SNS 게시글 생성
 * 5. Threads + X에 실제 게시 (or AdminQueue 승인 대기)
 * 6. SocialPost DB 저장 + Slack 알림
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL ?? 'https://www.age-doesnt-matter.com').trim()

// ─── 페르소나 정의 (SNS용 4명) ───

const SNS_PERSONAS: Record<string, { nickname: string; tone: string; style: string }> = {
  A: { nickname: '영숙이맘', tone: 'warm', style: '따뜻하고 공감하는 이웃 언니 톤, 자연스러운 반말, 이모지 1-2개' },
  B: { nickname: '은퇴신사', tone: 'informational', style: '차분하고 경험 많은 톤, 반말과 존댓말 자연 혼용, 깊이 있는 이야기' },
  C: { nickname: '웃음보', tone: 'humorous', style: '밝고 유쾌한 톤, 위트 있는 반말, 관찰 유머 (ㅋㅋ 남발 금지)' },
  H: { nickname: '건강박사', tone: 'informational', style: '실용적 건강/생활 정보, 다정한 반말, 근거 있는 팁 공유' },
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
  // 1인 운영: 초기부터 자동 게시 (실험 데이터 축적 후 explore만 승인제로 전환)
  if (completedExperiments < 2) return true
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

// ─── 콘텐츠 유형 결정 (요일 전략 기반) ───

function decideContentType(experiment: Awaited<ReturnType<typeof getActiveExperiment>>, dayStrategy: ReturnType<typeof getDayStrategy>): string {
  if (experiment?.variable === 'contentType') {
    return Math.random() < 0.5 ? experiment.controlValue : experiment.testValue
  }
  // 요일 전략의 contentTypes에서 랜덤 선택
  const types = dayStrategy.contentTypes
  return types[Math.floor(Math.random() * types.length)]
}

function decideTone(experiment: Awaited<ReturnType<typeof getActiveExperiment>>, dayStrategy: ReturnType<typeof getDayStrategy>): string {
  if (experiment?.variable === 'tone') {
    return Math.random() < 0.5 ? experiment.controlValue : experiment.testValue
  }
  // 요일 전략의 preferredPersonas에서 첫 번째 페르소나의 톤 사용, 나머지는 랜덤
  const preferredPersona = SNS_PERSONAS[dayStrategy.preferredPersonas[0]]
  if (preferredPersona && Math.random() < 0.7) return preferredPersona.tone
  const tones = ['warm', 'humorous', 'informational', 'emotional']
  return tones[Math.floor(Math.random() * tones.length)]
}

function decidePersona(experiment: Awaited<ReturnType<typeof getActiveExperiment>>, dayStrategy: ReturnType<typeof getDayStrategy>): string {
  if (experiment?.variable === 'persona') {
    return Math.random() < 0.5 ? experiment.controlValue : experiment.testValue
  }
  // 요일 전략의 preferredPersonas에서 랜덤 선택
  const ids = dayStrategy.preferredPersonas
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
  threadTopicTag: string
  xHashtags: string[]
}

async function generateContent(params: {
  contentType: string
  tone: string
  promotionLevel: string
  personaId: string
  dayStrategy: ReturnType<typeof getDayStrategy>
  sourceTitle?: string
  sourcePreview?: string
  sourceUrl?: string
}): Promise<GeneratedContent> {
  const persona = SNS_PERSONAS[params.personaId]
  const isPromo = params.promotionLevel !== 'PURE'
  const strategy = params.dayStrategy

  const dayContext = `[요일 전략 — ${strategy.dayName}]
- 분위기: ${strategy.mood}
- 포맷: ${strategy.format}
- 토픽 태그 방향: ${strategy.topicTagHint}`

  const systemPrompt = `당신은 50-60대 커뮤니티 "우리 나이가 어때서"의 SNS 마케터입니다.
${persona ? `페르소나: ${persona.nickname} (${persona.style})` : ''}

[톤 규칙]
${THREADS_TONE_GUIDE}

[체류 시간 최적화 — Threads 알고리즘 핵심]
${DWELL_TIME_GUIDE}

[Threads 규칙]
- Threads용: 반말 대화체, 100-200자, 토픽 태그 정확히 1개만
- 토픽 태그는 #없이 자연스러운 한글 단어 1개 (예: 일상, 건강정보, 꿀팁)
- 톤: ${params.tone}
${isPromo ? '- 우나어 커뮤니티 언급 자연스럽게 포함' : '- 홍보 없이 순수 콘텐츠로'}
${params.promotionLevel === 'DIRECT' ? '- "우리 나이가 어때서" 커뮤니티를 직접 추천' : ''}

[X 규칙]
- X용: 정보형, 간결, 100-140자 (링크 공간 확보)
- 해시태그 2-3개 (한글)
- 톤: ${params.tone}
${isPromo ? '- 우나어 커뮤니티 언급 자연스럽게 포함' : '- 홍보 없이 순수 콘텐츠로'}
${params.promotionLevel === 'DIRECT' ? '- "우리 나이가 어때서" 커뮤니티를 직접 추천' : ''}

${dayContext}

반드시 JSON으로만 응답:
{"threads_text": "...", "thread_topic_tag": "일상", "x_text": "...", "x_hashtags": ["...", "..."]}`

  let userContent: string
  if (params.sourceTitle) {
    userContent = `원본: "${params.sourceTitle}"\n${params.sourcePreview ? `내용: ${params.sourcePreview.slice(0, 200)}` : ''}\n콘텐츠 유형: ${params.contentType}\n${params.sourceUrl ? `링크: ${params.sourceUrl}` : ''}`
  } else {
    userContent = `콘텐츠 유형: ${params.contentType}\n톤: ${params.tone}\n${persona ? `페르소나 "${persona.nickname}"로 일상 이야기를 만들어주세요.` : '50대 60대가 공감할 일상 이야기를 만들어주세요.'}`
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
      thread_topic_tag: string; x_hashtags: string[]
    }
    return {
      threadsText: parsed.threads_text,
      xText: parsed.x_text,
      threadTopicTag: parsed.thread_topic_tag ?? getTopicTag(params.contentType),
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
    return { threadsText: '', xText: '', threadTopicTag: '', xHashtags: [] }
  }
}

// ─── 게시 + DB 저장 ───

async function publishAndSave(params: {
  platform: 'THREADS' | 'X'
  text: string
  topicTag?: string
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
  // Threads: 토픽 태그 1개만, X: 해시태그 여러 개
  const finalText = params.platform === 'THREADS'
    ? (params.topicTag ? `${params.text}\n\n#${params.topicTag}` : params.text)
    : (params.hashtags.length > 0
      ? `${params.text}\n\n${params.hashtags.map(h => `#${h}`).join(' ')}`
      : params.text)

  // 링크 추가 (SOFT/DIRECT 홍보)
  const withLink = params.linkUrl && params.platform === 'X'
    ? `${finalText}\n${params.linkUrl}`
    : finalText

  let platformPostId: string | undefined
  let status: 'POSTED' | 'FAILED' = 'FAILED'

  try {
    if (params.platform === 'THREADS' && threadsClient.isConfigured()) {
      const result = await threadsClient.postThread(withLink)
      platformPostId = result.id
      status = 'POSTED'
    } else if (params.platform === 'X' && xClient.isConfigured()) {
      const result = await xClient.postTweet(withLink)
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

  // DB 저장 — hashtags는 호환성을 위해 배열로 저장
  const dbHashtags = params.platform === 'THREADS'
    ? (params.topicTag ? [params.topicTag] : [])
    : params.hashtags

  const post = await prisma.socialPost.create({
    data: {
      platform: params.platform,
      experimentId: params.experimentId ?? null,
      contentType: params.contentType,
      tone: params.tone,
      personaId: params.personaId,
      promotionLevel: params.promotionLevel,
      postText: params.text,
      hashtags: dbHashtags,
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
  const dayStrategy = getDayStrategy(new Date())
  const slot = detectOptimalSlot()

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

  // 3. 콘텐츠 파라미터 결정 (요일 전략 기반)
  const contentType = decideContentType(experiment, dayStrategy)
  const tone = decideTone(experiment, dayStrategy)
  const personaId = decidePersona(experiment, dayStrategy)
  const promotionLevel = decidePromotionLevel()

  console.log(`[SocialPoster] 결정: type=${contentType}, tone=${tone}, persona=${personaId}, promo=${promotionLevel}, slot=${slot}, day=${dayStrategy.dayName}`)

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
    contentType, tone, promotionLevel, personaId, dayStrategy,
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

    await createApprovalRequest({
      type: 'CONTENT_PUBLISH',
      title: `SNS 게시 승인 — ${SNS_PERSONAS[personaId]?.nickname ?? personaId} (${contentType})`,
      description: preview,
      payload: {
        contentType, tone, personaId, promotionLevel, slot, linkUrl,
        threadsText: content.threadsText, xText: content.xText,
        threadTopicTag: content.threadTopicTag, xHashtags: content.xHashtags,
        sourcePostId, experimentId: experiment?.id,
      },
      requestedBy: 'CMO_SOCIAL',
      status: 'PENDING',
    })

    // QUEUED 상태로 DB 저장 (승인 후 별도 게시 필요)
    if (content.threadsText) {
      await prisma.socialPost.create({
        data: {
          platform: 'THREADS', experimentId: experiment?.id ?? null,
          contentType, tone, personaId, promotionLevel,
          postText: content.threadsText, hashtags: content.threadTopicTag ? [content.threadTopicTag] : [],
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
        platform: 'THREADS', text: content.threadsText, topicTag: content.threadTopicTag, hashtags: [],
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
      details: JSON.stringify({ contentType, tone, personaId, promotionLevel, slot, day: dayStrategy.dayName, results }),
      itemCount: results.length,
      executionTimeMs: durationMs,
    },
  })

  // 8. Slack 알림
  const persona = SNS_PERSONAS[personaId]
  const statusEmoji = (s: string) => s === 'POSTED' ? '✅' : s === 'DRAFT' ? '📝' : '❌'

  const slackPreview = [
    `*페르소나*: ${persona?.nickname ?? personaId} | *유형*: ${contentType} | *톤*: ${tone} | *홍보*: ${promotionLevel} | *요일*: ${dayStrategy.dayName}`,
    content.threadsText ? `\n*Threads*: ${content.threadsText}\n#${content.threadTopicTag}` : '',
    content.xText ? `\n*X*: ${content.xText}\n${content.xHashtags.map(h => `#${h}`).join(' ')}` : '',
    `\n${results.map(r => `${statusEmoji(r.status)} ${r.platform}: ${r.status}${r.id ? ` (ID: ${r.id})` : ''}`).join(' | ')}`,
    linkUrl ? `\n🔗 ${linkUrl}` : '',
  ].join('')

  await notifySlack({
    level: 'info',
    agent: 'CMO_SOCIAL',
    title: `SNS 게시 완료 — ${results.filter(r => r.status === 'POSTED').length}/${results.length}개 성공`,
    body: slackPreview,
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
