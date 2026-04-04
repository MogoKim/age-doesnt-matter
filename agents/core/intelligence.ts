/**
 * Intelligence Harness — 단일 진실 소스
 *
 * 모든 에이전트가 오늘의 욕망 지도를 읽는 공통 인터페이스.
 * 크롤 → 심리분석 → DailyIntelligenceBrief → 에이전트 행동 결정의 마지막 단계.
 *
 * 사용법:
 *   import { loadTodayBrief, buildIntelligenceBlock } from '../core/intelligence.js'
 *   const brief = await loadTodayBrief()
 *   const block = buildIntelligenceBlock(brief)  // 시스템 프롬프트에 주입
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BRIEF_PATH = resolve(__dirname, 'today-brief.json')

// ── 타입 정의 ──

export interface DesireRankItem {
  category: string   // "HEALTH"
  percent: number    // 35.2
  label: string      // "건강/증상/병원"
}

export interface UrgentTopic {
  topic: string       // "갱년기 불안, 정보 갈증"
  psychInsight: string
  urgencyAvg: number  // 1.0–5.0
  count: number
}

export interface PersonaQuota {
  desireAlignment: number   // 0.0–1.0 (욕망 친화도 × 분포 비중)
  quotaMultiplier: number   // 1.0 = 기본, 1.5 = 50% 증가
  topicHint: string         // "건강 공감, 갱년기 정보"
  shouldBoost: boolean      // quotaMultiplier > 1.1
}

export interface ContentDirective {
  primaryTheme: string    // "건강 불안 공감"
  toneGuide: string       // "따뜻한 공감 + 실질 정보 제공"
  avoidTopics: string[]   // ["가벼운 유머", "여행 자랑"]
}

export interface MidDayPatch {
  updatedAt: string        // ISO timestamp
  shiftNotes: string       // "FAMILY +8%, HEALTH -5% 변화 감지"
  adjustedPersonas: { personaId: string; delta: number }[]
}

export interface DailyIntelligenceBrief {
  date: string                              // "2026-04-04"
  mode: 'deep' | 'quick_update'
  desireRanking: DesireRankItem[]           // 내림차순
  dominantDesire: string | null             // 25% 이상일 때만 설정
  dominantEmotion: string | null            // "ANXIOUS"
  urgentTopics: UrgentTopic[]
  personaQuotas: Record<string, PersonaQuota>
  contentDirective: ContentDirective
  entertainPct: number                      // ENTERTAIN 비율 (%)
  entertainActive: boolean                  // entertain_pct >= 10
  midDayPatch: MidDayPatch | null
  generatedAt: string                       // ISO timestamp
}

// ── 파일/DB에서 오늘의 브리프 로드 ──

export async function loadTodayBrief(options: {
  fallbackToPrevious?: boolean
} = {}): Promise<DailyIntelligenceBrief | null> {
  const todayStr = new Date().toISOString().slice(0, 10)

  // 1) 파일 캐시 먼저 (가장 빠름)
  if (existsSync(BRIEF_PATH)) {
    try {
      const raw = readFileSync(BRIEF_PATH, 'utf-8')
      const brief = JSON.parse(raw) as DailyIntelligenceBrief
      if (brief.date === todayStr) return brief
    } catch {
      // 파일 손상 시 DB로 폴백
    }
  }

  // 2) DB에서 조회
  try {
    const todayStart = new Date(todayStr)
    const record = await prisma.dailyBrief.findUnique({
      where: { date: todayStart },
    })
    if (record) {
      return {
        date: todayStr,
        mode: record.mode as 'deep' | 'quick_update',
        desireRanking: record.desireRanking as DesireRankItem[],
        dominantDesire: record.dominantDesire ?? null,
        dominantEmotion: record.dominantEmotion ?? null,
        urgentTopics: record.urgentTopics as UrgentTopic[],
        personaQuotas: record.personaQuotas as Record<string, PersonaQuota>,
        contentDirective: record.contentDirective as ContentDirective,
        entertainPct: record.entertainPct,
        entertainActive: record.entertainActive,
        midDayPatch: (record.midDayPatch as MidDayPatch) ?? null,
        generatedAt: record.createdAt.toISOString(),
      }
    }
  } catch (err) {
    console.warn('[Intelligence] DB 조회 실패:', err instanceof Error ? err.message : err)
  }

  // 3) 폴백: 어제 브리프 사용
  if (options.fallbackToPrevious) {
    try {
      const yesterday = new Date(todayStr)
      yesterday.setDate(yesterday.getDate() - 1)

      const record = await prisma.dailyBrief.findFirst({
        where: { date: { lt: new Date(todayStr) } },
        orderBy: { date: 'desc' },
      })
      if (record) {
        console.warn('[Intelligence] 오늘 브리프 없음 — 어제 브리프 사용 (폴백)')
        return {
          date: record.date.toISOString().slice(0, 10),
          mode: record.mode as 'deep' | 'quick_update',
          desireRanking: record.desireRanking as DesireRankItem[],
          dominantDesire: record.dominantDesire ?? null,
          dominantEmotion: record.dominantEmotion ?? null,
          urgentTopics: record.urgentTopics as UrgentTopic[],
          personaQuotas: record.personaQuotas as Record<string, PersonaQuota>,
          contentDirective: record.contentDirective as ContentDirective,
          entertainPct: record.entertainPct,
          entertainActive: record.entertainActive,
          midDayPatch: null,  // 폴백 시 midDayPatch 초기화
          generatedAt: record.createdAt.toISOString(),
        }
      }
    } catch (err) {
      console.warn('[Intelligence] 폴백 조회 실패:', err instanceof Error ? err.message : err)
    }
  }

  return null
}

// ── 에이전트 시스템 프롬프트용 인텔리전스 블록 생성 ──

export function buildIntelligenceBlock(brief: DailyIntelligenceBrief | null): string {
  if (!brief) return ''

  const top3 = brief.desireRanking.slice(0, 3)
  const desireLines = top3.map(d => `  - ${d.label} (${d.percent.toFixed(0)}%)`).join('\n')

  const urgentLine = brief.urgentTopics.length > 0
    ? brief.urgentTopics.slice(0, 2).map(t => `  - ${t.topic} (긴급도 ${t.urgencyAvg.toFixed(1)})`).join('\n')
    : '  - (없음)'

  const isFallback = brief.date !== new Date().toISOString().slice(0, 10)
  const fallbackNote = isFallback ? `\n  ※ 어제(${brief.date}) 데이터 기반 운영 중 — 오늘 브리프 없음` : ''

  const entertainNote = brief.entertainActive
    ? `\n- 연예/엔터 활성: ENTERTAIN 비율 ${brief.entertainPct.toFixed(0)}% (엔터 페르소나 활성화됨)`
    : ''

  return `
[오늘의 커뮤니티 욕망 지도${isFallback ? ' — 폴백' : ''}]
- 지배적 욕망: ${brief.dominantDesire ?? '분포 고름 (특정 욕망 지배 없음)'}
- 주된 감정: ${brief.dominantEmotion ?? '복합'}
- 욕망 상위 3개:
${desireLines}
- 긴급 토픽:
${urgentLine}
- 콘텐츠 방향: ${brief.contentDirective.primaryTheme}
- 톤 가이드: ${brief.contentDirective.toneGuide}${entertainNote}${fallbackNote}

이 정보는 오늘 하루 커뮤니티 분위기와 회원들의 실제 관심사를 반영합니다.
콘텐츠를 직접 인용하거나 브리프를 언급하지 말고, 자연스럽게 분위기에 맞게 활동하세요.
`.trim()
}

// ── 특정 페르소나의 오늘 쿼터 조회 ──

export function getPersonaQuota(
  brief: DailyIntelligenceBrief | null,
  personaId: string,
): PersonaQuota {
  const DEFAULT: PersonaQuota = {
    desireAlignment: 0,
    quotaMultiplier: 1.0,
    topicHint: '',
    shouldBoost: false,
  }

  if (!brief) return DEFAULT
  return brief.personaQuotas[personaId] ?? DEFAULT
}
