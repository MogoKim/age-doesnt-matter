import Anthropic from '@anthropic-ai/sdk'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import { conductMeeting } from '../core/meeting.js'
import { getDayStrategy } from './threads-config.js'

/**
 * CMO Social Strategy — 매주 월요일 10:15 KST 실행
 *
 * 누적 실험 학습 + 트렌드를 종합하여:
 * 1. 과거 모든 실험 learnings 읽기
 * 2. CMO trend-analyzer + CAFE trend-analyzer 최신 트렌드 참조
 * 3. 다음 주 실험 설계 + 콘텐츠 믹스 결정
 * 4. 새 SocialExperiment 레코드 생성
 * 5. #에이전트-회의실에 전략 브리핑
 */

const MODEL = process.env.CLAUDE_MODEL_STRATEGIC ?? 'claude-opus-4-6'
const client = new Anthropic()

// 8주 테스트 로드맵 — 주차별 실험 변수 (Threads 트렌드 기반)
const EXPERIMENT_ROADMAP: Array<{
  week: number
  variable: string
  controlValue: string
  testValue: string
  hypothesis: string
}> = [
  { week: 1, variable: 'baseline', controlValue: 'mixed', testValue: 'mixed', hypothesis: '베이스라인 측정 — 현재 전략의 참여율 기준점 확인' },
  { week: 2, variable: 'format', controlValue: 'story', testValue: 'question', hypothesis: '스토리텔링형 vs 질문형 — 체류 시간과 댓글 수 비교' },
  { week: 3, variable: 'postingTime', controlValue: 'earlyMorning', testValue: 'lunch', hypothesis: '오전 7-9시 vs 점심 12-1시 — 황금 시간대 검증' },
  { week: 4, variable: 'tone', controlValue: 'warm', testValue: 'practical', hypothesis: '따뜻한 공감형 vs 실용 정보형 — 50-60대 선호도' },
  { week: 5, variable: 'topicTag', controlValue: 'lifestyle', testValue: 'job', hypothesis: '라이프스타일 태그 vs 일자리 태그 — 도달 범위' },
  { week: 6, variable: 'contentLength', controlValue: 'short', testValue: 'medium', hypothesis: '80자 vs 150자 — 체류 시간과 참여율 균형' },
  { week: 7, variable: 'persona', controlValue: 'A', testValue: 'B', hypothesis: '영숙이맘 vs 은퇴신사 — 50-60대 공감 비교' },
  { week: 8, variable: 'interaction', controlValue: 'statement', testValue: 'question', hypothesis: '일방 게시 vs 질문형 — 댓글 유도 효과' },
]

