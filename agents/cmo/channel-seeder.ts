import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { createApprovalRequest } from '../core/approval-helper.js'

/**
 * CMO Channel Seeder — 외부 채널 홍보 초안 생성 에이전트
 *
 * 흐름:
 * 1. 오늘의 인기 콘텐츠 수집 (인기글, 매거진, 일자리)
 * 2. 채널별(카카오 오픈채팅, 당근마켓, 커뮤니티) 맞춤 초안 생성
 * 3. ChannelDraft + AdminQueue 저장 (창업자 승인 대기)
 * 4. Slack 알림 + BotLog
 */

const MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const client = new Anthropic()
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL ?? 'https://www.age-doesnt-matter.com').trim()

type ChannelType = 'KAKAO_OPENCHAT' | 'DANGGEUN' | 'COMMUNITY'

interface ContentSource {
  popularPosts: Array<{ id: string; title: string; boardType: string; likeCount: number; content: string }>
  latestMagazine: { id: string; title: string; content: string } | null
  latestJobs: Array<{ id: string; title: string; company: string | null; location: string | null }>
}

interface DraftOutput {
  channel: ChannelType
  drafts: Array<{ targetName: string; draftText: string; linkUrl: string }>
}

// ─── 콘텐츠 소스 수집 ───

async function fetchContentSources(): Promise<ContentSource> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [popularPosts, latestMagazine, latestJobs] = await Promise.all([
    prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        createdAt: { gte: yesterday },
      },
      orderBy: { likeCount: 'desc' },
      take: 3,
      select: { id: true, title: true, boardType: true, likeCount: true, content: true },
    }),
    prisma.post.findFirst({
      where: {
        boardType: 'MAGAZINE',
        status: 'PUBLISHED',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, content: true },
    }),
    prisma.post.findMany({
      where: {
        boardType: 'JOBS',
        status: 'PUBLISHED',
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, title: true, company: true, location: true },
    }),
  ])

  return { popularPosts, latestMagazine, latestJobs }
}

// ─── 채널별 초안 생성 ───

const CHANNEL_CONFIG: Record<ChannelType, { description: string; toneGuide: string; targets: string[] }> = {
  KAKAO_OPENCHAT: {
    description: '카카오톡 오픈채팅방',
    toneGuide: '캐주얼하고 친근한 또래 대화 톤. "이런 글 봤는데 유용하더라고요~", "혹시 이런 정보 필요하신 분?" 식으로 자연스럽게.',
    targets: ['50대 모임방', '60대 건강 오픈톡', '은퇴 후 생활 오픈톡'],
  },
  DANGGEUN: {
    description: '당근마켓 동네생활',
    toneGuide: '짧고 친근한 동네 이웃 톤. 지역 기반 공감 + 실용 정보 중심. 50-80자 내외.',
    targets: ['동네생활 게시판'],
  },
  COMMUNITY: {
    description: '온라인 커뮤니티 (카페, 포럼 등)',
    toneGuide: '정보 제공 위주, 도움이 되는 톤. 자연스럽게 끝에 출처/참고 언급. 200-300자.',
    targets: ['네이버 카페', '다음 카페', '커뮤니티 사이트'],
  },
}

const BOARD_SLUG: Record<string, string> = {
  STORIES: 'stories',
  HEALTH: 'health',
  MAGAZINE: 'magazine',
  JOBS: 'jobs',
  FREE: 'free',
}

function buildPostUrl(boardType: string, postId: string): string {
  const slug = BOARD_SLUG[boardType] ?? 'stories'
  return `${SITE_URL}/community/${slug}/${postId}`
}

