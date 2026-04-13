import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { createApprovalRequest } from '../core/approval-helper.js'
import * as xClient from './platforms/x-client.js'
import * as threadsClient from './platforms/threads-client.js'
import * as instagramClient from './platforms/instagram-client.js'
import * as facebookClient from './platforms/facebook-client.js'
import * as bandClient from './platforms/band-client.js'
import { getDayStrategy, getTopicTag, detectOptimalSlot, THREADS_TONE_GUIDE, DWELL_TIME_GUIDE } from './threads-config.js'
import { getActiveAdapters, type PlatformAdapter } from './platforms/platform-adapters.js'
import { getCMOContext, type CMOContext } from './knowledge-base.js'

/**
 * CMO Social Poster — SNS 자동 게시 에이전트
 *
 * 흐름:
 * 1. 현재 활성 실험(SocialExperiment) 읽기
 * 2. CMO 컨텍스트 로드 (knowledge-base 피드백 루프)
 * 3. 활성 플랫폼 어댑터별로 콘텐츠 생성
 * 4. 각 플랫폼에 실제 게시 (or AdminQueue 승인 대기)
 * 5. SocialPost DB 저장 + Slack 알림
 */

const MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const client = new Anthropic()
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL ?? 'https://www.age-doesnt-matter.com').trim()

// ─── 페르소나 정의 (SNS용 4명) ───

