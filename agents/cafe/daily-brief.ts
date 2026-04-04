// LOCAL ONLY — 크롤링 파이프라인 마지막 단계, 로컬 실행
/**
 * DailyIntelligenceBrief 생성기
 *
 * CafeTrend 집계 결과 → 욕망 지도 → 페르소나 쿼터 배분 → today-brief.json + DB 저장
 *
 * 파이프라인 위치:
 *   크롤러 → psych-analyzer → trend-analyzer → [daily-brief.ts] → 모든 에이전트
 *
 * 실행:
 *   npx tsx agents/cafe/daily-brief.ts          # DEEP 브리프 (오전 08:45)
 *   npx tsx agents/cafe/daily-brief.ts --patch  # 점심 midDayPatch 업데이트
 */
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma, disconnect } from '../core/db.js'
import { notifySlack } from '../core/notifier.js'
import type { DailyIntelligenceBrief, DesireRankItem, UrgentTopic, PersonaQuota, ContentDirective } from '../core/intelligence.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRIEF_PATH = resolve(__dirname, '../core/today-brief.json')

const isPatch = process.argv.includes('--patch')

// ── 욕망 카테고리 레이블 ──

const DESIRE_LABELS: Record<string, string> = {
  HEALTH:   '건강/증상/병원',
  FAMILY:   '가족/자녀/남편/손주',
  MONEY:    '돈/재테크/연금',
  RETIRE:   '은퇴/노후/인생2막',
  JOB:      '일자리/자격증/부업',
  RELATION: '관계/외로움/소통',
  HOBBY:    '취미/여가/활동',
  MEANING:  '삶의 의미/철학',
  DIGNITY:  '존중/인정/자존감',
  LEGACY:   '자식에게 남기기/기억',
  CARE:     '돌봄/간병/의존',
  FREEDOM:  '자유/독립/나만의 시간',
  ENTERTAIN:'연예/드라마/팬덤',
}

// ── 콘텐츠 방향 규칙 ──

const DIRECTIVE_MAP: Record<string, { theme: string; tone: string; avoid: string[] }> = {
  HEALTH:   { theme: '건강 불안 공감', tone: '따뜻한 공감 + 실질 정보 제공', avoid: ['가벼운 유머', '골프/낚시 이야기'] },
  FAMILY:   { theme: '가족 관계 공감', tone: '감정 공감 + 경험 나눔', avoid: ['무거운 정치', '돈 이야기'] },
  MONEY:    { theme: '노후 자금 공감', tone: '현실적 정보 + 절약 지혜', avoid: ['자랑', '여행 이야기'] },
  RETIRE:   { theme: '은퇴 후 일상 공유', tone: '경험 나눔 + 용기 북돋음', avoid: ['취직 이야기', '사회 비판'] },
  JOB:      { theme: '일자리 정보 나눔', tone: '실용적 정보 + 격려', avoid: ['자랑', '부정적 발언'] },
  RELATION: { theme: '외로움 공감', tone: '따뜻한 공감 + 연결 시도', avoid: ['혼자 자랑', '무거운 주제'] },
  HOBBY:    { theme: '취미 활동 공유', tone: '활기차고 긍정적', avoid: ['무거운 주제', '돈 걱정'] },
  MEANING:  { theme: '삶의 의미 나눔', tone: '사려 깊고 감성적', avoid: ['가벼운 유머', '상업적 정보'] },
  DIGNITY:  { theme: '공감 + 자존감 격려', tone: '함께 공감 + 위로', avoid: ['조언 남발', '해결책 강요'] },
  LEGACY:   { theme: '삶의 기록 나눔', tone: '감성적 + 성찰적', avoid: ['가벼운 수다', '단순 정보'] },
  CARE:     { theme: '돌봄 경험 나눔', tone: '공감 + 실질 정보', avoid: ['자랑', '과도한 조언'] },
  FREEDOM:  { theme: '나만의 시간 응원', tone: '응원 + 공감', avoid: ['가족 이야기 강조', '의무 강조'] },
  ENTERTAIN:{ theme: '연예/드라마 이야기', tone: '신나고 활기차게', avoid: ['무거운 주제', '정치'] },
}

