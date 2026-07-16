/**
 * persona matcher shadow — CONTENT_CURATE 1경로 제한 적용 1단계 (2026-07-16 창업자 승인)
 *
 * 실제 발행 author는 기존 matchPersona(curator-shared) 로직 그대로 유지하고,
 * 신 matcher(persona-matcher-policy)라면 누구를 추천했을지를 BotLog(PERSONA_MATCHER_SHADOW)에
 * **나란히 기록만** 한다. Post write 없음. 실패해도 발행에 영향 0 (전체 try/catch).
 *
 * - 풀: A안 — curator 225 제한 (bot-* 통합 개방은 2단계 이후 검토)
 * - PERSONA_MATCHER_MODE: off(기본) | shadow | on
 *   on은 1단계 미지원 — 경고 후 shadow로 동작 (작성자 변경 코드는 창업자 검수 후 별도 PR)
 * - 노출 상태(exposure)는 shadow 자신의 추천 이력(BotLog)으로 재구성 —
 *   "신 matcher가 실전이라면 어떻게 로테이션했을까"를 일관되게 관찰하기 위함
 */
import { prisma } from '../core/db.js'
import { buildAllProfiles } from '../coo/persona-matcher-profiles.js'
import { analyzePost, matchPersona, type ExposureState, type TopicGroup } from '../coo/persona-matcher-policy.js'

import { resolveMatcherMode } from './persona-matcher-shadow-policy.js'

export const PERSONA_MATCHER_SHADOW_ACTION = 'PERSONA_MATCHER_SHADOW'

const strip = (h: string | null | undefined) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

interface ShadowInput {
  postId: string
  title: string
  content: string
  boardType: string
  category: string | null
  /** 기존 로직이 실제 발행에 쓴 curator persona id (예: 'A', 'S028') */
  actualPersonaId: string
}

/** 과거 shadow 추천 이력 → 현재 시점 노출 상태 재구성 (driver buildExposure와 동일 계산) */
function buildExposureFromHistory(history: Array<{ key: string; group: TopicGroup; at: number }>, nowMs: number): ExposureState {
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

/** 발행 성공 직후 호출 — mode off면 즉시 반환. 어떤 실패도 밖으로 던지지 않는다. */
export async function recordPersonaMatcherShadow(input: ShadowInput): Promise<void> {
  try {
    const mode = resolveMatcherMode(process.env.PERSONA_MATCHER_MODE)
    if (mode === 'off') return

    // A안: curator 풀 제한
    const profiles = buildAllProfiles().filter(p => p.origin === 'curator')

    // shadow 추천 이력 로드 (최근 500건 — 7일 로테이션 계산에 충분)
    const past = await prisma.botLog.findMany({
      where: { action: PERSONA_MATCHER_SHADOW_ACTION, createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: { createdAt: true, logData: true },
    })
    const history = past
      .map(r => {
        const d = r.logData as { recommendedPersona?: { key?: string }; topicGroups?: TopicGroup[] } | null
        return d?.recommendedPersona?.key
          ? { key: d.recommendedPersona.key, group: (d.topicGroups?.[0] ?? 'GENERAL') as TopicGroup, at: r.createdAt.getTime() }
          : null
      })
      .filter((h): h is { key: string; group: TopicGroup; at: number } => h !== null)

    const analysis = analyzePost({
      title: input.title,
      content: strip(input.content).slice(0, 1200),
      boardType: input.boardType,
      category: input.category,
    })
    const result = matchPersona(profiles, analysis, buildExposureFromHistory(history, Date.now()))

    const actualKey = `curator-${input.actualPersonaId}`
    await prisma.botLog.create({
      data: {
        botType: 'CAFE_CRAWLER',
        status: 'SUCCESS',
        action: PERSONA_MATCHER_SHADOW_ACTION,
        logData: {
          mode: 'shadow',
          pool: 'curator-only',
          postId: input.postId,
          title: input.title.slice(0, 80),
          boardType: input.boardType,
          category: input.category,
          topicGroups: result.topicGroups,
          actualPersona: actualKey,
          recommendedPersona: result.finalPick ? { key: result.finalPick.key, nickname: result.finalPick.nickname } : null,
          agree: result.finalPick?.key === actualKey,
          pickReason: result.pickReason,
          eligibleCount: result.eligibleCount,
          reserveFallback: result.reserveFallback,
          worldviewViolation: result.worldviewViolation,
          haikuSampleCandidate: result.haikuSampleCandidate,
          needsReview: result.needsReview,
          reviewReasons: result.reviewReasons,
          nicknameToneMismatch: result.nicknameToneMismatch,
        },
      },
    })
    console.log(
      `[PersonaMatcherShadow] 기록 — 실제 ${actualKey} / 추천 ${result.finalPick?.key ?? 'null'}${result.finalPick?.key === actualKey ? ' (일치)' : ''}`,
    )
  } catch (err) {
    // shadow는 관측 전용 — 어떤 실패도 발행 흐름에 영향 주지 않는다
    console.warn(`[PersonaMatcherShadow] 기록 실패(발행 무영향): ${err instanceof Error ? err.message : err}`)
  }
}
