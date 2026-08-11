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
const ORIGIN_MODULES = ['persona-data', 'curator-shared'] as const

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
 * 아직 전환하지 못한 기존 위반 — 통과시키되 줄어들기만 해야 한다.
 * 각 항목에 어느 PR에서 없앨지 적어 둔다.
 */
const BASELINE = new Map<string, string>([
  ['agents/coo/persona-matcher-profiles.ts', 'PR-7d — registry로 흡수'],
  ['agents/cafe/content-curator.ts', 'PR-7c — curator-shared persona 블록 분리 후 전환'],
  ['agents/cafe/popular-curator.ts', 'PR-7c — 동일'],
  ['src/__tests__/curator-menopause-persona.test.ts', 'PR-7c — curator 라우팅 테스트, 전환과 함께 이동'],
])

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
  const violations = findViolations()
  const offenders = new Map<string, Violation[]>()
  for (const v of violations) {
    if (ALLOW.has(v.file)) continue
    const list = offenders.get(v.file) ?? []
    list.push(v)
    offenders.set(v.file, list)
  }

  const knownFiles = [...offenders.keys()].filter(f => BASELINE.has(f)).sort()
  const newFiles = [...offenders.keys()].filter(f => !BASELINE.has(f)).sort()
  const fixedFiles = [...BASELINE.keys()].filter(f => !offenders.has(f)).sort()

  console.log('\n  ── persona SSoT 가드 (baseline) ──\n')
  console.log(`  허용(ALLOW)     ${ALLOW.size}건 — registry 진입점 + 원본 비교 테스트`)
  console.log(`  baseline 잔존   ${knownFiles.length}/${BASELINE.size}건`)
  for (const f of knownFiles) {
    const vs = offenders.get(f)!
    const syms = vs.flatMap(v => v.symbols)
    const kinds = [...new Set(vs.map(v => v.kind))].join('/')
    console.log(`     ${f}  [${[...new Set(syms)].join(', ')}] (${kinds})  → ${BASELINE.get(f)}`)
  }
  if (fixedFiles.length > 0) {
    console.log(`\n  ✅ 전환 완료(baseline에서 지워도 됨) ${fixedFiles.length}건`)
    for (const f of fixedFiles) console.log(`     ${f}`)
  }

  if (newFiles.length > 0) {
    console.log(`\n  ❌ FAIL — 새 위반 ${newFiles.length}건`)
    for (const f of newFiles) {
      const vs = offenders.get(f)!
      const syms = vs.flatMap(v => v.symbols)
      const kinds = [...new Set(vs.map(v => v.kind))].join('/')
      console.log(`     ${f}  [${[...new Set(syms)].join(', ')}] (${kinds})`)
    }
    console.log('\n  persona 원본을 직접 import하지 말고 agents/core/persona-registry.ts를 경유하세요.')
    console.log('  의도적으로 필요하면 ALLOW 또는 BASELINE에 사유와 함께 추가하세요.\n')
    process.exit(1)
  }

  console.log('\n  ✅ PASS — 새 위반 없음 (baseline은 PR-7b~e에서 순차 제거)\n')
}

main()
