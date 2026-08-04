#!/usr/bin/env tsx
/**
 * ops-typecheck — agents/** · scripts/** 타입 회귀 가드 (baseline 비교)
 *
 * 사용법:
 *   npx tsx scripts/check-ops-typecheck.ts
 *   BASE_REF=origin/develop npx tsx scripts/check-ops-typecheck.ts
 *
 * 왜 필요한가:
 *   root `tsconfig.json`의 exclude에 **`agents`와 `scripts`가 둘 다** 들어 있다.
 *   그래서 `npx tsc --noEmit`을 아무리 돌려도 이 두 디렉토리는 검사되지 않는다.
 *   CI의 `quality` job 조건도 `frontend || prisma || admin`이라 여기에 걸리지 않는다.
 *   → PR #260(agents)·#261(scripts)·#263(scripts)이 전부 **타입 검증 없이** merge됐다.
 *
 * 왜 "오류 0"을 기준으로 쓸 수 없는가:
 *   agents/scripts는 원래 strict 검사를 받은 적이 없어 현재 **958건**의 기존 오류가 있다
 *   (대부분 TS18046 unknown · TS7006 implicit any). 이걸 0으로 만드는 건 별개의 대공사다.
 *   지금 필요한 건 "깨끗하게 만드는 것"이 아니라 **"더 나빠지지 않게 막는 것"**이다.
 *
 * 그래서 baseline 비교를 한다:
 *   PR 브랜치와 origin/main을 **같은 tsconfig로** 검사해 오류 수를 비교한다.
 *   전체가 늘었거나 특정 파일이 늘면 FAIL. 줄었으면 칭찬하고 통과.
 *
 * ⚠️ baseline 실행의 함정:
 *   origin/main에는 `tsconfig.ops.json`이 없을 수 있다(이 PR에서 신설되므로).
 *   그래서 baseline worktree에 **현재 브랜치의 tsconfig를 복사해서** 같은 조건으로 잰다.
 *   그러지 않으면 "설정이 달라서 생긴 차이"를 "코드가 나빠진 것"으로 오판한다.
 *
 * 이 스크립트는 코드를 고치지 않는다. 세고 비교만 한다.
 * exit code: 신규 오류가 있으면 1, 아니면 0.
 */

import { execFileSync } from 'child_process'
import { existsSync, copyFileSync, rmSync, symlinkSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE_REF = process.env.BASE_REF ?? 'origin/main'
const TSCONFIG = 'tsconfig.ops.json'
const BASE_WORKTREE = join(tmpdir(), 'ops-typecheck-baseline')

interface Counts {
  total: number
  byFile: Map<string, number>
}

function sh(cmd: string, args: string[], cwd = ROOT): string {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
      timeout: 600_000,
    })
  } catch (e) {
    // tsc는 오류가 있으면 non-zero로 끝난다 — stdout을 그대로 써야 한다
    const err = e as { stdout?: string; stderr?: string }
    return `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
}

/** tsc 출력을 파일별 오류 수로 집계 (라인 번호는 무시 — 코드가 밀려도 오탐하지 않게) */
function typecheck(cwd: string, label: string): Counts {
  const out = sh('npx', ['tsc', '-p', TSCONFIG], cwd)
  const byFile = new Map<string, number>()
  let total = 0
  for (const line of out.split('\n')) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error TS\d+/)
    if (!m) continue
    const file = m[1].replace(/\\/g, '/').replace(/^.*?(agents|scripts)\//, '$1/')
    byFile.set(file, (byFile.get(file) ?? 0) + 1)
    total++
  }
  console.log(`  ${label.padEnd(12)} 오류 ${String(total).padStart(4)}건 · 파일 ${byFile.size}개`)
  return { total, byFile }
}

function cleanupWorktree(): void {
  try { sh('git', ['worktree', 'remove', '--force', BASE_WORKTREE]) } catch { /* 없으면 무시 */ }
  try { rmSync(BASE_WORKTREE, { recursive: true, force: true }) } catch { /* 무시 */ }
}

function main(): void {
  console.log('ops-typecheck — agents/** · scripts/** 타입 회귀 가드')
  console.log(`base: ${BASE_REF}\n`)

  if (!existsSync(join(ROOT, TSCONFIG))) {
    console.log(`  ❌ ${TSCONFIG} 가 없다. 이 스크립트는 그 설정에 의존한다.`)
    process.exit(1)
  }

  // 1) 현재 브랜치
  const head = typecheck(ROOT, 'HEAD')

  // 2) baseline — 같은 tsconfig를 복사해 동일 조건으로 잰다
  cleanupWorktree()
  const added = sh('git', ['worktree', 'add', '--detach', BASE_WORKTREE, BASE_REF])
  if (!existsSync(BASE_WORKTREE)) {
    console.log(`\n  ⚠️  baseline worktree 생성 실패 — 비교를 건너뛴다.\n${added.trim().slice(0, 300)}`)
    console.log('  (얕은 클론이면 CI에서 fetch-depth: 0 이 필요하다)')
    process.exit(0)
  }
  // node_modules / prisma 산출물은 링크로 공유한다 (재설치 없이 동일 조건)
  for (const dep of ['node_modules', 'src/generated/prisma']) {
    const src = join(ROOT, dep)
    const dst = join(BASE_WORKTREE, dep)
    if (!existsSync(src) || existsSync(dst)) continue
    try {
      sh('mkdir', ['-p', dirname(dst)])
      symlinkSync(src, dst)
    } catch { /* 링크 실패해도 tsc가 스스로 해결할 수 있다 */ }
  }
  copyFileSync(join(ROOT, TSCONFIG), join(BASE_WORKTREE, TSCONFIG))
  const base = typecheck(BASE_WORKTREE, BASE_REF)
  cleanupWorktree()

  // 3) 비교
  console.log('')
  const regressions: string[] = []
  for (const [file, n] of head.byFile) {
    const before = base.byFile.get(file) ?? 0
    if (n > before) regressions.push(`${file}  ${before} → ${n}  (+${n - before})`)
  }
  const improvedFiles = [...base.byFile].filter(([f, n]) => (head.byFile.get(f) ?? 0) < n).length

  if (regressions.length === 0) {
    const delta = head.total - base.total
    console.log(`  ✅ PASS — 신규 타입 오류 없음 (전체 ${base.total} → ${head.total}${delta === 0 ? '' : delta < 0 ? `, ${-delta}건 개선` : ''})`)
    if (improvedFiles > 0) console.log(`     ${improvedFiles}개 파일에서 오류가 줄었다.`)
    process.exit(0)
  }

  console.log(`  ❌ FAIL — 파일 ${regressions.length}개에서 타입 오류가 늘었다 (전체 ${base.total} → ${head.total})\n`)
  for (const r of regressions) console.log(`     ${r}`)
  console.log('\n  agents/scripts는 root tsc에서 제외돼 있어 이 게이트가 유일한 타입 방어선이다.')
  console.log('  기존 958건을 0으로 만들 필요는 없다. **늘리지만 않으면 된다.**')
  process.exit(1)
}

main()
