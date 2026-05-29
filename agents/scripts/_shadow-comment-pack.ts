// Shadow Mode: DB read-only preview — DB write 금지, LLM은 --llm 옵션 시에만
// Usage: npx tsx scripts/_shadow-comment-pack.ts [--dry-run] [--llm] [--postId <id>] [--limit <n>]

import { prisma, disconnect } from '../core/db.js'
import { getPersona } from '../seed/persona-data.js'
import type { PrismaClient } from '../../src/generated/prisma/client.js'

// db.ts는 Record<string,unknown>으로 export — 생성된 타입으로 캐스트
const db = prisma as unknown as PrismaClient

// ── filterSourceComments 인라인 복사 (sheet-scraper.ts 수정 금지, export 없음) ──
const HARD_REMOVE_RE = /^[ㄱ-ㅎㅏ-ㅣ\s!?.,♡♥★☆]+$|^[\d\s.,!?]+$/

function filterSourceComments(raw: string[]): string[] {
  const seen = new Set<string>()
  return raw
    .map(c => c
      .replace(/@\S+/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .trim()
    )
    .filter(c => {
      if (c.length < 5) return false
      if (HARD_REMOVE_RE.test(c)) return false
      const key = c.slice(0, 4)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .filter(c => c.length >= 10)
}

// ── mockSoftTransform (dry-run 전용) ──
const SOFT_TRANSFORMS: [RegExp, string][] = [
  [/(씨발|개새|존나|씨팔)/g, '(순화됨)'],
  [/먹어봐요|드셔보세요|드세요/g, '드셔보면 어떨까요'],
  [/병원 가세요|꼭 가보세요/g, '병원 한번 가보시는 것도'],
  [/이거 사세요|구매하세요/g, '이런 거 있다고 하더라고요'],
  [/반드시 하세요|꼭 하세요/g, '하면 좋을 것 같아요'],
]

function mockSoftTransform(text: string): { result: string; changed: boolean } {
  let result = text
  for (const [re, replacement] of SOFT_TRANSFORMS) {
    result = result.replace(re, replacement)
  }
  return { result, changed: result !== text }
}

// ── calcSimilarity (bigram 복사 리스크) ──
function calcSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  const bigrams = (s: string): Set<string> => {
    const bg = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2))
    return bg
  }
  const ba = bigrams(a)
  const bb = bigrams(b)
  let shared = 0
  for (const g of ba) if (bb.has(g)) shared++
  return (2 * shared) / (ba.size + bb.size || 1)
}

// ── Validator ──
interface CommentCandidate {
  personaId: string
  sourceCommentIndex: number  // filteredComments 기준 인덱스 (Shadow 내부 preview 전용)
  text: string
}

interface ValidationResult {
  pass: boolean
  errors: string[]
  warns: string[]
}

function validateCommentPack(
  candidates: CommentCandidate[],
  filteredComments: string[],
  targetCount: number,           // BotLog details.targetCount
  allowedPersonaIds: string[],   // BotLog details.personaIds
): ValidationResult {
  const errors: string[] = []
  const warns: string[] = []

  // 1. sourceCommentIndex 중복
  const indices = candidates.map(c => c.sourceCommentIndex)
  if (new Set(indices).size !== indices.length) errors.push('sourceCommentIndex 중복')

  // 2. index 범위
  for (const c of candidates) {
    if (c.sourceCommentIndex < 0 || c.sourceCommentIndex >= filteredComments.length) {
      errors.push(`index 범위 초과: ${c.personaId} idx=${c.sourceCommentIndex} (max ${filteredComments.length - 1})`)
    }
  }

  // 3. 복사 리스크 (>70% → WARN)
  for (const c of candidates) {
    const orig = filteredComments[c.sourceCommentIndex]
    if (orig && c.text && !c.text.startsWith('[MOCK')) {
      const sim = calcSimilarity(c.text, orig)
      if (sim > 0.7) warns.push(`복사 리스크 ${(sim * 100).toFixed(0)}%: persona=${c.personaId}`)
    }
  }

  // 4. 최소 길이 (MOCK 텍스트는 dry-run 단편이므로 스킵 — LLM 실제 생성 시에만 적용)
  for (const c of candidates) {
    if (c.text.startsWith('[MOCK')) continue
    if (c.text.length < 10) errors.push(`최소 길이 미달: ${c.personaId} len=${c.text.length}`)
  }

  // 5. requestedCount === (정확 일치)
  if (candidates.length !== targetCount) {
    errors.push(`requestedCount 불일치: candidates=${candidates.length} !== targetCount=${targetCount}`)
  }

  // 6. personaId 범위 (BotLog details.personaIds 기준)
  for (const c of candidates) {
    if (!allowedPersonaIds.includes(c.personaId)) {
      errors.push(`personaId 범위 외: ${c.personaId}`)
    }
  }

  // 7. personaId 중복
  const pids = candidates.map(c => c.personaId)
  if (new Set(pids).size !== pids.length) errors.push('personaId 중복')

  return { pass: errors.length === 0, errors, warns }
}