async function main() {
  console.log('[SocialStrategy] 시작')
  const startTime = Date.now()

  // 1. 과거 모든 실험 학습 수집
  const pastExperiments = await prisma.socialExperiment.findMany({
    where: { status: 'ANALYZED' },
    orderBy: { weekNumber: 'asc' },
    select: { weekNumber: true, variable: true, hypothesis: true, results: true, learnings: true },
  })

  const cumulativeLearnings = pastExperiments
    .map(e => `Week ${e.weekNumber} (${e.variable}): ${e.learnings ?? '분석 미완료'}`)
    .join('\n')

  // 2. 최신 트렌드 참조
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [cafeTrend, cmoTrend] = await Promise.all([
    prisma.cafeTrend.findFirst({
      where: { period: 'daily' },
      orderBy: { date: 'desc' },
      select: { hotTopics: true, date: true },
    }),
    prisma.botLog.findFirst({
      where: { botType: 'CMO', action: 'TREND_ANALYSIS' },
      orderBy: { executedAt: 'desc' },
      select: { details: true },
    }),
  ])

  const trendContext = [
    cafeTrend ? `카페 핫토픽: ${JSON.stringify((cafeTrend.hotTopics as Array<{ topic: string }>)?.slice(0, 5).map(t => t.topic))}` : '',
    cmoTrend?.details ? `CMO 트렌드: ${typeof cmoTrend.details === 'string' ? cmoTrend.details.slice(0, 300) : JSON.stringify(cmoTrend.details).slice(0, 300)}` : '',
  ].filter(Boolean).join('\n')

  // 3. 다음 실험 주차 결정
  const completedWeeks = pastExperiments.length
  const nextWeek = completedWeeks + 1

  // 9주차 이후: AI가 자동 결정 (70% exploit / 30% explore)
  let nextExperiment: { variable: string; controlValue: string; testValue: string; hypothesis: string }

  if (nextWeek <= EXPERIMENT_ROADMAP.length) {
    nextExperiment = EXPERIMENT_ROADMAP[nextWeek - 1]
  } else {
    // AI 기반 실험 설계
    const aiDesign = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: `당신은 SNS 마케팅 실험 설계 전문가입니다. 과거 실험 결과를 바탕으로 다음 주 실험을 설계하세요.
규칙: 70%는 검증된 우승 공식 유지, 30%는 새 변수 탐색.
JSON으로만 응답: {"variable": "...", "controlValue": "...", "testValue": "...", "hypothesis": "..."}`,
      messages: [{ role: 'user', content: `과거 실험:\n${cumulativeLearnings}\n\n트렌드:\n${trendContext}\n\nWeek ${nextWeek} 실험을 설계하세요.` }],
    })

    const aiText = aiDesign.content[0].type === 'text' ? aiDesign.content[0].text : '{}'
    try {
      const parsed = JSON.parse(aiText.replace(/```json?\n?/g, '').replace(/```/g, '').trim())
      nextExperiment = {
        variable: parsed.variable ?? 'contentType',
        controlValue: parsed.controlValue ?? 'PERSONA',
        testValue: parsed.testValue ?? 'HUMOR',
        hypothesis: parsed.hypothesis ?? `Week ${nextWeek} AI 자동 설계 실험`,
      }
    } catch {
      nextExperiment = {
        variable: 'contentType',
        controlValue: 'PERSONA',
        testValue: 'HUMOR',
        hypothesis: `Week ${nextWeek} 폴백 실험 — contentType 재테스트`,
      }
    }
  }

  // 4. 전략 생성 — conductMeeting()으로 CEO·CMO·CDO 합의
  const experimentAnalysis = cumulativeLearnings || '(첫 주 — 아직 학습 없음)'
  const dataContext = JSON.stringify({
    pastExperiments: pastExperiments.slice(-4),
    trendContext,
    nextExperiment,
  })

  const meetingResult = await conductMeeting({
    type: 'WEEKLY_STRATEGY',
    chairAgent: 'CEO',
    participants: ['CMO', 'CDO'],
    agenda: [
      `지난주 실험 결과: ${experimentAnalysis}`,
      `이번 주 실험 계획: ${nextExperiment.hypothesis}`,
      `트렌드 변화: ${trendContext}`,
      '콘텐츠 믹스 및 요일별 전략 조정 필요 여부',
    ],
    context: dataContext,
    maxRounds: 1,
  })

  const strategyBrief = meetingResult.decisions.join('\n')

  // 4-b. AI 보완 — Threads 트렌드 컨텍스트 반영 세부 전략
  const strategyPrompt = `당신은 50-60대 커뮤니티 "우리 나이가 어때서"의 CMO입니다.

Threads 한국 트렌드 (2026):
- 토픽 태그 1개만 (다중 = 스팸)
- 체류 시간(Dwell Time)이 알고리즘 최대 가중치
- 화-목 오전 7-9시, 점심 12-1시가 황금 시간대
- 50-60대 타겟: 텍스트 기반이라 진입 쉬움, 커뮤니티 문화 선호
- 이미지 포함 시 +60% 인게이지먼트
- 반말 문화 유지 (자연스러운 반말)

과거 실험 학습:
${cumulativeLearnings || '(첫 주 — 아직 학습 없음)'}

최신 트렌드:
${trendContext || '(트렌드 데이터 없음)'}

회의 결과:
${strategyBrief}

다음 주 실험:
- 변수: ${nextExperiment.variable}
- 통제: ${nextExperiment.controlValue} vs 실험: ${nextExperiment.testValue}
- 가설: ${nextExperiment.hypothesis}

아래 사항을 결정해주세요 (한국어, 간결하게):
1. 이번 주 콘텐츠 믹스 (어떤 유형을 몇 개씩)
2. 주요 타깃 시간대
3. 페르소나 활용 방향
4. 홍보/순수 콘텐츠 비율 조정 (기본 60/25/15에서 변경 필요 시)
5. 특별히 시도해볼 새로운 아이디어 1가지`

  const strategyResponse = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: '50-60대 커뮤니티 CMO로서 주간 SNS 전략을 수립하세요. Threads 트렌드를 반영한 실행 가능한 구체적인 계획으로.',
    messages: [{ role: 'user', content: strategyPrompt }],
  })

  const detailedStrategy = strategyResponse.content[0].type === 'text' ? strategyResponse.content[0].text : ''

  // 5. 새 실험 레코드 생성
  const startDate = new Date()
  const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)

  await prisma.socialExperiment.create({
    data: {
      weekNumber: nextWeek,
      startDate,
      endDate,
      hypothesis: nextExperiment.hypothesis,
      variable: nextExperiment.variable,
      controlValue: nextExperiment.controlValue,
      testValue: nextExperiment.testValue,
      status: 'ACTIVE',
    },
  })

  // 6. 전략 메모를 BotLog에 저장 (다른 에이전트 참조용)
  const durationMs = Date.now() - startTime

  await prisma.botLog.create({
    data: {
      botType: 'CMO',
      action: 'STRATEGY_MEMO',
      status: 'SUCCESS',
      details: JSON.stringify({
        weekNumber: nextWeek,
        experiment: nextExperiment,
        meetingDecisions: strategyBrief.slice(0, 1000),
        strategy: detailedStrategy.slice(0, 2000),
        learningsCount: pastExperiments.length,
      }),
      itemCount: 1,
      executionTimeMs: durationMs,
    },
  })

  // 7. Slack 브리핑 — #에이전트-회의실
  await notifySlack({
    level: 'info',
    agent: 'CMO_SOCIAL',
    title: `Week ${nextWeek} SNS 전략 수립 완료`,
    body: [
      `*이번 주 실험*`,
      `> 가설: ${nextExperiment.hypothesis}`,
      `> 변수: ${nextExperiment.variable} (${nextExperiment.controlValue} vs ${nextExperiment.testValue})`,
      '',
      `*회의 결과 (CEO·CMO·CDO)*`,
      strategyBrief,
      '',
      `*세부 전략*`,
      detailedStrategy,
      '',
      `*누적 학습*: ${pastExperiments.length}개 실험 완료`,
      '',
      `*창업자 의사결정:*`,
      `- 이번 주 실험 변수를 [${nextExperiment.variable}]로 설정했습니다`,
      `- 성공 전략 [${nextExperiment.controlValue}]의 유지 기간 설정 필요`,
    ].join('\n'),
  })

  console.log(`[SocialStrategy] 완료 — Week ${nextWeek} 실험 설계, ${Math.round(durationMs / 1000)}초`)
  await disconnect()
}

main().catch(async (err) => {
  console.error('[SocialStrategy] 오류:', err)
  await notifySlack({
    level: 'critical',
    agent: 'CMO_SOCIAL',
    title: '주간 SNS 전략 수립 실패',
    body: err instanceof Error ? err.message : String(err),
  })
  await disconnect()
  process.exit(1)
})
