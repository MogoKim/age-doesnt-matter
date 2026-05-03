// DISPATCH ONLY — controversy-chain:execute 핸들러로 runner.ts 통해 실행
/**
 * 갈등 DNA 논쟁 체인 엔진 (v12)
 *
 * 5단계 타이밍 체인 — 원글(T+0) + 5단계 = chainId당 최대 6개 하드코딩
 *
 *   T+0분   원글 (generatePost 호출부에서 직접 생성)
 *   T+15분  step1 — AC(HEALTH) 공감 댓글
 *   T+30분  step2 — G(RETIRE)  반론 댓글
 *   T+60분  step3 — 원 작성자  반박 대댓글
 *   T+100분 step4 — I(MEANING) 중재 댓글
 *   T+180분 step5 — AF(HUMOR)  추가 공감 댓글
 *
 * BotLog.details 타입: String? → JSON.stringify/parse 필수
 *
 * 사용법:
 *   scheduleChainFromPost(postId, authorPersonaId)  — 글 생성 직후 호출
 *   executePendingChainSteps()                      — cron 매 실행 시 호출
 */

import { generateComment, generateReply, getBotUser } from './generator.js'
import { prisma, disconnect } from '../core/db.js'
import { safeBotLog } from '../core/safe-log.js'

const MAX_CHAIN_STEPS = 6  // 원글 포함 chainId당 최대 6개

interface ChainStep {
  stepIndex: number           // 1~5 (0 = 원글, scheduleChainFromPost가 따로 처리)
  personaId: string
  action: 'comment' | 'reply'
  scheduledAt: string         // ISO string (UTC)
}

interface ChainRecord {
  chainId: string
  postId: string
  authorPersonaId: string
  steps: ChainStep[]
}

interface StepDoneRecord {
  chainId: string
  stepIndex: number
  postId: string
  personaId: string
}

function buildChainSteps(authorPersonaId: string, startTime: Date): ChainStep[] {
  // T+분 오프셋 × 페르소나 × 행동
  const plan: Array<{ offsetMin: number; personaId: string; action: 'comment' | 'reply' }> = [
    { offsetMin: 15,  personaId: 'AC',              action: 'comment' },  // 공감
    { offsetMin: 30,  personaId: 'G',               action: 'comment' },  // 반론
    { offsetMin: 60,  personaId: authorPersonaId,   action: 'reply'   },  // 반박 대댓글
    { offsetMin: 100, personaId: 'I',               action: 'comment' },  // 중재
    { offsetMin: 180, personaId: 'AF',              action: 'comment' },  // 추가 공감
  ]

  return plan.map((p, i) => ({
    stepIndex: i + 1,
    personaId: p.personaId,
    action: p.action,
    scheduledAt: new Date(startTime.getTime() + p.offsetMin * 60 * 1000).toISOString(),
  }))
}

/** T+0 글 생성 직후 호출 — BotLog에 체인 계획 기록 */
export async function scheduleChainFromPost(postId: string, authorPersonaId: string): Promise<void> {
  const chainId = `chain-${postId.slice(-8)}-${Date.now()}`
  const startTime = new Date()
  const steps = buildChainSteps(authorPersonaId, startTime)

  const record: ChainRecord = { chainId, postId, authorPersonaId, steps }

  await safeBotLog({
    botType: 'SEED',
    action: 'CONTROVERSY_CHAIN_SCHEDULED',
    status: 'SUCCESS',
    details: JSON.stringify(record),
    executionTimeMs: 0,
  }).catch(() => {})

  console.log(`[Chain] ${chainId} 예약 — ${steps.length}단계, postId=${postId}, 작성자=${authorPersonaId}`)
}