// ── parseDetails helper ──
function parseDetails(details: unknown): Record<string, unknown> {
  try {
    if (typeof details === 'string') return JSON.parse(details)
    if (typeof details === 'object' && details !== null) return details as Record<string, unknown>
  } catch { /* ignore */ }
  return {}
}

// ── 페르소나 nickname 안전 조회 ──
function safeNickname(personaId: string): string {
  try { return getPersona(personaId).nickname } catch { return personaId }
}

// ── mock 댓글 (dry-run) ──
function generateMockComment(personaId: string, waveType: 'empathy' | 'critical' | 'reversal'): string {
  try {
    const p = getPersona(personaId)
    const pool = [...(p.examples ?? []), ...(p.speech_patterns ?? [])]
    if (pool.length > 0) return `[MOCK/${waveType}] ${pool[Math.floor(Math.random() * pool.length)]}`
    return `[MOCK/${waveType}] (${p.nickname} 예시 없음)`
  } catch {
    return `[MOCK/${waveType}] (persona ${personaId} 없음)`
  }
}

// ── 필터 diff 출력 ──
function printFilterDiff(raw: string[], storedFiltered: string[]) {
  console.log(`  📥 원본 댓글 (sourceCommentsRaw, raw=${raw.length}):`)
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i].slice(0, 70)
    console.log(`    ${i + 1}. ${line}${raw[i].length > 70 ? '…' : ''}`)
  }

  console.log(`  📋 P1 필터 결과 (sourceComments, stored=${storedFiltered.length}):`)
  for (let i = 0; i < storedFiltered.length; i++) {
    const line = storedFiltered[i].slice(0, 70)
    console.log(`    ✅ ${i + 1}. ${line}${storedFiltered[i].length > 70 ? '…' : ''}`)
  }

  // 재필터 검증 — 운영과 동일한 로직으로 재현
  const reFiltered = filterSourceComments(raw)
  if (reFiltered.length !== storedFiltered.length) {
    console.log(`  ⚠️  재필터 결과(${reFiltered.length})와 stored(${storedFiltered.length}) 불일치 — 필터 로직 변경 가능성`)
  }
  const removed = raw.length - reFiltered.length
  if (removed > 0) {
    console.log(`  ✂ 제거 ${removed}개 (raw ${raw.length} → filtered ${reFiltered.length})`)
  }
}

// ── Validator 결과 출력 ──
function printValidator(vr: ValidationResult, targetCount: number, candidateCount: number) {
  if (vr.pass && vr.warns.length === 0) {
    console.log(`  ✅ Validator:`)
    console.log(`    sourceCommentIndex 중복 PASS  |  index 범위 PASS`)
    console.log(`    복사 리스크 PASS              |  최소 길이 PASS`)
    console.log(`    requestedCount(${targetCount}===${candidateCount}) PASS  |  personaId 범위 PASS  |  personaId 중복 PASS`)
  } else {
    console.log(`  ${vr.pass ? '⚠️ ' : '❌'} Validator:`)
    for (const e of vr.errors) console.log(`    ❌ ${e}`)
    for (const w of vr.warns) console.log(`    ⚠️  ${w}`)
    if (vr.pass && vr.warns.length > 0) console.log(`    ✅ errors 없음 (warn만 있음)`)
  }
}

// ── LLM 함수 타입 ──
type GenFn = (personaId: string, title: string, content: string, waveType: 'empathy' | 'critical' | 'reversal', keyTerms: string[], sourceComments: string[]) => Promise<string>

