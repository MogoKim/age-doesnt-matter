// COO 에이전트 — persona matcher dry-run (2026-07-15)
// 최근 발행 글 표본에 대해 "새 matcher라면 어떤 페르소나를 추천했을지"를 시간순 시뮬레이션으로
// 판정하고 **BotLog(PERSONA_MATCHER_DRYRUN)에만 기록한다. Post.authorId 등 그 외 DB write 절대 없음.**
// 과거 글 authorId 재매핑 아님 — 창업자 검수 후 신규 발행 1경로 제한 적용이 다음 단계.
// AI 호출 없음(rule/scoring 전용). 380명 확장 본구현 아님.
// DISPATCH ONLY — 사유: dry-run 검수 단계, 크론 미연결 (workflow_dispatch coo/persona-matcher-dryrun로 수동 실행)
import { fileURLToPath } from 'url'
import { resolve } from 'path'
import { prisma, disconnect } from '../core/db.js'
import { buildAllProfiles } from './persona-matcher-profiles.js'
import { analyzePost, matchPersona, type ExposureState, type TopicGroup } from './persona-matcher-policy.js'

export const PERSONA_MATCHER_ACTION = 'PERSONA_MATCHER_DRYRUN'
const SAMPLE_SIZE = Math.min(300, Number(process.env.PERSONA_MATCHER_SAMPLE ?? 150))

const strip = (h: string | null) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

/** 이메일 → 관측 key (bot-a → 'A', curator-a → 'curator-A') — 매칭 실패 시 원문 유지 */
function emailToKey(email: string | null | undefined): string {
  const bot = (email ?? '').match(/^bot-([a-z0-9]+)@unao\.bot$/i)?.[1]
  if (bot) return bot.toUpperCase()
  const curator = (email ?? '').match(/^curator-([a-z0-9]+)@unao\.bot$/i)?.[1]
  if (curator) return `curator-${curator.toUpperCase()}`
  return email ?? 'unknown'
}

interface Assignment {
  key: string
  group: TopicGroup
  at: number
}

/** 시뮬 이력 → 그 시점의 노출 상태 재구성 (daily=KST 동일 날짜, weekly=rolling 7일, firstScreen=직전 20건) */
function buildExposure(history: Assignment[], nowMs: number): ExposureState {
  const kstDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10)
  const today = kstDay(nowMs)
  const e: ExposureState = { daily: {}, weekly: {}, firstScreen: {}, recentGroups72h: {}, lastGroup: {}, lastAssignedAt: {} }
  for (const h of history) {
    if (kstDay(h.at) === today) e.daily[h.key] = (e.daily[h.key] ?? 0) + 1
    if (nowMs - h.at <= 7 * 24 * 3600_000) e.weekly[h.key] = (e.weekly[h.key] ?? 0) + 1
    if (nowMs - h.at <= 72 * 3600_000) e.recentGroups72h[h.key] = [...(e.recentGroups72h[h.key] ?? []), h.group]
    e.lastGroup[h.key] = h.group
    e.lastAssignedAt[h.key] = h.at
  }
  for (const h of history.slice(-20)) e.firstScreen[h.key] = (e.firstScreen[h.key] ?? 0) + 1
  return e
}

export async function main(): Promise<void> {
  const started = Date.now()
  const profiles = buildAllProfiles()
  console.log(`[PersonaMatcher] dry-run 시작 — 프로필 ${profiles.length}명 (bot ${profiles.filter(p => p.origin === 'bot').length} / curator ${profiles.filter(p => p.origin === 'curator').length}), 표본 최대 ${SAMPLE_SIZE}건`)

  const posts = (
    await prisma.post.findMany({
      where: { source: { in: ['BOT', 'SHEET'] }, boardType: { in: ['STORY', 'LIFE2', 'HUMOR'] }, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: SAMPLE_SIZE,
      select: { id: true, title: true, content: true, source: true, boardType: true, category: true, createdAt: true, author: { select: { email: true } } },
    })
  ).reverse() // 오래된 순으로 시뮬레이션

  const history: Assignment[] = []
  const stats = { total: 0, diff: 0, reserve: 0, violation: 0, review: 0, single: 0, noCandidate: 0 }

  for (const post of posts) {
    const analysis = analyzePost({ title: post.title, content: strip(post.content).slice(0, 1200), boardType: post.boardType, category: post.category })
    const exposure = buildExposure(history, post.createdAt.getTime())
    const result = matchPersona(profiles, analysis, exposure)

    const actualAuthor = emailToKey(post.author?.email)
    const differs = result.finalPick !== null && result.finalPick.key !== actualAuthor
    stats.total++
    if (differs) stats.diff++
    if (result.reserveFallback) stats.reserve++
    if (result.worldviewViolation) stats.violation++
    if (result.needsReview) stats.review++
    if (result.singleCandidateWarning) stats.single++
    if (!result.finalPick && !result.worldviewViolation) stats.noCandidate++

    if (result.finalPick) {
      history.push({ key: result.finalPick.key, group: result.topicGroups[0], at: post.createdAt.getTime() })
    }

    // hard 제외는 사유별 압축 (전체 나열 대신 count + 표본 key)
    const excludedSummary: Record<string, { count: number; sample: string[] }> = {}
    for (const [key, reason] of Object.entries(result.excluded)) {
      excludedSummary[reason] = excludedSummary[reason] ?? { count: 0, sample: [] }
      excludedSummary[reason].count++
      if (excludedSummary[reason].sample.length < 6) excludedSummary[reason].sample.push(key)
    }

    await prisma.botLog.create({
      data: {
        botType: 'COO',
        status: 'SUCCESS',
        action: PERSONA_MATCHER_ACTION,
        logData: {
          dryRun: true,
          postId: post.id,
          source: post.source,
          boardType: post.boardType,
          category: post.category ?? null,
          title: post.title.slice(0, 80),
          topicGroups: result.topicGroups,
          speakerClues: result.speakerClues,
          worldviewViolation: result.worldviewViolation,
          haikuSampleCandidate: result.haikuSampleCandidate,
          excludedSummary,
          eligibleTop: result.eligible.slice(0, 5).map(c => ({ key: c.key, score: c.score, penalties: c.penalties })),
          eligibleCount: result.eligibleCount,
          singleCandidateWarning: result.singleCandidateWarning,
          reserveFallback: result.reserveFallback,
          finalPick: result.finalPick,
          pickReason: result.pickReason,
          actualAuthor,
          recommendationDiffers: differs,
          needsReview: result.needsReview,
          reviewReasons: result.reviewReasons,
        },
      },
    })
  }

  const summary = {
    dryRun: true,
    kind: 'SUMMARY',
    sample: stats.total,
    recommendationDiffers: stats.diff,
    reserveFallback: stats.reserve,
    worldviewViolations: stats.violation,
    needsReview: stats.review,
    singleCandidateWarnings: stats.single,
    noCandidate: stats.noCandidate,
    profiles: profiles.length,
    tookMs: Date.now() - started,
  }
  await prisma.botLog.create({ data: { botType: 'COO', status: 'SUCCESS', action: PERSONA_MATCHER_ACTION, logData: summary } })
  console.log(`[PersonaMatcher] dry-run 완료 — ${JSON.stringify(summary)}`)
}

const isDirectRun = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
if (isDirectRun) {
  main()
    .catch(err => {
      console.error('[PersonaMatcher] 실행 실패:', err)
      process.exitCode = 1
    })
    .finally(() => disconnect())
}