// ── 페르소나 욕망 친화도 테이블 (50명 × 13욕망) ──
// 0.0 = 전혀 안 맞음 / 1.0 = 완벽히 일치
// Step 8 (persona-data.ts 업데이트) 후 여기서 export로 이동 예정

const PERSONA_DESIRE_AFFINITY: Record<string, Partial<Record<string, number>>> = {
  // A: 하늘바라기 — 일상 수다, 건강 걱정, 동네 소식
  A:  { HEALTH: 0.4, RELATION: 0.6, HOBBY: 0.3, FAMILY: 0.3 },
  // B: 정호씨 — 은퇴, 건강관리, 재테크
  B:  { RETIRE: 0.8, HEALTH: 0.5, MONEY: 0.5, HOBBY: 0.2 },
  // C: (topics 없음) — 중립
  C:  { RELATION: 0.3, HOBBY: 0.3 },
  // D: 취준생아줌마 — 일자리, 자격증
  D:  { JOB: 0.9, DIGNITY: 0.4, MONEY: 0.2 },
  // E: 위로해줘 — 공감, 위로, 인생 이야기
  E:  { RELATION: 0.9, MEANING: 0.6, CARE: 0.3 },
  // F: 텃밭할머니 — 텃밭, 자연, 아침 산책
  F:  { HOBBY: 0.8, FREEDOM: 0.4, MEANING: 0.3 },
  // G: 여행매니아 — 국내 여행, 맛집
  G:  { HOBBY: 0.9, FREEDOM: 0.5, MEANING: 0.2 },
  // H: 매일걷기 — 걷기, 혈압, 건강검진
  H:  { HEALTH: 0.95, HOBBY: 0.3 },
  // I: 책벌레 — 책, 영화, 음악, 에세이
  I:  { HOBBY: 0.7, MEANING: 0.6, ENTERTAIN: 0.3 },
  // J: 맛집탐방 — 요리, 반찬, 맛집
  J:  { HOBBY: 0.6, RELATION: 0.3, FAMILY: 0.2 },
  // K: 패션언니 — 옷, 화장품, 쇼핑
  K:  { HOBBY: 0.6, FREEDOM: 0.5, DIGNITY: 0.3 },
  // L: 손주바보 — 손주, 가족 모임, 육아
  L:  { FAMILY: 0.95, LEGACY: 0.5, MEANING: 0.3 },
  // M: 산악회장 — 등산, 둘레길
  M:  { HOBBY: 0.9, HEALTH: 0.4, RELATION: 0.3 },
  // N: 살림의신 — 살림, 장보기, 가격 비교
  N:  { MONEY: 0.5, HOBBY: 0.4, RELATION: 0.3 },
  // O: 올드팝 — 트로트, 팝송, 콘서트
  O:  { ENTERTAIN: 0.9, MEANING: 0.4, HOBBY: 0.3 },
  // P: 혼자커피 — 카페, 혼자만의 시간
  P:  { FREEDOM: 0.85, HOBBY: 0.5, MEANING: 0.3 },
  // Q: 강아지맘 — 반려견, 산책
  Q:  { HOBBY: 0.7, MEANING: 0.4, RELATION: 0.3 },
  // R: 드라마여왕 — 드라마, 예능, 연예인
  R:  { ENTERTAIN: 0.95, RELATION: 0.3 },
  // S: 제주살이 — 귀촌, 자연
  S:  { HOBBY: 0.6, FREEDOM: 0.7, RETIRE: 0.4 },
  // T: 배우는중 — 평생교육, 자격증, 봉사
  T:  { JOB: 0.5, MEANING: 0.8, HOBBY: 0.4 },
  // U: 영숙이맘 — 시장, 가족, 건강
  U:  { FAMILY: 0.6, HEALTH: 0.4, RELATION: 0.5 },
  // V: 뉴스보는할매 — 물가, 연금, 보험
  V:  { MONEY: 0.7, RETIRE: 0.4, HEALTH: 0.3 },
  // W: 비판왕 — 불만, 물가, 서비스 비판
  W:  { MONEY: 0.5, DIGNITY: 0.6, RELATION: 0.2 },
  // X: 걱정이많아 — 건강, 노후자금, 보험
  X:  { HEALTH: 0.7, MONEY: 0.7, FAMILY: 0.4, CARE: 0.3 },
  // Y: 현실주의자 — 은퇴현실, 돈, 인생
  Y:  { RETIRE: 0.7, MONEY: 0.6, MEANING: 0.4 },
  // Z: 독립언니 — 혼자, 자유, 독립
  Z:  { FREEDOM: 0.9, HOBBY: 0.5, MEANING: 0.3 },
  // AA: 엄마걱정 — 자녀 취업, 물가
  AA: { FAMILY: 0.7, MONEY: 0.5, DIGNITY: 0.3 },
  // AB: 팩트체커 — 건강정보, 경제, 토론
  AB: { HEALTH: 0.4, MONEY: 0.4, MEANING: 0.3 },
  // AC: 시골아저씨 — 농사, 날씨, 동네
  AC: { HOBBY: 0.6, RELATION: 0.4, FREEDOM: 0.3 },
  // AD: 추억팔이 — 옛날 추억, 시대 비교
  AD: { MEANING: 0.8, RELATION: 0.5, LEGACY: 0.4 },
  // AE: 새벽감성 — 불면, 인생 생각, 혼자
  AE: { HEALTH: 0.4, MEANING: 0.6, FREEDOM: 0.4 },
  // AF: 유머대장 — 아재개그, 유머
  AF: { RELATION: 0.7, ENTERTAIN: 0.4, HOBBY: 0.3 },
  // AG: 정보비교왕 — 제품 비교, 병원 비교
  AG: { HEALTH: 0.5, MONEY: 0.4, HOBBY: 0.2 },
  // AH: 피곤한직장맘 — 직장, 피로, 수면
  AH: { HEALTH: 0.4, JOB: 0.4, FAMILY: 0.3 },
  // AI: 자급자족 — 농사, 시골
  AI: { HOBBY: 0.8, FREEDOM: 0.6, MEANING: 0.3 },
  // AJ: 간병일기 — 간병, 요양원, 치매 돌봄
  AJ: { CARE: 0.95, HEALTH: 0.3, MEANING: 0.2 },
  // AK: 부모돌봄 — 부모 돌봄, 죄책감, 가족 갈등
  AK: { CARE: 0.9, FAMILY: 0.7, DIGNITY: 0.3 },
  // AL: 헬스중독 — 헬스, 근력 운동, 체력
  AL: { HEALTH: 0.9, HOBBY: 0.5 },
  // AM: 갱년기전사 — 갱년기, 불면증, 혈압
  AM: { HEALTH: 0.95, CARE: 0.2 },
  // AN: 영양제박사 — 영양제, 건강기능식품
  AN: { HEALTH: 0.85, MONEY: 0.2 },
  // AO: 에피소드퀸 — 일상 에피소드, 유머
  AO: { RELATION: 0.7, ENTERTAIN: 0.5, HOBBY: 0.3 },
  // AP: 공감봇 — 리액션, 공감, 응원
  AP: { RELATION: 0.9, MEANING: 0.3 },
  // AQ: 차한잔해 — 공감, 위로
  AQ: { RELATION: 0.85, MEANING: 0.4, FREEDOM: 0.3 },
  // AR: 디지털탐험가 — AI시대, 사회 변화
  AR: { RETIRE: 0.5, MEANING: 0.6, JOB: 0.3 },
  // AS: 취업전선 — 일자리, 면접, 이력서
  AS: { JOB: 0.95, MONEY: 0.3, DIGNITY: 0.4 },
  // AT: 자격증여왕 — 자격증, 컴퓨터 교육
  AT: { JOB: 0.9, MEANING: 0.5, HOBBY: 0.3 },
  // AU: 마라톤언니 — 마라톤, 수영, 등산
  AU: { HEALTH: 0.8, HOBBY: 0.9, MEANING: 0.3 },
  // AV: 혼밥러 — 혼밥, 1인 가구
  AV: { FREEDOM: 0.7, HOBBY: 0.4, RELATION: 0.3 },
  // AW: 뜨개질할머니 — 뜨개질, 느린 삶, 수공예
  AW: { HOBBY: 0.9, FREEDOM: 0.5, MEANING: 0.5 },
  // AX: 밴드여왕 — 동호회, 모임, 이벤트
  AX: { RELATION: 0.8, HOBBY: 0.5, MEANING: 0.3 },
  // EN1~EN5: 엔터 전담 (Step 8에서 페르소나 추가)
  EN1: { ENTERTAIN: 0.95, RELATION: 0.3 },
  EN2: { ENTERTAIN: 0.9, RELATION: 0.3, MEANING: 0.2 },
  EN3: { ENTERTAIN: 0.85, RELATION: 0.4 },
  EN4: { ENTERTAIN: 0.7, MEANING: 0.6, HOBBY: 0.3 },
  EN5: { ENTERTAIN: 0.8, FAMILY: 0.4, RELATION: 0.3 },
}