// ── 일반 ENGAGE 샘플 출력 ──
async function printNormalSample(
  log: { id: string; details: unknown; createdAt: Date },
  idx: number,
  total: number,
  genFn: GenFn | null,
) {
  const d = parseDetails(log.details)
  const postId = d.postId as string
  const targetCount = (d.targetCount as number | undefined) ?? 4
  const sourceCommentsRaw = (d.sourceCommentsRaw as string[] | undefined) ?? []
  const sourceComments = (d.sourceComments as string[] | undefined) ?? []
  const personaIds = (d.personaIds as string[]) ?? []

  const post = await db.post.findUnique({
    where: { id: postId },
    select: { title: true, content: true },
  })

  const sep = '═'.repeat(65)
  const line = '─'.repeat(65)
  console.log(`\n${sep}`)
  console.log(`[SAMPLE ${idx}/${total}] 일반 ENGAGE — postId=${postId.slice(0, 12)}…  ${log.createdAt.toISOString().slice(0, 10)}`)
  console.log(`글 제목: "${(post?.title ?? '(조회 실패)').slice(0, 55)}"`)
  console.log(line)

  printFilterDiff(sourceCommentsRaw, sourceComments)

  const mode = genFn ? 'current-generator-preview' : 'dry-run MOCK'
  console.log(`\n  🎭 v2 댓글팩 예상 — targetCount=${targetCount} / empathy [${mode}]`)

  const candidates: CommentCandidate[] = []
  let transformedCount = 0
  const pickedPersonas = personaIds.slice(0, targetCount)

  for (let i = 0; i < pickedPersonas.length; i++) {
    const personaId = pickedPersonas[i]
    const sourceCommentIndex = Math.min(i, sourceComments.length - 1)

    let raw: string
    if (genFn) {
      try {
        raw = await genFn(personaId, post?.title ?? '', post?.content ?? '', 'empathy', [], sourceComments)
      } catch (e) {
        raw = `[LLM 오류: ${String(e).slice(0, 40)}]`
      }
    } else {
      raw = generateMockComment(personaId, 'empathy')
    }

    const { result: text, changed } = mockSoftTransform(raw)
    if (changed) transformedCount++
    const nick = safeNickname(personaId)
    console.log(`    [${personaId}/${nick}]  "${text.slice(0, 65)}${text.length > 65 ? '…' : ''}"${changed ? ' 🔧' : ''}`)
    candidates.push({ personaId, sourceCommentIndex, text })
  }

  console.log(`    🔧 soft transform: ${transformedCount > 0 ? `${transformedCount}건` : '없음'}`)

  console.log(line)
  const vr = validateCommentPack(candidates, sourceComments, targetCount, personaIds)
  printValidator(vr, targetCount, candidates.length)
}

// ── 화제성 wave 세트 출력 ──
async function printFeaturedSet(
  waves: { id: string; details: unknown; createdAt: Date }[],
  idx: number,
  total: number,
  genFn: GenFn | null,
) {
  if (waves.length === 0) return

  const firstD = parseDetails(waves[0].details)
  const postId = firstD.postId as string

  const post = await db.post.findUnique({
    where: { id: postId },
    select: { title: true, content: true },
  })

  const sep = '═'.repeat(65)
  console.log(`\n${sep}`)
  console.log(`[SAMPLE 화제성 ${idx}/${total}] postId=${postId.slice(0, 12)}…  ${waves[0].createdAt.toISOString().slice(0, 10)}`)
  console.log(`글 제목: "${(post?.title ?? '(조회 실패)').slice(0, 55)}"`)

  // wave 간 details.sourceComments.length 비교
  const waveLengths = waves.map(w => {
    const d = parseDetails(w.details)
    return ((d.sourceComments as string[] | undefined) ?? []).length
  })
  const allSame = waveLengths.every(l => l === waveLengths[0])
  if (!allSame) {
    console.log(`  ⚠️  WARN: wave 간 details.sourceComments.length 불일치 — ${waveLengths.join(' / ')}`)
  }

  let firstWavePrinted = false

  for (const wave of waves) {
    const d = parseDetails(wave.details)
    const waveType = (d.waveType as 'empathy' | 'critical' | 'reversal' | undefined) ?? 'empathy'
    const targetCount = (d.targetCount as number | undefined) ?? 3
    const sourceCommentsRaw = (d.sourceCommentsRaw as string[] | undefined) ?? []
    const sourceComments = (d.sourceComments as string[] | undefined) ?? []
    const personaIds = (d.personaIds as string[]) ?? []

    console.log(`\n  wave [${waveType.toUpperCase()}] targetCount=${targetCount}  personaIds=[${personaIds.join(',')}]`)
    console.log(`  sourceComments(filtered)=${sourceComments.length}  sourceCommentsRaw=${sourceCommentsRaw.length}`)

    if (!firstWavePrinted) {
      console.log(`${'─'.repeat(65)}`)
      printFilterDiff(sourceCommentsRaw, sourceComments)
      firstWavePrinted = true
    }

    const mode = genFn ? 'current-generator-preview' : 'dry-run MOCK'
    console.log(`\n  🎭 v2 댓글팩 예상 — ${waveType} [${mode}]`)

    const candidates: CommentCandidate[] = []
    let transformedCount = 0
    const pickedPersonas = personaIds.slice(0, targetCount)

    for (let i = 0; i < pickedPersonas.length; i++) {
      const personaId = pickedPersonas[i]
      const sourceCommentIndex = Math.min(i, sourceComments.length - 1)

      let raw: string
      if (genFn) {
        try {
          raw = await genFn(personaId, post?.title ?? '', post?.content ?? '', waveType, [], sourceComments)
        } catch (e) {
          raw = `[LLM 오류: ${String(e).slice(0, 40)}]`
        }
      } else {
        raw = generateMockComment(personaId, waveType)
      }

      const { result: text, changed } = mockSoftTransform(raw)
      if (changed) transformedCount++
      const nick = safeNickname(personaId)
      console.log(`    [${personaId}/${nick}]  "${text.slice(0, 65)}${text.length > 65 ? '…' : ''}"${changed ? ' 🔧' : ''}`)
      candidates.push({ personaId, sourceCommentIndex, text })
    }

    console.log(`    🔧 soft transform: ${transformedCount > 0 ? `${transformedCount}건` : '없음'}`)
    const vr = validateCommentPack(candidates, sourceComments, targetCount, personaIds)
    printValidator(vr, targetCount, candidates.length)
  }
}

