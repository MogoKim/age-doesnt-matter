/**
 * evolve-prompt.ts — AutoResearch 기반 에이전트 프롬프트 자동 진화
 *
 * 사용법: tsx agents/scripts/evolve-prompt.ts <AGENT> [cycles]
 * 예시:  tsx agents/scripts/evolve-prompt.ts CMO 20
 *
 * 동작:
 * 1. 에이전트의 현재 tasks 설명을 "수정 가능한 파일"로 설정
 * 2. 에이전트별 binary 체크리스트로 출력 점수 계산
 * 3. N 사이클: Haiku가 변형 제안 → Sonnet으로 샘플 출력 생성 → 점수 비교 → 개선 시 채택
 * 4. 최종 개선안을 AdminQueue에 창업자 승인 요청
 *
 * 비용 (20사이클 기준):
 * - 변형 제안 (Haiku): 20회 × ~$0.001 = ~$0.02
 * - 출력 생성 (Sonnet): 21회 × ~$0.01 = ~$0.21
 * - 점수 계산 (Haiku): 42회 × ~$0.001 = ~$0.04
 * 합계: ~$0.27 / 실행
 *
 * DISPATCH ONLY — 사유: 창업자가 수동으로 실행하는 오프라인 최적화 스크립트
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { createApprovalRequest } from '../core/approval-helper.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const constitution = readFileSync(resolve(__dirname, '../core/constitution.yaml'), 'utf-8')

const client = new Anthropic()
const LIGHT_MODEL = process.env.CLAUDE_MODEL_LIGHT ?? 'claude-haiku-4-5'
const HEAVY_MODEL = process.env.CLAUDE_MODEL_HEAVY ?? 'claude-sonnet-4-6'

// ── 에이전트별 진화 설정 ──

interface AgentEvolutionConfig {
  role: string
  currentTasks: string
  sampleInput: string  // 에이전트가 받을 샘플 입력 (실제 운영과 유사하게)
  criteria: string[]   // binary 평가 기준 (yes/no 질문)
}

const AGENT_CONFIGS: Record<string, AgentEvolutionConfig> = {
  CMO: {
    role: 'CMO (마케팅총괄)',
    currentTasks: 'SNS 콘텐츠 생성, 트렌드 분석, 플랫폼별 게시물 작성',
    sampleInput: [
      '오늘의 인기글: "무릎이 시려서 잠을 못 자겠어요" (공감 45)',
      '게시판: 건강/일상',
      '플랫폼: Threads',
      '시간대: 아침',
      '페르소나: 영숙이맘 (따뜻한 공감형)',
    ].join('\n'),
    criteria: [
      '50대 이상이 직접 공감할 수 있는 구체적 상황이 묘사됐는가?',
      '독자가 댓글/반응하고 싶어지는 질문이나 유도 문구가 있는가?',
      '"시니어", "노인", "어르신" 같은 연령 비하 표현이 없는가?',
      '150자 이내로 간결하게 작성됐는가?',
      '브랜드 해시태그 또는 사이트 링크 언급이 포함됐는가?',
    ],
  },

  CEO: {
    role: 'CEO (최고경영자)',
    currentTasks: '모닝 사이클: 전체 KPI 수집, 문제 감지, 에이전트 소집 및 액션 배정',
    sampleInput: [
      'DAU(어제 로그인): 127명 (전일 대비 -8%)',
      '신규 글: 12건 | 댓글: 34건 | 공감: 89건',
      '에이전트 실패: cmo:social-poster 2회 (API 타임아웃)',
      '누적 가입자: 1,243명',
    ].join('\n'),
    criteria: [
      '핵심 이상 징후(하락/실패)가 명시됐는가?',
      '구체적인 액션 아이템과 담당 에이전트가 포함됐는가?',
      '긍정 지표와 부정 지표가 모두 언급됐는가?',
      '5줄 이내로 간결하게 요약됐는가?',
    ],
  },

  CFO: {
    role: 'CFO (재무총괄)',
    currentTasks: '일일 비용 체크, CPS/광고 수익 집계, 예산 경고',
    sampleInput: [
      '이번 달 API 비용 추정: $18.40 (예산 $50)',
      '에이전트 실행: 342회 (전주 대비 +12%)',
      '광고 수익: 미집계',
      '월간 잔여 예산: $31.60',
    ].join('\n'),
    criteria: [
      '예산 대비 사용률(%)이 명시됐는가?',
      '현재 추세로 월말 예측 비용이 언급됐는가?',
      '경고 필요 여부가 명확히 판단됐는가?',
      '수치가 정확하게 인용됐는가?',
    ],
  },

  CTO: {
    role: 'CTO (기술총괄)',
    currentTasks: '헬스 체크, 에러 모니터링, 보안 감사',
    sampleInput: [
      '최근 1시간 에러 로그: 404 × 12건, 500 × 3건',
      '에이전트 성공률: 94% (전일 97%)',
      '비정상 로그인 시도: 2건 (동일 IP)',
      'DB 응답시간: 평균 142ms',
    ].join('\n'),
    criteria: [
      '보안 위협 여부가 명확히 판단됐는가?',
      '에러 심각도가 구분(경고/위험)됐는가?',
      '즉각 조치 필요 항목이 있으면 명시됐는가?',
      '정상 범위인 경우 "이상 없음"으로 간결하게 처리됐는가?',
    ],
  },
}

// ── 유틸 함수들 ──

async function generateOutput(role: string, tasks: string, sampleInput: string): Promise<string> {
  const systemPrompt = `당신은 "우리 나이가 어때서" 커뮤니티의 ${role}입니다.
회사 헌법 핵심 원칙: ${constitution.slice(0, 600)}

역할: ${role}
담당 업무: ${tasks}

규칙:
- 모든 판단은 회사 헌법 기준으로
- DB write는 금지 (읽기만 가능)
- "시니어", "노인" 표현 금지
`

  const res = await client.messages.create({
    model: HEAVY_MODEL,
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: 'user', content: sampleInput }],
  })
  const block = res.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

async function scoreOutput(output: string, criteria: string[]): Promise<{ score: number; details: string }> {
  const criteriaText = criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
  const prompt = `아래 출력을 평가해줘.
각 기준에 대해 반드시 "yes" 또는 "no"로만 답해줘.

[평가 기준]
${criteriaText}

[평가할 출력]
${output}

형식 (한 줄, 쉼표 구분): 기준1: yes, 기준2: no, 기준3: yes`

  const res = await client.messages.create({
    model: LIGHT_MODEL,
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content[0]
  if (block.type !== 'text') return { score: 0, details: '' }

  const yesCount = (block.text.match(/yes/gi) ?? []).length
  return { score: yesCount, details: block.text.trim() }
}

async function mutateTasks(currentTasks: string, recentFailures: string, agentRole: string): Promise<string> {
  const prompt = `에이전트의 "담당 업무" 설명을 한 가지만 개선해줘.

[에이전트 역할]
${agentRole}

[현재 업무 설명]
${currentTasks}

[최근 실패/문제]
${recentFailures || '없음'}

규칙:
- 기존 핵심 업무 유지 (삭제 금지)
- 한 가지 측면만 구체화하거나 강조 추가
- 불필요한 말은 없애고 명확하게
- 개선된 전체 업무 설명만 출력 (설명/이유 없이)`

  const res = await client.messages.create({
    model: LIGHT_MODEL,
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = res.content[0]
  return block.type === 'text' ? block.text.trim() : currentTasks
}

async function getRecentFailures(botType: string): Promise<string> {
  type FailRow = { action: string; details: string | null }
  type BotLogFindMany = (args: unknown) => Promise<FailRow[]>
  const findMany = ((prisma as Record<string, Record<string, unknown>>).botLog.findMany as BotLogFindMany)

  const logs = await findMany({
    where: { botType, status: 'FAILED' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { action: true, details: true },
  })
  if (logs.length === 0) return '없음'
  return logs.map((l) => `- ${l.action}: ${(l.details ?? '').slice(0, 100)}`).join('\n')
}

// ── 메인 진화 루프 ──

async function evolvePrompt(agentKey: string, cycles: number) {
  const config = AGENT_CONFIGS[agentKey]
  if (!config) {
    console.error(`\n알 수 없는 에이전트: "${agentKey}"`)
    console.error(`가능한 에이전트: ${Object.keys(AGENT_CONFIGS).join(', ')}\n`)
    process.exit(1)
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[EvolvePT] ${agentKey} 프롬프트 진화 — ${cycles}사이클`)
  console.log(`${'='.repeat(60)}\n`)

  const recentFailures = await getRecentFailures(agentKey)
  console.log(`최근 실패 로그:\n${recentFailures}\n`)

  // 초기 점수 측정
  let currentTasks = config.currentTasks
  console.log('초기 출력 생성 중...')
  const initialOutput = await generateOutput(config.role, currentTasks, config.sampleInput)
  const initialScoreResult = await scoreOutput(initialOutput, config.criteria)

  let bestScore = initialScoreResult.score
  let bestTasks = currentTasks

  console.log(`초기 점수: ${bestScore}/${config.criteria.length}`)
  console.log(`초기 평가: ${initialScoreResult.details}`)
  console.log(`초기 출력:\n${initialOutput.slice(0, 150)}...\n`)
  console.log('-'.repeat(40))

  let improvements = 0

  for (let i = 1; i <= cycles; i++) {
    // 변형 생성
    const mutatedTasks = await mutateTasks(currentTasks, recentFailures, config.role)

    // 변형 결과 생성 및 점수 계산
    const mutatedOutput = await generateOutput(config.role, mutatedTasks, config.sampleInput)
    const { score: mutatedScore } = await scoreOutput(mutatedOutput, config.criteria)

    const delta = mutatedScore - bestScore
    const symbol = delta > 0 ? '✓' : delta === 0 ? '=' : '✗'
    process.stdout.write(`사이클 ${String(i).padStart(2)}/${cycles}: ${symbol} ${mutatedScore}/${config.criteria.length}`)

    if (mutatedScore > bestScore) {
      bestScore = mutatedScore
      bestTasks = mutatedTasks
      currentTasks = mutatedTasks
      improvements++
      console.log(` ← 개선! "${mutatedTasks.slice(0, 60)}..."`)
    } else {
      console.log()
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`최종 점수: ${bestScore}/${config.criteria.length} (개선 횟수: ${improvements})`)

  if (bestTasks === config.currentTasks) {
    console.log('개선 없음 — AdminQueue 등록 스킵')
    return
  }

  const improvementPct = Math.round(
    ((bestScore - initialScoreResult.score) / config.criteria.length) * 100,
  )

  console.log(`\n기존 tasks:\n  ${config.currentTasks}`)
  console.log(`\n제안 tasks:\n  ${bestTasks}`)
  console.log(`\n점수 변화: ${initialScoreResult.score} → ${bestScore} (+${improvementPct}%)`)

  await createApprovalRequest({
    type: 'PROMPT_EVOLUTION',
    title: `[PromptEvolution] ${agentKey} tasks 개선 제안 (${initialScoreResult.score}→${bestScore}점)`,
    description: [
      `AutoResearch ${cycles}사이클 결과`,
      `점수: ${initialScoreResult.score}/${config.criteria.length} → ${bestScore}/${config.criteria.length} (+${improvementPct}%)`,
      '',
      '[기존 tasks]',
      config.currentTasks,
      '',
      '[제안 tasks]',
      bestTasks,
      '',
      '[평가 기준]',
      ...config.criteria.map((c, i) => `${i + 1}. ${c}`),
    ].join('\n'),
    payload: {
      agentKey,
      cycles,
      initialScore: initialScoreResult.score,
      finalScore: bestScore,
      totalCriteria: config.criteria.length,
      currentTasks: config.currentTasks,
      proposedTasks: bestTasks,
      recentFailures,
    },
    requestedBy: 'evolve-prompt-script',
    status: 'PENDING',
  })

  console.log('\n✅ AdminQueue에 승인 요청 등록 완료')
  console.log('   어드민 패널 > 승인 대기에서 확인하세요.\n')
}

// ── 실행 ──

const agentKey = (process.argv[2] ?? '').toUpperCase()
const cycles = Math.max(5, Math.min(50, parseInt(process.argv[3] ?? '20', 10)))

if (!agentKey) {
  console.log('\n사용법: tsx agents/scripts/evolve-prompt.ts <AGENT> [cycles]')
  console.log('예시:  tsx agents/scripts/evolve-prompt.ts CMO 20')
  console.log(`가능한 에이전트: ${Object.keys(AGENT_CONFIGS).join(', ')}`)
  console.log(`사이클 범위: 5~50 (기본값: 20)\n`)
  process.exit(0)
}

evolvePrompt(agentKey, cycles)
  .catch(console.error)
  .finally(() => disconnect())