/** cron 정기 호출 — 실행 시간 된 단계 실행 */
export async function executePendingChainSteps(): Promise<void> {
  if (process.env.DRY_RUN === 'true') {
    console.log('[Chain] DRY_RUN — executePendingChainSteps 스킵')
    return
  }

  // KST 기준 오늘 자정 → UTC 변환 (scheduler.ts Bug 1 수정 방식과 동일)
  const KST_OFFSET = 9 * 60 * 60 * 1000
  const nowKst = new Date(Date.now() + KST_OFFSET)
  nowKst.setUTCHours(0, 0, 0, 0)
  const todayStart = new Date(nowKst.getTime() - KST_OFFSET)

  // 오늘 예약된 체인 전체 조회
  const chainLogs = await prisma.botLog.findMany({
    where: {
      botType: 'SEED',
      action: 'CONTROVERSY_CHAIN_SCHEDULED',
      createdAt: { gte: todayStart },
    },
    orderBy: { createdAt: 'asc' },
    select: { details: true },
  })

  // 오늘 완료된 단계 전체 선조회 (N+1 방지)
  const doneLogs = await prisma.botLog.findMany({
    where: {
      botType: 'SEED',
      action: 'CONTROVERSY_CHAIN_STEP_DONE',
      createdAt: { gte: todayStart },
    },
    select: { details: true },
  })

  // chainId → 완료 stepIndex Set
  const doneMap = new Map<string, Set<number>>()
  for (const log of doneLogs) {
    try {
      const d = JSON.parse(log.details as string) as Partial<StepDoneRecord>
      if (d.chainId && d.stepIndex !== undefined) {
        if (!doneMap.has(d.chainId)) doneMap.set(d.chainId, new Set())
        doneMap.get(d.chainId)!.add(d.stepIndex)
      }
    } catch { /* 파싱 실패 무시 */ }
  }

  const now = new Date()

  for (const log of chainLogs) {
    let record: ChainRecord
    try {
      record = JSON.parse(log.details as string) as ChainRecord
    } catch {
      continue
    }

    const { chainId, postId, authorPersonaId, steps } = record
    const doneSteps = doneMap.get(chainId) ?? new Set<number>()

    // chainId당 최대 MAX_CHAIN_STEPS - 1 (원글 제외) 완료 단계 제한
    if (doneSteps.size >= MAX_CHAIN_STEPS - 1) continue

    // 글이 아직 PUBLISHED 상태인지 확인 (삭제된 글에 댓글 금지)
    const post = await prisma.post.findFirst({
      where: { id: postId, status: 'PUBLISHED' },
      select: { id: true, title: true, content: true },
    })
    if (!post) {
      console.log(`[Chain] ${chainId} — 글 없음/삭제됨 (postId=${postId}), 스킵`)
      continue
    }

    for (const step of steps) {
      if (doneSteps.has(step.stepIndex)) continue          // 이미 완료
      if (new Date(step.scheduledAt) > now) continue       // 아직 시간 아님
      if (doneSteps.size >= MAX_CHAIN_STEPS - 1) break     // 이 체인 한도 도달

      try {
        await executeStep(step, post, chainId, authorPersonaId)
        doneSteps.add(step.stepIndex)  // 로컬 업데이트 (다음 루프에서 재조회 불필요)
      } catch (err) {
        console.error(`[Chain] ${chainId} step${step.stepIndex} 실패:`, err)
      }
    }
  }
}

async function executeStep(
  step: ChainStep,
  post: { id: string; title: string; content: string },
  chainId: string,
  authorPersonaId: string,
): Promise<void> {
  const userId = await getBotUser(step.personaId)

  if (step.action === 'comment') {
    // 이미 이 페르소나가 해당 글에 댓글을 달았는지 확인
    const existing = await prisma.comment.findFirst({
      where: { postId: post.id, authorId: userId },
    })
    if (existing) {
      console.log(`[Chain] ${chainId} step${step.stepIndex} — ${step.personaId} 이미 댓글 있음, 스킵`)
      return
    }

    // 봇 댓글 수 체인 한도(MAX_CHAIN_STEPS) 초과 방지
    const botCount = await prisma.comment.count({
      where: { postId: post.id, author: { email: { endsWith: '@unao.bot' } } },
    })
    if (botCount >= MAX_CHAIN_STEPS) {
      console.log(`[Chain] ${chainId} step${step.stepIndex} — 봇 댓글 한도 도달, 스킵`)
      return
    }

    const commentText = await generateComment(step.personaId, post.title, post.content)
    if (!commentText) return

    await prisma.$transaction([
      prisma.comment.create({ data: { postId: post.id, authorId: userId, content: commentText } }),
      prisma.post.update({ where: { id: post.id }, data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() } }),
    ])
    console.log(`[Chain] ${chainId} step${step.stepIndex} — ${step.personaId} 댓글: "${commentText.slice(0, 40)}"`)
  }

  if (step.action === 'reply') {
    // 가장 최근 봇 댓글에 반박 대댓글
    const targetComment = await prisma.comment.findFirst({
      where: {
        postId: post.id,
        parentId: null,
        author: { email: { endsWith: '@unao.bot' } },
        authorId: { not: userId },  // 자기 댓글에 답글 금지
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, authorId: true, content: true },
    })

    if (!targetComment) {
      console.log(`[Chain] ${chainId} step${step.stepIndex} — 반박 대상 댓글 없음, 스킵`)
      return
    }

    // 이미 이 페르소나가 해당 댓글에 답글 달았는지 확인
    const existingReply = await prisma.comment.findFirst({
      where: { parentId: targetComment.id, authorId: userId },
    })
    if (existingReply) return

    const authorId = await getBotUser(authorPersonaId)
    const replyText = await generateReply(step.personaId, post.title, targetComment.content)
    if (!replyText) return

    await prisma.$transaction([
      prisma.comment.create({
        data: { postId: post.id, authorId: userId, content: replyText, parentId: targetComment.id },
      }),
      prisma.post.update({ where: { id: post.id }, data: { commentCount: { increment: 1 }, lastEngagedAt: new Date() } }),
    ])
    console.log(`[Chain] ${chainId} step${step.stepIndex} — ${step.personaId} 반박댓글: "${replyText.slice(0, 40)}"`)
    void authorId  // 미사용 경고 방지
  }

  // 단계 완료 BotLog 기록
  const doneRecord: StepDoneRecord = { chainId, stepIndex: step.stepIndex, postId: post.id, personaId: step.personaId }
  await safeBotLog({
    botType: 'SEED',
    action: 'CONTROVERSY_CHAIN_STEP_DONE',
    status: 'SUCCESS',
    details: JSON.stringify(doneRecord),
    executionTimeMs: 0,
  }).catch(() => {})
}

async function main() {
  await executePendingChainSteps()
  await disconnect()
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
