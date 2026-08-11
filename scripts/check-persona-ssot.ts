/**
 * persona SSoT 가드 (PR-7a / L-PERSONA-SSOT)
 *
 * persona 정의 원본을 registry 밖에서 직접 import하는 것을 막는다.
 *
 * ⚠️ **baseline 방식이다.** 지금 남아 있는 위반(BASELINE)은 통과시키고,
 *    **새 위반이 생기면 실패**한다. 원본 export 제거와 전면 차단은 PR-7e에서 한다.
 *    baseline 항목이 전환되면 이 목록에서 지운다 — 줄어들기만 해야 한다.
 *
 * 감지 형태 4종 — named import / named re-export / namespace import / star re-export.
 * namespace·star는 심볼을 특정할 수 없어 persona 정의 전체에 접근이 열리므로,
 * curator-shared라도 위반으로 본다(텍스트 유틸만 쓸 거면 named import를 쓰면 된다).
 *
 * 실행: npx tsx scripts/check-persona-ssot.ts
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * persona 정의 원본 — basename으로 매치한다.
 * 같은 디렉토리에서는 './curator-shared.js'처럼 쓰기 때문에 디렉토리를 포함하면 놓친다.
 */
const ORIGIN_MODULES = ['persona-data', 'curator-shared', 'curator-personas'] as const

/** curator-shared는 텍스트 유틸도 함께 갖고 있다. persona 심볼을 가져갈 때만 위반으로 본다. */
const CURATOR_PERSONA_SYMBOLS = [
  'PERSONAS', 'PersonaMatch', 'DESIRE_PERSONA_MAP', 'MENOPAUSE_CURATOR_PERSONA_IDS',
  'matchPersona', 'personasForRoutingBoard', 'personaIdsForRoutingBoard',
  'personaBoardForRouting', 'isMenopauseCuratorPersona',
]

/** 정당한 소비자 — 영구 허용 */
const ALLOW = new Set([
  // SSoT 진입점. 원본을 보는 유일한 정당 경로
  'agents/core/persona-registry.ts',
  // registry vs 원본 동일성을 비교하는 테스트 — 원본 직접 접근이 존재 이유다
  'src/__tests__/persona-seed-bridge.test.ts',
  'src/__tests__/persona-wave-bridge.test.ts',
  'src/__tests__/persona-curator-bridge.test.ts',
])

/**
 * 아직 전환하지 못한 기존 위반 — 통과시키되 **줄어들기만** 해야 한다.
 *
 * ⚠️ 파일 단위가 아니라 **file + module + kind + symbols** 단위로 고정한다.
 *    파일 단위면 baseline 파일 안에서 새 심볼·namespace import·star re-export가
 *    추가돼도 통과해 버린다. 아래 symbols에 없는 접근은 같은 파일이어도 FAIL이다.
 */
type BaselineEntry = {
  file: string
  module: (typeof ORIGIN_MODULES)[number]
  kind: AccessKind
  /** 정확히 이 심볼들만 허용. 하나라도 더 늘면 FAIL */
  symbols: string[]
  reason: string
}

const BASELINE: BaselineEntry[] = [
  {
    // PR-7b: persona 정의를 curator-personas.ts로 분리하면서, 기존 소비자가 깨지지 않도록
    // curator-shared.ts가 facade로 re-export한다. PR-7c에서 소비자를 옮기고 PR-7e에서 걷어낸다.
    file: 'agents/cafe/curator-shared.ts',
    module: 'curator-personas', kind: 'named-reexport',
    symbols: ['PERSONAS', 'DESIRE_PERSONA_MAP', 'MENOPAUSE_CURATOR_PERSONA_IDS', 'isMenopauseCuratorPersona',
              'personasForRoutingBoard', 'personaIdsForRoutingBoard', 'personaBoardForRouting', 'matchPersona', 'PersonaMatch'],
    reason: 'PR-7c/7e — 전환용 facade. 소비자 이전 후 제거',
  },
  {
    file: 'agents/cafe/content-curator.ts',
    module: 'curator-shared', kind: 'named-import',
    symbols: ['PersonaMatch', 'PERSONAS', 'DESIRE_PERSONA_MAP', 'matchPersona', 'personaBoardForRouting', 'personaIdsForRoutingBoard'],
    reason: 'PR-7c — curator-shared persona 블록 분리 후 전환',
  },
  {
    file: 'agents/cafe/popular-curator.ts',
    module: 'curator-shared', kind: 'named-import',
    symbols: ['matchPersona', 'personaBoardForRouting', 'personasForRoutingBoard'],
    reason: 'PR-7c — 동일',
  },
  {
    file: 'agents/coo/persona-matcher-profiles.ts',
    module: 'persona-data', kind: 'named-import',
    symbols: ['PERSONAS'],
    reason: 'PR-7d — registry로 흡수',
  },
  {
    file: 'agents/coo/persona-matcher-profiles.ts',
    module: 'curator-shared', kind: 'named-import',
    symbols: ['PERSONAS'],
    reason: 'PR-7d — registry로 흡수',
  },
  {
    file: 'src/__tests__/curator-menopause-persona.test.ts',
    module: 'curator-shared', kind: 'named-import',
    symbols: ['MENOPAUSE_CURATOR_PERSONA_IDS', 'isMenopauseCuratorPersona', 'matchPersona', 'personaBoardForRouting', 'personaIdsForRoutingBoard', 'personasForRoutingBoard'],
    reason: 'PR-7c — curator 라우팅 테스트, 전환과 함께 이동',
  },
]

/** (file, module, kind)로 baseline 엔트리를 찾는다 */
function findBaseline(v: Violation): BaselineEntry | undefined {
  return BASELINE.find(b => b.file === v.file && b.module === v.module && b.kind === v.kind)
}

