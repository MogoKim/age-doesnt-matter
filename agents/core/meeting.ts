/**
 * 에이전트 회의 프레임워크
 *
 * CEO-CMO-CDO 등이 "회의"하는 구조를 AI 순차 호출로 구현.
 * chair가 질문 → participants가 답변 → chair가 종합·결론.
 *
 * 비용: sonnet 1회 + haiku N회 ≈ $0.02/회의
 * 회의록: BotLog(action='MEETING') + #회의록 Slack 채널
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from './db.js'
import { sendSlackMessage } from './notifier.js'
import type { MeetingAction } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const constitution = readFileSync(resolve(__dirname, 'constitution.yaml'), 'utf-8')

const client = new Anthropic()
const MODEL_HEAVY = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'
const MODEL_LIGHT = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'

// ── 타입 정의 ──

export interface MeetingConfig {
  type: 'WEEKLY_STRATEGY' | 'DAILY_REVIEW' | 'AD_HOC'
  chairAgent: string        // 회의 주재 (CEO 등)
  participants: string[]    // 참여 에이전트 (CMO, CDO 등)
  agenda: string[]          // 안건 목록
  context?: string          // 추가 컨텍스트 (데이터, 실험 결과 등)
  maxRounds?: number        // 최대 라운드 (기본 1, 비용 통제)
}

export interface MeetingResult {
  decisions: string[]
  actionItems: MeetingAction[]
  transcript: string         // 전체 회의록
  summary: string            // 1줄 요약
}

// ── 에이전트 역할 정의 ──

const AGENT_ROLES: Record<string, { role: string; perspective: string }> = {
  CEO: {
    role: '최고경영자',
    perspective: '전체 사업 방향, KPI 기반 의사결정, 리소스 배분. 창업자를 대신해 전략적 질문을 던지고 최종 결론을 내린다.',
  },
  CMO: {
    role: '마케팅 총괄',
    perspective: 'SNS 마케팅 전략, 콘텐츠 성과 분석, 타겟 오디언스 이해. Threads/Instagram/X 플랫폼별 전략 제안.',
  },
  CDO: {
    role: '데이터 총괄',
    perspective: 'KPI 데이터 기반 분석, 이상 징후 감지, A/B 테스트 통계적 유의성 판단. 숫자로 말한다.',
  },
  COO: {
    role: '운영 총괄',
    perspective: '콘텐츠 모더레이션, 커뮤니티 건강도, 운영 효율성. 실행 가능성 중심으로 판단.',
  },
  CFO: {
    role: '재무 총괄',
    perspective: 'API 비용, 광고 수익, ROI 분석. 예산 내에서 최대 효과를 내는 방향.',
  },
}

// ── 회의 진행 ──

export async function conductMeeting(config: MeetingConfig): Promise<MeetingResult> {
  const startTime = Date.now()
  const rounds = config.maxRounds ?? 1
  const transcriptParts: string[] = []

  // Step 1: Chair가 안건 정리 + 참여자에게 질문 생성
  const chairRole = AGENT_ROLES[config.chairAgent] ?? AGENT_ROLES['CEO']
  const agendaText = config.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n')

  const chairQuestionPrompt = `당신은 ${chairRole.role}입니다. ${chairRole.perspective}

오늘 회의 안건:
${agendaText}

${config.context ? `\n참고 데이터:\n${config.context}\n` : ''}

참여자: ${config.participants.join(', ')}

각 참여자에게 던질 핵심 질문을 안건별로 1개씩 작성해줘.
반드시 JSON으로만 응답:
{"questions": [{"to": "CMO", "question": "..."}, {"to": "CDO", "question": "..."}]}`

  const chairQuestionsRaw = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 600,
    system: `회사 헌법:\n${constitution}`,
    messages: [{ role: 'user', content: chairQuestionPrompt }],
  })

  const chairQText = chairQuestionsRaw.content[0].type === 'text' ? chairQuestionsRaw.content[0].text : '{}'
  let questions: Array<{ to: string; question: string }> = []
  try {
    const parsed = JSON.parse(chairQText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as { questions: typeof questions }
    questions = parsed.questions ?? []
  } catch {
    questions = config.participants.map(p => ({ to: p, question: `${agendaText}에 대한 의견을 말해줘.` }))
  }

  transcriptParts.push(`## 회의 시작 — ${config.type}`)
  transcriptParts.push(`의장: ${config.chairAgent} | 참여: ${config.participants.join(', ')}`)
  transcriptParts.push(`\n### 안건\n${agendaText}\n`)

  // Step 2: 각 참여자가 답변 (병렬 가능하지만 순차로 비용 통제)
  for (let round = 0; round < rounds; round++) {
    if (rounds > 1) transcriptParts.push(`\n--- Round ${round + 1} ---\n`)

    for (const q of questions) {
      const participantRole = AGENT_ROLES[q.to] ?? { role: q.to, perspective: '' }

      transcriptParts.push(`**${config.chairAgent}** → ${q.to}: ${q.question}`)

      const answerPrompt = `당신은 ${participantRole.role}입니다. ${participantRole.perspective}

${config.chairAgent}(의장)가 질문합니다:
"${q.question}"

${config.context ? `\n참고 데이터:\n${config.context}\n` : ''}

3-5문장으로 핵심만 답변해줘. 데이터가 있으면 숫자로 근거를 대.`

      const answerRaw = await client.messages.create({
        model: MODEL_LIGHT,
        max_tokens: 400,
        system: `회사 헌법:\n${constitution}`,
        messages: [{ role: 'user', content: answerPrompt }],
      })

      const answer = answerRaw.content[0].type === 'text' ? answerRaw.content[0].text : '(응답 없음)'
      transcriptParts.push(`**${q.to}**: ${answer}\n`)
    }
  }

  // Step 3: Chair가 종합 + 결론 + 액션 아이템
  const conclusionPrompt = `당신은 ${chairRole.role}입니다.

회의록:
${transcriptParts.join('\n')}

위 회의 내용을 종합하여:
1. 핵심 결정사항 (decisions) — 명확한 문장으로
2. 액션 아이템 — 누가(assignee), 무엇을(task), 언제까지(deadline)
3. 1줄 요약 (summary)

반드시 JSON으로만 응답:
{"decisions": ["...", "..."], "actionItems": [{"assignee": "CMO", "task": "...", "deadline": "이번 주 내"}], "summary": "..."}`

  const conclusionRaw = await client.messages.create({
    model: MODEL_HEAVY,
    max_tokens: 800,
    system: `회사 헌법:\n${constitution}`,
    messages: [{ role: 'user', content: conclusionPrompt }],
  })

  const conclusionText = conclusionRaw.content[0].type === 'text' ? conclusionRaw.content[0].text : '{}'
  let result: MeetingResult = { decisions: [], actionItems: [], transcript: '', summary: '' }

  try {
    const parsed = JSON.parse(conclusionText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()) as {
      decisions: string[]
      actionItems: MeetingAction[]
      summary: string
    }
    result = {
      decisions: parsed.decisions ?? [],
      actionItems: parsed.actionItems ?? [],
      transcript: transcriptParts.join('\n'),
      summary: parsed.summary ?? '',
    }
  } catch {
    result = {
      decisions: ['회의 결론 파싱 실패 — 원본 확인 필요'],
      actionItems: [],
      transcript: transcriptParts.join('\n'),
      summary: '회의 진행됨, 결론 파싱 필요',
    }
  }

  transcriptParts.push(`\n### 결론`)
  transcriptParts.push(result.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n'))
  if (result.actionItems.length > 0) {
    transcriptParts.push(`\n### 액션 아이템`)
    transcriptParts.push(result.actionItems.map(a => `- [${a.assignee}] ${a.task} (${a.deadline})`).join('\n'))
  }

  result.transcript = transcriptParts.join('\n')

  // Step 4: 저장 + Slack 알림
  const durationMs = Date.now() - startTime

  await prisma.botLog.create({
    data: {
      botType: 'CEO',
      action: 'MEETING',
      status: 'SUCCESS',
      details: JSON.stringify({
        type: config.type,
        chair: config.chairAgent,
        participants: config.participants,
        decisions: result.decisions,
        actionItems: result.actionItems,
        summary: result.summary,
      }),
      itemCount: result.decisions.length,
      executionTimeMs: durationMs,
    },
  })

  // Slack #회의록 채널
  const meetingBlocks = [
    { type: 'header', text: { type: 'plain_text', text: `에이전트 회의 — ${config.type}`, emoji: true } },
    { type: 'section', fields: [
      { type: 'mrkdwn', text: `*의장:* ${config.chairAgent}` },
      { type: 'mrkdwn', text: `*참여:* ${config.participants.join(', ')}` },
    ]},
    { type: 'section', text: { type: 'mrkdwn', text: `*결정사항:*\n${result.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}` } },
    ...(result.actionItems.length > 0 ? [{
      type: 'section' as const,
      text: { type: 'mrkdwn' as const, text: `*액션 아이템:*\n${result.actionItems.map(a => `• [${a.assignee}] ${a.task} _(${a.deadline})_`).join('\n')}` },
    }] : []),
    { type: 'context', elements: [
      { type: 'mrkdwn', text: `소요: ${Math.round(durationMs / 1000)}초 | ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` },
    ]},
  ]

  await sendSlackMessage('MEETING_LOG', `에이전트 회의 완료 — ${result.summary}`, meetingBlocks)

  // #에이전트-회의실에도 요약
  await sendSlackMessage('AGENT_MEETING', '', [
    { type: 'header', text: { type: 'plain_text', text: `회의 결론 — ${config.type}`, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `*요약:* ${result.summary}\n\n*결정:*\n${result.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n')}` } },
  ])

  return result
}