const SNS_PERSONAS: Record<string, { nickname: string; tone: string; style: string }> = {
  A: { nickname: '영숙이맘', tone: 'warm', style: '따뜻하고 공감하는 이웃 언니 톤, 자연스러운 반말, 이모지 1-2개' },
  B: { nickname: '정순씨', tone: 'informational', style: '차분한 일기체 톤, 합니다체 위주, 은퇴 일상 깊이 있는 이야기' },
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

// ─── 플랫폼별 AI 콘텐츠 생성 ───

interface PlatformContent {
  text: string
  hashtags: string[]
  topicTag?: string // Threads 전용
}

function buildCMOContextBlock(cmoContext: CMOContext): string {
  const parts: string[] = []

  // 오늘의 심리 프로파일 — 가장 먼저, 가장 크게 (콘텐츠 방향 결정)
  if (cmoContext.todayDominantDesire || cmoContext.urgentTopics.length > 0) {
    const desireLabel: Record<string, string> = {
      HEALTH: '건강/증상/병원',
      FAMILY: '가족/자녀/손주',
      MONEY: '돈/재테크/연금',
      RETIRE: '은퇴/노후/인생2막',
      JOB: '일자리/자격증',
      RELATION: '관계/외로움/소통',
      HOBBY: '취미/여가',
      MEANING: '삶의 의미/감사/보람',
    }
    const emotionLabel: Record<string, string> = {
      ANXIOUS: '불안', LONELY: '외로움', ANGRY: '분노/억울',
      HOPEFUL: '기대/희망', RESIGNED: '체념', GRATEFUL: '감사', PROUD: '자랑/성취',
    }

    const psychLines: string[] = []
    if (cmoContext.todayDominantDesire) {
      psychLines.push(`- 오늘 주된 관심사: **${desireLabel[cmoContext.todayDominantDesire] ?? cmoContext.todayDominantDesire}**`)
    }
    if (cmoContext.todayDominantEmotion) {
      psychLines.push(`- 오늘의 감정 흐름: ${emotionLabel[cmoContext.todayDominantEmotion] ?? cmoContext.todayDominantEmotion}`)
    }
    if (cmoContext.urgentTopics.length > 0) {
      const top = cmoContext.urgentTopics[0]
      psychLines.push(`- 긴급 관심사: ${top.psychInsight || desireLabel[top.topic] || top.topic} (긴급도 ${top.urgencyAvg}/5, ${top.count}개 글)`)
    }
    if (Object.keys(cmoContext.desireMap).length > 0) {
      const topDesires = Object.entries(cmoContext.desireMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${desireLabel[k] ?? k} ${v}%`)
        .join(', ')
      psychLines.push(`- 욕망 분포: ${topDesires}`)
    }
    psychLines.push(`→ 오늘 콘텐츠는 이 관심사와 감정에 공명하는 방향으로 작성하세요.`)
    psychLines.push(`  직접 인용 금지. 당신의 개성으로 자연스럽게 녹여내세요.`)

    parts.push(`## 오늘의 커뮤니티 심리 프로파일\n${psychLines.join('\n')}`)
  }

  if (cmoContext.recentLearnings.length > 0) {
    parts.push(`## 최근 학습 (지난 실험 결과)\n${cmoContext.recentLearnings.join('\n')}`)
  }

  if (cmoContext.strategyMemo) {
    parts.push(`## 이번 주 전략\n${cmoContext.strategyMemo}`)
  }

  if (cmoContext.topPerformingContent.length > 0) {
    parts.push(`## 성과 TOP 3\n${cmoContext.topPerformingContent.map(c => `${c.platform} ${c.contentType}: 평균 참여 ${c.avgEngagement.toFixed(1)}`).join('\n')}`)
  }

  return parts.length > 0 ? parts.join('\n\n') : ''
}

async function generatePlatformContent(params: {
  adapter: PlatformAdapter
  contentType: string
  tone: string
  promotionLevel: string
  personaId: string
  dayStrategy: ReturnType<typeof getDayStrategy>
  cmoContext: CMOContext
  sourceTitle?: string
  sourcePreview?: string
  sourceUrl?: string
}): Promise<PlatformContent> {
  const { adapter } = params
  const persona = SNS_PERSONAS[params.personaId]
  const isPromo = params.promotionLevel !== 'PURE'
  const dayOfWeek = new Date().getDay()
  const platformDayStrategy = adapter.dayStrategies[dayOfWeek] ?? ''

  const cmoContextBlock = buildCMOContextBlock(params.cmoContext)

  // Threads는 기존의 상세한 톤/체류시간 가이드를 유지
  const threadsSpecificGuide = adapter.platform === 'THREADS' ? `
[톤 규칙]
${THREADS_TONE_GUIDE}

[체류 시간 최적화 — Threads 알고리즘 핵심]
${DWELL_TIME_GUIDE}
` : ''

  const systemPrompt = `당신은 50-60대 커뮤니티 "우리 나이가 어때서"의 ${adapter.name} 마케터입니다.
${persona ? `페르소나: ${persona.nickname} (${persona.style})` : ''}

[플랫폼: ${adapter.name}]
- 톤: ${adapter.tone}
- 최대 글자수: ${adapter.maxLength}자
- 포맷 가이드:
${adapter.formatGuide}
- 해시태그 전략: ${adapter.hashtagStrategy}
- 타겟: ${adapter.demographicNotes}

[오늘의 전략]
${platformDayStrategy}
${threadsSpecificGuide}
[콘텐츠 규칙]
- 톤: ${params.tone}
- "시니어", "액티브 시니어" 절대 금지 → "우리 또래", "50대 60대", "인생 2막"
${isPromo ? '- 우나어 커뮤니티 언급 자연스럽게 포함' : '- 홍보 없이 순수 콘텐츠로'}
${params.promotionLevel === 'DIRECT' ? '- "우리 나이가 어때서" 커뮤니티를 직접 추천' : ''}

${cmoContextBlock ? `[CMO 컨텍스트 — 최근 데이터 기반 최적화]\n${cmoContextBlock}` : ''}

반드시 JSON으로만 응답:
{"text": "...", "hashtags": ["...", "..."]}${adapter.platform === 'THREADS' ? '\n추가 필드: "topic_tag": "일상" (토픽 태그 1개, #없이)' : ''}`

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
      text: string; hashtags?: string[]; topic_tag?: string
    }
    return {
      text: parsed.text ?? '',
      hashtags: parsed.hashtags ?? [],
      topicTag: parsed.topic_tag ?? (adapter.platform === 'THREADS' ? getTopicTag(params.contentType) : undefined),
    }
  } catch (err) {
    console.error(`[SocialPoster] ${adapter.name} JSON 파싱 실패, 원본:`, jsonStr.slice(0, 200))
    await notifySlack({
      level: 'important',
      agent: 'CMO_SOCIAL',
      title: `${adapter.name} 콘텐츠 생성 실패 — AI JSON 파싱 오류`,
      body: `원본: ${jsonStr.slice(0, 150)}...\n${err instanceof Error ? err.message : ''}`,
    })
    return { text: '', hashtags: [] }
  }
}

// ─── 게시 + DB 저장 ───

type SocialPlatformType = 'THREADS' | 'X' | 'INSTAGRAM' | 'FACEBOOK' | 'BAND'

async function publishAndSave(params: {
  platform: SocialPlatformType
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
  // 플랫폼별 최종 텍스트 구성
  let finalText: string
  if (params.platform === 'THREADS') {
    // Threads: 토픽 태그 1개만
    finalText = params.topicTag ? `${params.text}\n\n#${params.topicTag}` : params.text
  } else if (params.platform === 'BAND') {
    // Band: 해시태그 없음 (문화적 특성)
    finalText = params.text
  } else {
    // X, Instagram, Facebook: 해시태그 여러 개
    finalText = params.hashtags.length > 0
      ? `${params.text}\n\n${params.hashtags.map(h => `#${h}`).join(' ')}`
      : params.text
  }

  // 링크 추가 (SOFT/DIRECT 홍보) — X와 Facebook에서 링크 첨부
  const withLink = params.linkUrl && (params.platform === 'X' || params.platform === 'FACEBOOK')
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
    } else if (params.platform === 'INSTAGRAM' && instagramClient.isConfigured()) {
      // Instagram은 이미지 필수 — 텍스트만 있으면 DRAFT로 저장
      // TODO: 카드뉴스 생성기와 연동하여 이미지 자동 생성
      console.log(`[SocialPoster] Instagram: 이미지 없이 텍스트만 — DRAFT로 저장`)
      status = 'DRAFT' as 'POSTED'
    } else if (params.platform === 'FACEBOOK' && facebookClient.isConfigured()) {
      const result = await facebookClient.postText(withLink, params.linkUrl)
      platformPostId = result.id
      status = 'POSTED'
    } else if (params.platform === 'BAND' && bandClient.isConfigured()) {
      const result = await bandClient.postText(withLink)
      platformPostId = result.postKey
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

  // 1. 현재 실험 조회 + CMO 컨텍스트 로드
  const [experiment, cmoContext] = await Promise.all([
    getActiveExperiment(),
    getCMOContext(),
  ])

  if (experiment) {
    console.log(`[SocialPoster] 활성 실험: ${experiment.hypothesis} (${experiment.variable}: ${experiment.controlValue} vs ${experiment.testValue})`)
  }

  if (cmoContext.recentLearnings.length > 0) {
    console.log(`[SocialPoster] CMO 컨텍스트: 학습 ${cmoContext.recentLearnings.length}건, TOP 성과 ${cmoContext.topPerformingContent.length}건`)
  }
  if (cmoContext.todayDominantDesire) {
    console.log(`[SocialPoster] 오늘 심리 프로파일: 욕망=${cmoContext.todayDominantDesire}, 감정=${cmoContext.todayDominantEmotion ?? '없음'}, 긴급토픽=${cmoContext.urgentTopics.length}개`)
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

  // 5. 활성 플랫폼 어댑터별 콘텐츠 생성
  const adapters = getActiveAdapters()
  if (adapters.length === 0) {
    console.log('[SocialPoster] 활성 플랫폼 없음 — 종료')
    await disconnect()
    return
  }

  console.log(`[SocialPoster] 활성 플랫폼: ${adapters.map(a => a.name).join(', ')}`)

  const linkUrl = promotionLevel !== 'PURE' ? (sourceUrl ?? SITE_URL) : undefined

  // 플랫폼별 콘텐츠 생성 (순차 — AI 호출 비용 관리)
  const platformContents = new Map<SocialPlatformType, PlatformContent>()
  for (const adapter of adapters) {
    const content = await generatePlatformContent({
      adapter, contentType, tone, promotionLevel, personaId, dayStrategy, cmoContext,
      sourceTitle, sourcePreview, sourceUrl: linkUrl,
    })
    if (content.text) {
      platformContents.set(adapter.platform as SocialPlatformType, content)
    }
  }

  if (platformContents.size === 0) {
    console.log('[SocialPoster] 모든 플랫폼 콘텐츠 생성 실패 — 스킵')
    await disconnect()
    return
  }

  // 6. 자동 게시 여부 판단 (AdminQueue 승인 워크플로우)
  const autoPost = await shouldAutoPost(experiment)
  const results: Array<{ platform: string; status: string; id?: string }> = []

  if (!autoPost) {
    // AdminQueue에 승인 요청 등록
    const previewParts = [
      `[${contentType}] ${SNS_PERSONAS[personaId]?.nickname ?? personaId} / ${tone} / ${promotionLevel}`,
    ]
    for (const [platform, content] of platformContents) {
      previewParts.push(`\n${platform}: ${content.text.slice(0, 80)}...`)
    }
    if (linkUrl) previewParts.push(`\n🔗 ${linkUrl}`)
    const preview = previewParts.join('')

    // 승인 요청에 모든 플랫폼 콘텐츠 포함
    const payloadContents: Record<string, { text: string; hashtags: string[]; topicTag?: string }> = {}
    for (const [platform, content] of platformContents) {
      payloadContents[platform] = { text: content.text, hashtags: content.hashtags, topicTag: content.topicTag }
    }

    await createApprovalRequest({
      type: 'CONTENT_PUBLISH',
      title: `SNS 게시 승인 — ${SNS_PERSONAS[personaId]?.nickname ?? personaId} (${contentType}) [${platformContents.size}개 플랫폼]`,
      description: preview,
      payload: {
        contentType, tone, personaId, promotionLevel, slot, linkUrl,
        platformContents: payloadContents,
        sourcePostId, experimentId: experiment?.id,
      },
      requestedBy: 'CMO_SOCIAL',
      status: 'PENDING',
    })

    // QUEUED 상태로 DB 저장
    for (const [platform, content] of platformContents) {
      await prisma.socialPost.create({
        data: {
          platform, experimentId: experiment?.id ?? null,
          contentType, tone, personaId, promotionLevel,
          postText: content.text,
          hashtags: platform === 'THREADS' ? (content.topicTag ? [content.topicTag] : []) : content.hashtags,
          sourcePostId: sourcePostId ?? null, postingSlot: slot,
          linkUrl: linkUrl ?? null, status: 'QUEUED',
        },
      })
      results.push({ platform, status: 'QUEUED' })
    }

    await notifySlack({
      level: 'info',
      agent: 'CMO_SOCIAL',
      title: `SNS 게시 승인 대기 — /una-approve 로 승인 (${platformContents.size}개 플랫폼)`,
      body: preview,
    })
  } else {
    // 자동 게시 (exploit 모드) — 각 플랫폼별로 게시
    for (const [platform, content] of platformContents) {
      const r = await publishAndSave({
        platform,
        text: content.text,
        topicTag: content.topicTag,
        hashtags: content.hashtags,
        contentType, tone, personaId, promotionLevel,
        sourcePostId, linkUrl, experimentId: experiment?.id, slot,
      })
      results.push({ platform, status: r.status, id: r.platformPostId })
    }
  }

  // 7. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'SOCIAL_POST',
      status: results.some(r => r.status === 'POSTED') ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({ contentType, tone, personaId, promotionLevel, slot, day: dayStrategy.dayName, platforms: adapters.map(a => a.name), results }),
      itemCount: results.length,
      executionTimeMs: durationMs,
    },
  })

  // 8. Slack 알림
  const persona = SNS_PERSONAS[personaId]
  const statusEmoji = (s: string) => s === 'POSTED' ? '✅' : s === 'QUEUED' ? '⏳' : s === 'DRAFT' ? '📝' : '❌'

  const slackParts = [
    `*페르소나*: ${persona?.nickname ?? personaId} | *유형*: ${contentType} | *톤*: ${tone} | *홍보*: ${promotionLevel} | *요일*: ${dayStrategy.dayName}`,
  ]

  for (const [platform, content] of platformContents) {
    const hashtagText = platform === 'THREADS' && content.topicTag
      ? `#${content.topicTag}`
      : content.hashtags.map(h => `#${h}`).join(' ')
    slackParts.push(`\n*${platform}*: ${content.text}${hashtagText ? `\n${hashtagText}` : ''}`)
  }

  slackParts.push(`\n${results.map(r => `${statusEmoji(r.status)} ${r.platform}: ${r.status}${r.id ? ` (ID: ${r.id})` : ''}`).join(' | ')}`)
  if (linkUrl) slackParts.push(`\n🔗 ${linkUrl}`)

  const slackPreview = slackParts.join('')

  await notifySlack({
    level: 'info',
    agent: 'CMO_SOCIAL',
    title: `SNS 게시 완료 — ${results.filter(r => r.status === 'POSTED').length}/${results.length}개 성공 (${adapters.map(a => a.name).join(', ')})`,
    body: slackPreview,
  })

  console.log(`[SocialPoster] 완료 — ${results.length}개 게시 (${adapters.map(a => a.name).join(', ')}), ${Math.round(durationMs / 1000)}초`)
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