// ── 오늘의 CafeTrend 조회 ──

async function getTodayCafeTrend() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  return prisma.cafeTrend.findUnique({
    where: { date_period: { date: todayStart, period: 'daily' } },
  })
}

// ── desireRanking 생성 ──

function buildDesireRanking(desireMap: Record<string, number>): DesireRankItem[] {
  return Object.entries(desireMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, percent]) => ({
      category,
      percent,
      label: DESIRE_LABELS[category] ?? category,
    }))
}

// ── 페르소나별 쿼터 계산 ──

function computePersonaQuotas(
  desireMap: Record<string, number>,
  entertainPct: number,
): Record<string, PersonaQuota> {
  const quotas: Record<string, PersonaQuota> = {}

  for (const [personaId, affinities] of Object.entries(PERSONA_DESIRE_AFFINITY)) {
    // 엔터 페르소나는 별도 처리
    const isEntertain = ['EN1', 'EN2', 'EN3', 'EN4', 'EN5'].includes(personaId)
    if (isEntertain) {
      let multiplier = 0.0  // 기본 비활성
      if (entertainPct >= 10) {
        multiplier = 1.0 + (entertainPct / 100) * 3.0  // 10%=×1.3, 20%=×1.6
        multiplier = Math.min(multiplier, 2.0)  // 최대 ×2.0 캡
      } else if (entertainPct >= 5) {
        multiplier = 0.5  // 댓글만 (글쓰기 없음)
      }
      quotas[personaId] = {
        desireAlignment: affinities['ENTERTAIN'] ?? 0,
        quotaMultiplier: multiplier,
        topicHint: '연예/드라마/트로트/팬덤',
        shouldBoost: multiplier > 1.1,
      }
      continue
    }

    // 일반 페르소나: 욕망 친화도 × 분포 비중 가중 합산
    let desireAlignment = 0
    let topDesire = ''
    let topScore = 0

    for (const [desire, affinity] of Object.entries(affinities)) {
      const pct = desireMap[desire] ?? 0
      const score = affinity * (pct / 100)
      desireAlignment += score
      if (score > topScore) {
        topScore = score
        topDesire = desire
      }
    }

    // quotaMultiplier = 1.0 + desireAlignment × 1.5
    const quotaMultiplier = Math.min(1.0 + desireAlignment * 1.5, 2.0)

    quotas[personaId] = {
      desireAlignment: Math.round(desireAlignment * 1000) / 1000,
      quotaMultiplier: Math.round(quotaMultiplier * 100) / 100,
      topicHint: DESIRE_LABELS[topDesire] ?? '',
      shouldBoost: quotaMultiplier > 1.1,
    }
  }

  return quotas
}