async function generateDraftsForChannel(
  channel: ChannelType,
  sources: ContentSource,
): Promise<DraftOutput> {
  const config = CHANNEL_CONFIG[channel]

  const popularSummary = sources.popularPosts.length > 0
    ? sources.popularPosts.map(p => `- "${p.title}" (공감 ${p.likeCount}개) → ${buildPostUrl(p.boardType, p.id)}`).join('\n')
    : '(인기글 없음)'

  const magazineSummary = sources.latestMagazine
    ? `- "${sources.latestMagazine.title}" → ${SITE_URL}/community/magazine/${sources.latestMagazine.id}`
    : '(매거진 없음)'

  const jobSummary = sources.latestJobs.length > 0
    ? sources.latestJobs.map(j => `- "${j.title}"${j.company ? ` (${j.company})` : ''}${j.location ? ` - ${j.location}` : ''} → ${SITE_URL}/community/jobs/${j.id}`).join('\n')
    : '(일자리 없음)'

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `당신은 50대 60대 커뮤니티 "우리 나이가 어때서"의 마케팅 담당입니다.
외부 채널에 올릴 홍보 초안을 작성합니다.

절대 규칙:
- "시니어", "액티브 시니어" 절대 사용 금지. 대신 "우리 또래", "50대 60대", "인생 2막" 사용
- 가치 제공이 먼저, 링크는 자연스럽게 끝에
- 광고처럼 보이지 않게, 실제 경험 공유하는 것처럼
- 각 초안은 독립적으로 사용 가능해야 함`,
    messages: [
      {
        role: 'user',
        content: `아래 콘텐츠를 활용해서 "${config.description}" 채널에 올릴 홍보 초안 3-5개를 만들어주세요.

[채널 특성]
${config.toneGuide}

[타겟 장소]
${config.targets.join(', ')}

[오늘의 인기글]
${popularSummary}

[최신 매거진]
${magazineSummary}

[최신 일자리]
${jobSummary}

응답 형식 (JSON):
{
  "drafts": [
    {
      "targetName": "타겟 장소명 (예: 50대 모임방)",
      "draftText": "실제 올릴 텍스트",
      "linkUrl": "관련 링크 URL"
    }
  ]
}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()

  try {
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}') as {
      drafts: Array<{ targetName: string; draftText: string; linkUrl: string }>
    }
    return { channel, drafts: parsed.drafts ?? [] }
  } catch (err) {
    console.error(`[ChannelSeeder] ${channel} JSON 파싱 실패:`, err instanceof Error ? err.message : err)
    return { channel, drafts: [] }
  }
}

// ─── 메인 실행 ───

async function main() {
  console.log('[ChannelSeeder] 시작')
  const startTime = Date.now()

  // 1. 콘텐츠 소스 수집
  const sources = await fetchContentSources()
  console.log(`[ChannelSeeder] 소스 수집 완료 — 인기글 ${sources.popularPosts.length}, 매거진 ${sources.latestMagazine ? 1 : 0}, 일자리 ${sources.latestJobs.length}`)

  // 2. 채널별 초안 생성
  const channels: ChannelType[] = ['KAKAO_OPENCHAT', 'DANGGEUN', 'COMMUNITY']
  const allResults = await Promise.all(
    channels.map(ch => generateDraftsForChannel(ch, sources)),
  )

  // 3. ChannelDraft + AdminQueue 저장
  let totalDrafts = 0
  const slackPreviewLines: string[] = []

  for (const result of allResults) {
    if (result.drafts.length === 0) continue

    const draftIds: string[] = []

    for (const draft of result.drafts) {
      const saved = await prisma.channelDraft.create({
        data: {
          channel: result.channel,
          targetName: draft.targetName,
          draftText: draft.draftText,
          linkUrl: draft.linkUrl,
          imageUrls: [],
          status: 'PENDING',
        },
      })
      draftIds.push(saved.id)
      totalDrafts++
    }

    // AdminQueue 등록 + Slack 승인 알림
    await createApprovalRequest({
      type: 'CONTENT_PUBLISH',
      title: `[채널시딩] ${result.channel} 초안 ${result.drafts.length}건`,
      payload: JSON.stringify({ draftIds }),
      requestedBy: 'CMO_CHANNEL_SEEDER',
      status: 'PENDING',
    })

    // Slack 미리보기
    slackPreviewLines.push(`*${result.channel}* (${result.drafts.length}건)`)
    for (const draft of result.drafts.slice(0, 2)) {
      slackPreviewLines.push(`  > ${draft.draftText.slice(0, 80)}...`)
    }
    if (result.drafts.length > 2) {
      slackPreviewLines.push(`  ... 외 ${result.drafts.length - 2}건`)
    }
  }

  // 4. Slack 알림
  await notifySlack({
    level: 'info',
    agent: 'CMO',
    title: `채널 시딩 초안 생성 완료 — ${totalDrafts}건 승인 대기`,
    body: slackPreviewLines.join('\n') || '(생성된 초안 없음)',
  })

  // 5. BotLog
  const durationMs = Date.now() - startTime
  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'CHANNEL_SEED',
      status: totalDrafts > 0 ? 'SUCCESS' : 'PARTIAL',
      details: JSON.stringify({
        channels: allResults.map(r => ({ channel: r.channel, draftCount: r.drafts.length })),
        sources: {
          popularPosts: sources.popularPosts.length,
          magazine: sources.latestMagazine ? 1 : 0,
          jobs: sources.latestJobs.length,
        },
      }),
      itemCount: totalDrafts,
      executionTimeMs: durationMs,
    },
  })

  console.log(`[ChannelSeeder] 완료 — ${totalDrafts}건 초안 생성, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[ChannelSeeder] 치명적 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO',
    title: '채널 시딩 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
