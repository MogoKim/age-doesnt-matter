#!/usr/bin/env tsx
/**
 * BRIEF_CONSUMED BotLog 검증 스크립트
 *
 * 목적: today-brief 소비 추적 기능이 실제로 작동하는지 다각도 검증
 *
 * 검증 항목:
 *   1. BRIEF_CONSUMED 레코드 존재 여부 (오늘 날짜 기준)
 *   2. botType 유효성 (PostgreSQL enum 값인지)
 *   3. details JSON 구조 완결성 (consumedBy, briefDate, mode)
 *   4. 에이전트별 실행 여부 교차 검증 (다른 BotLog로 에이전트 실행 자체 확인)
 *   5. 음수 검증: 에이전트 실행됐는데 BRIEF_CONSUMED 없으면 버그 재발
 *
 * 사용법:
 *   npx tsx scripts/verify-brief-consumed.ts
 *
 * 출력 해석:
 *   ✅ 전체 통과 — 기능 정상 작동
 *   ⏳ 에이전트 미실행 — 아직 오늘 해당 에이전트가 실행 안 됨 (정상)
 *   ❌ 에이전트 실행됐는데 레코드 없음 — 버그 재발
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── 1. env 로드 ──
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = value
    }
    console.log('  .env.local 로드됨')
  } catch {
    console.log('  .env.local 없음 — process.env 사용')
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))

// ── 2. 상수 ──

const VALID_BOT_TYPES = new Set([
  'JOB', 'HUMOR', 'STORY', 'THREAD',
  'CEO', 'CTO', 'CMO', 'CPO', 'CDO', 'CFO', 'COO',
  'SEED', 'CAFE_CRAWLER', 'QA',
])

/** consumedBy → 예상 BotType 매핑 (intelligence.ts CONSUMED_BY_BOT_TYPE와 동기화) */
const EXPECTED_BOT_TYPE: Record<string, string> = {
  'magazine-generator': 'CAFE_CRAWLER',
  'seed-scheduler':     'SEED',
  'ceo-morning':        'CEO',
  'cmo-social':         'CMO',
  'coo-content':        'COO',
}

/** consumedBy → 교차 검증용 에이전트 BotType (다른 BotLog 확인)
 * magazine-generator는 BRIEF_CONSUMED를 CAFE_CRAWLER로 기록하지만(intelligence.ts 매핑),
 * 실제 실행 여부 확인은 MAGAZINE_GENERATE 액션(botType='COO')으로 검증해야 함 */
const CROSS_CHECK_BOT_TYPE: Record<string, string> = {
  'magazine-generator': 'COO',
  'seed-scheduler':     'SEED',
  'ceo-morning':        'CEO',
  'cmo-social':         'CMO',
  'coo-content':        'COO',
}

interface AgentRecord {
  botType: string
  consumedBy: string
  briefDate: string | null
  mode: string | null
  executedAt: Date
  isValidBotType: boolean
  isExpectedBotType: boolean
  hasCompleteDetails: boolean
}

// ── 3. 메인 (async IIFE — CJS top-level await 불가) ──