// ── ContentDirective 생성 ──

function buildContentDirective(
  dominantDesire: string | null,
  desireRanking: DesireRankItem[],
): ContentDirective {
  const primary = dominantDesire ?? desireRanking[0]?.category ?? 'HEALTH'
  const directive = DIRECTIVE_MAP[primary] ?? DIRECTIVE_MAP['HEALTH']

  return {
    primaryTheme: directive.theme,
    toneGuide: directive.tone,
    avoidTopics: directive.avoid,
  }
}

// ── DailyBrief 생성 + 저장 ──

async function generateDailyBrief(): Promise<void> {
  const trend = await getTodayCafeTrend()

  if (!trend) {
    console.warn('[DailyBrief] 오늘 CafeTrend 없음 — psych-analyzer + trend-analyzer 먼저 실행 필요')
    return
  }

  const desireMap = (trend.desireMap ?? {}) as Record<string, number>
  const emotionDistribution = (trend.emotionDistribution ?? {}) as Record<string, number>
  const rawUrgentTopics = (trend.urgentTopics ?? []) as Array<{
    topic: string; count: number; urgencyAvg: number; psychInsight: string
  }>

  if (Object.keys(desireMap).length === 0) {
    console.warn('[DailyBrief] desireMap이 비어있음 — psych-analyzer 미실행 가능성')
    return
  }

  // 욕망 랭킹
  const desireRanking = buildDesireRanking(desireMap)

  // 지배적 욕망 (25% 이상만)
  const top = desireRanking[0]
  const dominantDesire = (top && top.percent >= 25) ? top.category : null

  // 지배적 감정
  const dominantEmotion = Object.entries(emotionDistribution)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // 긴급 토픽
  const urgentTopics: UrgentTopic[] = rawUrgentTopics.map(t => ({
    topic: t.topic,
    psychInsight: t.psychInsight,
    urgencyAvg: t.urgencyAvg,
    count: t.count,
  }))

  // 엔터 비율
  const entertainPct = desireMap['ENTERTAIN'] ?? 0
  const entertainActive = entertainPct >= 10

  // 페르소나 쿼터
  const personaQuotas = computePersonaQuotas(desireMap, entertainPct)

  // 콘텐츠 방향
  const contentDirective = buildContentDirective(dominantDesire, desireRanking)

  const todayStr = new Date().toISOString().slice(0, 10)
  const brief: DailyIntelligenceBrief = {
    date: todayStr,
    mode: 'deep',
    desireRanking,
    dominantDesire,
    dominantEmotion,
    urgentTopics,
    personaQuotas,
    contentDirective,
    entertainPct,
    entertainActive,
    midDayPatch: null,
    generatedAt: new Date().toISOString(),
  }

  // 파일 저장
  writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2), 'utf-8')
  console.log(`[DailyBrief] today-brief.json 저장 완료`)

  // DB 저장
  const todayDate = new Date(todayStr)
  await prisma.dailyBrief.upsert({
    where: { date: todayDate },
    create: {
      date: todayDate,
      mode: 'deep',
      desireRanking: JSON.parse(JSON.stringify(desireRanking)),
      dominantDesire,
      dominantEmotion,
      urgentTopics: JSON.parse(JSON.stringify(urgentTopics)),
      personaQuotas: JSON.parse(JSON.stringify(personaQuotas)),
      contentDirective: JSON.parse(JSON.stringify(contentDirective)),
      entertainPct,
      entertainActive,
    },
    update: {
      desireRanking: JSON.parse(JSON.stringify(desireRanking)),
      dominantDesire,
      dominantEmotion,
      urgentTopics: JSON.parse(JSON.stringify(urgentTopics)),
      personaQuotas: JSON.parse(JSON.stringify(personaQuotas)),
      contentDirective: JSON.parse(JSON.stringify(contentDirective)),
      entertainPct,
      entertainActive,
      mode: 'deep',
    },
  })
  console.log('[DailyBrief] DB 저장 완료')

  // Slack 알림
  const top3 = desireRanking.slice(0, 3).map(d => `• ${d.label} (${d.percent.toFixed(0)}%)`).join('\n')
  const boostPersonas = Object.entries(personaQuotas)
    .filter(([, q]) => q.shouldBoost)
    .sort((a, b) => b[1].quotaMultiplier - a[1].quotaMultiplier)
    .slice(0, 5)
    .map(([id, q]) => `${id}(×${q.quotaMultiplier.toFixed(1)})`)
    .join(', ')

  await notifySlack({
    level: 'info',
    agent: 'DAILY_BRIEF',
    title: `오늘의 욕망 지도 — ${todayStr}`,
    body: `*지배적 욕망:* ${dominantDesire ?? '분포 고름'}\n*주된 감정:* ${dominantEmotion ?? '복합'}\n\n*욕망 상위 3개:*\n${top3}\n\n*오늘 부스트 페르소나:* ${boostPersonas || '없음'}\n*콘텐츠 방향:* ${contentDirective.primaryTheme}${entertainActive ? `\n*엔터 활성화:* ENTERTAIN ${entertainPct.toFixed(0)}% (EN1-EN5 작동)` : ''}`,
  })
}