// ── 메인 로직 ──
async function runShadow(opts: { useLlm: boolean; postId: string | null; limit: number }) {
  const { useLlm, postId, limit } = opts
  const P1_BASELINE = new Date('2026-05-29T08:54:00.000Z')

  console.log(`\n🔍 Shadow Mode — ${useLlm ? 'LLM (current-generator-preview)' : 'dry-run MOCK (기본)'} | limit=${limit}`)
  console.log(`   P1_BASELINE: ${P1_BASELINE.toISOString()} | postId: ${postId ?? '자동 샘플링'}`)

  // --llm: dynamic import (API 키 필요, top-level import 금지)
  let genFn: GenFn | null = null
  if (useLlm) {
    const mod = await import('../seed/generator.js')
    genFn = mod.generateSheetViralComment as GenFn
  }

  const allLogs = await db.botLog.findMany({
    where: {
      action: { in: ['SHEET_ENGAGE_COMMENT_PENDING', 'SHEET_COMMENT_WAVE_PENDING'] },
      createdAt: { gte: P1_BASELINE },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, action: true, details: true, createdAt: true },
    take: 300,
  })

  // sourceCommentsRaw + sourceComments 둘 다 있는 것만 (구 BotLog 제외)
  // details.sourceCommentsFiltered는 존재하지 않음 — 절대 읽지 말 것
  const validLogs = allLogs.filter(l => {
    const d = parseDetails(l.details)
    if (postId && (d.postId as string) !== postId) return false
    return (
      Array.isArray(d.sourceCommentsRaw) && (d.sourceCommentsRaw as string[]).length > 0 &&
      Array.isArray(d.sourceComments) && (d.sourceComments as string[]).length > 0
    )
  })

  const normalLogs = validLogs.filter(l => l.action === 'SHEET_ENGAGE_COMMENT_PENDING')
  const waveLogs = validLogs.filter(l => l.action === 'SHEET_COMMENT_WAVE_PENDING')

  // 화제성: postId 기준 묶기
  const waveByPost = new Map<string, typeof waveLogs>()
  for (const w of waveLogs) {
    const pid = parseDetails(w.details).postId as string
    if (!waveByPost.has(pid)) waveByPost.set(pid, [])
    waveByPost.get(pid)!.push(w)
  }

  const normalSamples = normalLogs.slice(0, limit)
  const waveGroups = [...waveByPost.values()].slice(0, limit)

  console.log(`\n  일반 ENGAGE: ${normalSamples.length}건 / 화제성 WAVE 세트: ${waveGroups.length}건`)

  for (let i = 0; i < normalSamples.length; i++) {
    await printNormalSample(normalSamples[i], i + 1, normalSamples.length, genFn)
  }

  for (let i = 0; i < waveGroups.length; i++) {
    await printFeaturedSet(waveGroups[i], i + 1, waveGroups.length, genFn)
  }

  const sep = '═'.repeat(65)
  console.log(`\n${sep}`)
  console.log(`📊 Shadow Mode 요약 (${new Date().toISOString().slice(0, 10)})`)
  console.log(`  일반: ${normalSamples.length}건 | 화제성: ${waveGroups.length}세트`)
  console.log(`  모드: ${useLlm ? 'LLM current-generator-preview' : 'dry-run MOCK'}`)
  console.log(sep)
}

// ── CLI 파싱 ──
function parseCli() {
  const args = process.argv.slice(2)
  const useLlm = args.includes('--llm')
  const postIdIdx = args.indexOf('--postId')
  const postId = postIdIdx !== -1 ? (args[postIdIdx + 1] ?? null) : null
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx !== -1 ? Math.max(1, parseInt(args[limitIdx + 1] ?? '2', 10)) : 2
  return { useLlm, postId, limit }
}

async function main() {
  const opts = parseCli()
  try {
    await runShadow(opts)
  } catch (e) {
    console.error('[Shadow] 오류:', e)
    process.exit(1)
  } finally {
    await disconnect()
  }
}

main()