type AccessKind = 'named-import' | 'namespace-import' | 'named-reexport' | 'star-reexport'
type Violation = { file: string; module: string; kind: AccessKind; symbols: string[] }

function gitFiles(): string[] {
  return execFileSync('git', ['ls-files', 'agents', 'src', 'scripts'], { encoding: 'utf8' })
    .split('\n')
    .filter(f => /\.tsx?$/.test(f))
}

/**
 * working tree를 읽는다. `git show :<file>`(index)로 읽으면 아직 stage하지 않은 수정이
 * 반영되지 않아 로컬에서 오판한다(CI는 checkout 상태라 동일하지만, 로컬 개발 중에 혼란스럽다).
 */
function readFile(f: string): string {
  return readFileSync(f, 'utf8')
}

function findViolations(): Violation[] {
  const out: Violation[] = []
  for (const file of gitFiles()) {
    if (file === 'scripts/check-persona-ssot.ts') continue // 자기 자신(문자열 상수)
    let src: string
    try { src = readFile(file) } catch { continue }

    for (const mod of ORIGIN_MODULES) {
      const FROM = String.raw`from\s*['"][^'"]*${mod}(?:\.js)?['"]`

      /** 심볼 목록을 가져가는 형태 — curator-shared는 persona 심볼일 때만 위반 */
      const named = (re: RegExp, kind: AccessKind) => {
        for (const m of src.matchAll(re)) {
          const syms = m[1].split(',')
            .map(x => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
            .filter(Boolean)
          if (syms.length === 0) continue
          const hit = mod === 'curator-shared'
            ? syms.filter(x => CURATOR_PERSONA_SYMBOLS.includes(x))
            : syms
          if (hit.length > 0) out.push({ file, module: mod, kind, symbols: hit })
        }
      }

      // ① import { A, B } from '…'        (multi-line 포함)
      named(new RegExp(String.raw`import\s*(?:type\s*)?\{([^}]*)\}\s*${FROM}`, 'gs'), 'named-import')
      // ② export { A, B } from '…'        re-export 우회
      named(new RegExp(String.raw`export\s*(?:type\s*)?\{([^}]*)\}\s*${FROM}`, 'gs'), 'named-reexport')

      // ③ import * as X from '…'  ④ export * (as X) from '…'
      //    심볼을 특정할 수 없다 = persona 정의 전체에 접근이 열린다 → 원본 종류와 무관하게 위반.
      //    curator-shared도 마찬가지다. 텍스트 유틸만 쓰려면 named import를 쓰면 된다.
      for (const [re, kind] of [
        [new RegExp(String.raw`import\s*\*\s*as\s+(\w+)\s*${FROM}`, 'gs'), 'namespace-import'],
        [new RegExp(String.raw`export\s*\*\s*(?:as\s+(\w+)\s*)?${FROM}`, 'gs'), 'star-reexport'],
      ] as [RegExp, AccessKind][]) {
        for (const m of src.matchAll(re)) {
          out.push({ file, module: mod, kind, symbols: [m[1] ? `* as ${m[1]}` : '*'] })
        }
      }
    }
  }
  return out
}

function main(): void {
  const violations = findViolations().filter(v => !ALLOW.has(v.file))

  /** baseline에 등재됐고 심볼도 범위 안 */
  const known: Violation[] = []
  /** baseline 밖이거나, 등재됐어도 심볼이 늘어난 것 */
  const offending: { v: Violation; why: string }[] = []

  for (const v of violations) {
    const b = findBaseline(v)
    if (!b) {
      offending.push({ v, why: BASELINE.some(x => x.file === v.file)
        ? `baseline 파일이지만 새 ${v.kind === 'named-import' ? 'module' : v.kind} 접근`
        : '새 파일' })
      continue
    }
    const extra = v.symbols.filter(s => !b.symbols.includes(s))
    if (extra.length > 0) {
      offending.push({ v, why: `baseline에 없는 심볼: ${extra.join(', ')}` })
      continue
    }
    known.push(v)
  }

  const seen = new Set(known.map(v => `${v.file}|${v.module}|${v.kind}`))
  const fixed = BASELINE.filter(b => !seen.has(`${b.file}|${b.module}|${b.kind}`))

  console.log('\n  ── persona SSoT 가드 (baseline) ──\n')
  console.log(`  허용(ALLOW)     ${ALLOW.size}건 — registry 진입점 + 원본 비교 테스트`)
  console.log(`  baseline 잔존   ${known.length}/${BASELINE.length}건  (file+module+kind+symbols 단위 고정)`)
  for (const v of known.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`     ${v.file}  ${v.module}/${v.kind}  [${v.symbols.join(', ')}]`)
    console.log(`        → ${findBaseline(v)!.reason}`)
  }
  if (fixed.length > 0) {
    console.log(`\n  ✅ 전환 완료(baseline에서 지워도 됨) ${fixed.length}건`)
    for (const b of fixed) console.log(`     ${b.file}  ${b.module}/${b.kind}`)
  }

  if (offending.length > 0) {
    console.log(`\n  ❌ FAIL — 새 위반 ${offending.length}건`)
    for (const { v, why } of offending) {
      console.log(`     ${v.file}  ${v.module}/${v.kind}  [${v.symbols.join(', ')}]`)
      console.log(`        사유: ${why}`)
    }
    console.log('\n  persona 원본을 직접 import하지 말고 agents/core/persona-registry.ts를 경유하세요.')
    console.log('  의도적으로 필요하면 ALLOW 또는 BASELINE에 사유와 함께 추가하세요.\n')
    process.exit(1)
  }

  console.log('\n  ✅ PASS — 새 위반 없음 (baseline은 PR-7b~e에서 순차 제거)\n')
}

main()