// ── 점심 midDayPatch 업데이트 ──

async function applyMidDayPatch(): Promise<void> {
  const trend = await getTodayCafeTrend()
  if (!trend?.desireMap) {
    console.warn('[DailyBrief] midDayPatch — CafeTrend 없음')
    return
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayDate = new Date(todayStr)

  // 기존 브리프 조회
  const existing = await prisma.dailyBrief.findUnique({ where: { date: todayDate } })
  if (!existing) {
    console.warn('[DailyBrief] midDayPatch — 오전 브리프 없음, 패치 스킵')
    return
  }

  const oldDesireMap = Object.fromEntries(
    (existing.desireRanking as Array<{category:string; percent:number}>).map(d => [d.category, d.percent])
  )
  const newDesireMap = trend.desireMap as Record<string, number>

  // 5% 이상 변화 감지
  const shifts: string[] = []
  const adjustedPersonas: { personaId: string; delta: number }[] = []

  for (const [cat, newPct] of Object.entries(newDesireMap)) {
    const oldPct = oldDesireMap[cat] ?? 0
    const diff = newPct - oldPct
    if (Math.abs(diff) >= 5) {
      shifts.push(`${cat} ${diff > 0 ? '+' : ''}${diff.toFixed(0)}%`)

      // 해당 욕망과 친화도 높은 페르소나 미세 조정 (±0.2 이내)
      for (const [personaId, affinities] of Object.entries(PERSONA_DESIRE_AFFINITY)) {
        const affinity = affinities[cat] ?? 0
        if (affinity >= 0.6) {
          const delta = Math.sign(diff) * Math.min(Math.abs(affinity * 0.2), 0.2)
          adjustedPersonas.push({ personaId, delta: Math.round(delta * 100) / 100 })
        }
      }
    }
  }

  if (shifts.length === 0) {
    console.log('[DailyBrief] midDayPatch — 5% 이상 변화 없음, 패치 스킵')
    return
  }

  const patch = {
    updatedAt: new Date().toISOString(),
    shiftNotes: shifts.join(', '),
    adjustedPersonas,
  }

  await prisma.dailyBrief.update({
    where: { date: todayDate },
    data: {
      midDayPatch: JSON.parse(JSON.stringify(patch)),
      mode: 'quick_update',
    },
  })

  console.log(`[DailyBrief] midDayPatch 적용 — ${shifts.join(', ')}`)

  await notifySlack({
    level: 'info',
    agent: 'DAILY_BRIEF',
    title: '오후 분위기 변화 감지',
    body: `*변화:* ${shifts.join(', ')}\n*조정 페르소나:* ${adjustedPersonas.length}명`,
  })
}

// ── 메인 ──

async function main() {
  const startTime = Date.now()

  if (isPatch) {
    console.log('[DailyBrief] 점심 midDayPatch 모드')
    await applyMidDayPatch()
  } else {
    console.log('[DailyBrief] DEEP 브리프 생성 모드')
    await generateDailyBrief()
  }

  await prisma.botLog.create({
    data: {
      botType: 'CAFE_CRAWLER',
      action: isPatch ? 'DAILY_BRIEF_PATCH' : 'DAILY_BRIEF_GENERATE',
      status: 'SUCCESS',
      details: JSON.stringify({ mode: isPatch ? 'patch' : 'deep' }),
      executionTimeMs: Date.now() - startTime,
    },
  })

  await disconnect()
  console.log(`[DailyBrief] 완료 — ${Math.round((Date.now() - startTime) / 1000)}초`)
}

main().catch(async (err) => {
  console.error('[DailyBrief] 오류:', err)
  await disconnect()
  process.exit(1)
})