async function main() {
  // DB 임포트 (env 로드 후 dynamic import로 순서 보장)
  const { prisma } = await import('../agents/core/db.js')

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayStart = new Date(todayStr)

  console.log(`\n${'═'.repeat(55)}`)
  console.log(`  BRIEF_CONSUMED 검증 리포트 — ${todayStr}`)
  console.log(`${'═'.repeat(55)}\n`)

  // 3-A. BRIEF_CONSUMED 레코드 조회
  const briefLogs = await prisma.botLog.findMany({
    where: {
      action: 'BRIEF_CONSUMED',
      executedAt: { gte: todayStart },
    },
    orderBy: { executedAt: 'asc' },
  })

  // 3-B. consumedBy별 그룹화 (중복 포함 전체 기록)
  const records: AgentRecord[] = []

  for (const log of briefLogs) {
    let consumedBy = 'unknown'
    let briefDate: string | null = null
    let mode: string | null = null
    let hasCompleteDetails = false

    try {
      const parsed = JSON.parse(log.details as string) as {
        consumedBy?: string
        briefDate?: string
        mode?: string
      }
      consumedBy = parsed.consumedBy ?? 'unknown'
      briefDate = parsed.briefDate ?? null
      mode = parsed.mode ?? null
      hasCompleteDetails = !!(parsed.consumedBy && parsed.briefDate && parsed.mode)
    } catch { /* details 파싱 실패 */ }

    const botType = log.botType as string
    const isValidBotType = VALID_BOT_TYPES.has(botType)
    const expectedBotType = EXPECTED_BOT_TYPE[consumedBy]
    const isExpectedBotType = expectedBotType === botType

    records.push({
      botType,
      consumedBy,
      briefDate,
      mode,
      executedAt: log.executedAt,
      isValidBotType,
      isExpectedBotType,
      hasCompleteDetails,
    })
  }

  // 3-C. 에이전트별 최신 기록 (asc 정렬이므로 마지막이 최신)
  const byAgent = new Map<string, AgentRecord>()
  for (const r of records) {
    byAgent.set(r.consumedBy, r)
  }

  // 3-D. 교차 검증: 해당 에이전트가 오늘 실행됐는지 다른 BotLog로 확인
  const crossCheckBotTypes = [...new Set(Object.values(CROSS_CHECK_BOT_TYPE))]
  const agentRanToday = await prisma.botLog.findMany({
    where: {
      botType: { in: crossCheckBotTypes as never[] },
      executedAt: { gte: todayStart },
      NOT: { action: 'BRIEF_CONSUMED' },
    },
    select: { botType: true, action: true, executedAt: true },
    distinct: ['botType'],
    orderBy: { executedAt: 'desc' },
  })

  const ranBotTypes = new Set(agentRanToday.map(l => l.botType as string))

  // ── 4. 결과 출력 ──

  console.log('📋 에이전트별 BRIEF_CONSUMED 상태:\n')

  let allPass = true
  let anyAgentRan = false

  for (const [consumedBy, expectedBotType] of Object.entries(EXPECTED_BOT_TYPE)) {
    const record = byAgent.get(consumedBy)
    const crossBotType = CROSS_CHECK_BOT_TYPE[consumedBy]
    const agentRan = ranBotTypes.has(crossBotType)

    if (agentRan) anyAgentRan = true

    if (!record) {
      if (!agentRan) {
        console.log(`  ⏳ ${consumedBy}`)
        console.log(`     에이전트 미실행 (오늘 아직 GHA 미실행) — 나중에 재확인`)
      } else {
        console.log(`  ❌ ${consumedBy}`)
        console.log(`     에이전트(${crossBotType})는 오늘 실행됐으나 BRIEF_CONSUMED 레코드 없음`)
        console.log(`     → 버그 재발 또는 신 코드 미반영 확인 필요`)
        allPass = false
      }
    } else {
      const runCount = records.filter(r => r.consumedBy === consumedBy).length
      const timeStr = record.executedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      const botTypeOk = record.isValidBotType && record.isExpectedBotType
      const detailsOk = record.hasCompleteDetails

      if (botTypeOk && detailsOk) {
        console.log(`  ✅ ${consumedBy}`)
        console.log(`     botType=${record.botType} | briefDate=${record.briefDate} | mode=${record.mode}`)
        console.log(`     ${runCount}회 실행 | 마지막=${timeStr}`)
      } else {
        console.log(`  ❌ ${consumedBy}`)
        if (!record.isValidBotType) {
          console.log(`     botType=${record.botType} — 유효하지 않은 enum 값 (버그 재발)`)
        }
        if (!record.isExpectedBotType) {
          console.log(`     botType=${record.botType} (기대값: ${expectedBotType}) — 매핑 오류`)
        }
        if (!detailsOk) {
          console.log(`     details JSON 불완전: ${JSON.stringify({ consumedBy: record.consumedBy, briefDate: record.briefDate, mode: record.mode })}`)
        }
        allPass = false
      }
    }
    console.log()
  }

  // ── 5. 전체 요약 ──

  console.log('─'.repeat(55))

  if (records.length === 0 && !anyAgentRan) {
    console.log('\n⏳ 오늘 아직 어떤 에이전트도 실행되지 않음')
    console.log('   GHA 다음 실행 후 재실행하세요')
    console.log('\n   예상 다음 실행 시각 (KST 기준):')
    console.log('   - CEO morning: 09:00 KST (GHA 0 0 * * * UTC)')
    console.log('   - Seed scheduler: 09회 분산 실행')
    console.log('   - Magazine generator: 16:00 KST')
  } else if (allPass && records.length > 0) {
    console.log(`\n✅ 전체 검증 통과 — 총 ${records.length}건 기록됨`)
    console.log('   BRIEF_CONSUMED 기능 정상 작동 확인')
    console.log('\n   Slack #시스템에서도 확인:')
    console.log('   "BotLog 기록 실패 — BRIEF_CONSUMED" 알림 없어야 함')
  } else {
    console.log(`\n❌ 검증 실패 — ${records.length}건 기록 중 이슈 발견`)
    console.log('   위 오류 내용 확인 후 코드 재점검 필요')
  }

  console.log(`\n${'═'.repeat(55)}\n`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('검증 스크립트 오류:', err)
  process.exit(1)
})
