#!/usr/bin/env tsx
/**
 * ops-doctor — 운영 실행 경로 · git 정합성 진단 (read-only)
 *
 * 사용법: npx tsx scripts/ops-doctor.ts
 *
 * 무엇을 보는가:
 *   운영 clone(unao-prod)이 최신인지, launchd 12개가 정말 그 경로를 실행하는지,
 *   개발 작업트리의 미커밋 변경이 운영에 섞일 위험은 없는지, 로그가 어디에 쌓이는지.
 *
 * 왜 필요한가 (2026-08-04 실측):
 *   - launchd 12잡이 두 실행 루트에 갈려 있다(unao-prod 11 / unao-ops 1).
 *     눈으로 세면 매번 틀린다. 실제로 "unao-ops는 git 미관리"라고 오판한 적이 있는데,
 *     이 스크립트로 확인하니 추적되고 있었다. 사람의 기억이 아니라 실측이 필요하다.
 *   - 개발 작업트리가 origin/main 대비 behind 79 · dirty 39로 계속 벌어진다.
 *     운영이 이 경로를 실행하면 미커밋 코드가 그대로 돈다.
 *   - 크롤 로그가 07-30 경로 전환으로 두 곳에 갈렸다(개발트리 ~07-30 / unao-prod 07-31~).
 *     한쪽만 보고 "기록이 없다"고 오판한 사례가 있었다.
 *
 * ⚠️ stale ref 함정 (이 스크립트의 존재 이유 중 하나):
 *   `git -C <운영clone> rev-list HEAD..origin/main` 은 **거짓 0**을 낸다.
 *   운영 clone은 마지막 pull 시점의 origin/main ref를 그대로 들고 있기 때문이다.
 *   실측 예: unao-prod의 origin/main=fb696ab3 인데 실제 원격은 69d6802c.
 *   그래서 여기서는 `git ls-remote`로 **원격을 직접 조회**한다.
 *   `git fetch`를 쓰지 않는 이유는 그것이 로컬 ref를 갱신하는 쓰기 동작이기 때문이다.
 *
 * 이 스크립트가 하지 않는 것: fetch/pull/checkout, plist 수정, launchctl 조작, DB 접근.
 * 전부 조회만 한다.
 *
 * exit code: FATAL이 하나라도 있으면 1, 그 외(WARN 포함)는 0.
 */

import { execFileSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const HOME = homedir()
const PROD_DIR = join(HOME, 'Documents/unao-prod')
const OPS_DIR = join(HOME, 'Documents/unao-ops')
const DEV_DIR = join(HOME, 'Documents/New_Claude_agenotmatter')
const LAUNCH_AGENTS = join(HOME, 'Library/LaunchAgents')

type Level = 'PASS' | 'WARN' | 'FATAL'

interface Finding {
  level: Level
  section: string
  message: string
}

const findings: Finding[] = []
const record = (level: Level, section: string, message: string): void => {
  findings.push({ level, section, message })
}

const ICON: Record<Level, string> = { PASS: '✅', WARN: '⚠️ ', FATAL: '❌' }

/** 실패해도 스크립트를 죽이지 않는 명령 실행 — 진단 도구는 한 항목이 막혀도 나머지를 계속 봐야 한다 */
function run(cmd: string, args: string[], cwd?: string): string | null {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    }).trim()
  } catch {
    return null
  }
}

function isGitRepo(dir: string): boolean {
  if (!existsSync(dir)) return false
  return run('git', ['rev-parse', '--is-inside-work-tree'], dir) === 'true'
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 8) : '-'
}

/** 디렉토리에서 가장 최근에 수정된 파일 (로그 경로 활성 여부 판정용) */
function latestFile(dir: string): { name: string; mtime: Date } | null {
  if (!existsSync(dir)) return null
  let best: { name: string; mtime: Date } | null = null
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (!st.isFile()) continue
    if (!best || st.mtime > best.mtime) best = { name, mtime: st.mtime }
  }
  return best
}

function fmtTime(d: Date): string {
  return d.toLocaleString('ko-KR', { hour12: false })
}

function header(title: string): void {
  console.log(`\n${'─'.repeat(74)}\n${title}\n${'─'.repeat(74)}`)
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1~3. 운영 clone (unao-prod)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** 원격 main의 실제 SHA — ls-remote는 로컬 ref를 건드리지 않는 순수 조회다 */
function remoteMainSha(dir: string): string | null {
  const out = run('git', ['ls-remote', 'origin', 'refs/heads/main'], dir)
  if (!out) return null
  const first = out.split('\n')[0]?.trim()
  return first ? first.split(/\s+/)[0] ?? null : null
}

function checkProdClone(): void {
  header('[1-3] 운영 clone — /Users/yanadoo/Documents/unao-prod')

  if (!existsSync(PROD_DIR)) {
    console.log('  ❌ 디렉토리가 없다. launchd 잡 전부가 실행 불가 상태다.')
    record('FATAL', 'unao-prod', '디렉토리 없음')
    return
  }
  if (!isGitRepo(PROD_DIR)) {
    console.log('  ❌ git 저장소가 아니다.')
    record('FATAL', 'unao-prod', 'git 저장소 아님')
    return
  }

  const head = run('git', ['rev-parse', 'HEAD'], PROD_DIR)
  const headMsg = run('git', ['log', '-1', '--format=%s'], PROD_DIR) ?? ''
  const dirty = run('git', ['status', '--porcelain'], PROD_DIR) ?? ''
  const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0
  const staleRef = run('git', ['rev-parse', 'origin/main'], PROD_DIR)
  const remote = remoteMainSha(PROD_DIR)

  console.log(`  HEAD              ${shortSha(head)}  ${headMsg.slice(0, 44)}`)
  console.log(`  로컬 origin/main  ${shortSha(staleRef)}  ← 마지막 pull 시점의 기억(신뢰 금지)`)
  console.log(`  원격 실제 main    ${shortSha(remote)}  ← git ls-remote 직접 조회`)

  if (dirtyCount === 0) {
    console.log('  작업트리          clean')
    record('PASS', 'unao-prod', 'clean')
  } else {
    console.log(`  작업트리          ⚠️  미커밋 ${dirtyCount}건 — 운영 경로에 손댄 흔적이다`)
    record('WARN', 'unao-prod', `미커밋 ${dirtyCount}건`)
  }

  if (!remote) {
    console.log('  동기화 상태       ⚠️  원격 조회 실패(네트워크/인증) — 최신성 판정 보류')
    record('WARN', 'unao-prod', '원격 조회 실패로 최신성 미판정')
    return
  }

  if (head === remote) {
    console.log('  동기화 상태       ✅ 원격 main과 동일')
    record('PASS', 'unao-prod', '원격과 동일')
  } else {
    // 몇 커밋 뒤인지는 원격 커밋을 로컬이 알아야 셀 수 있다. 모르면 개수 대신 사실만 알린다.
    const behind = run('git', ['rev-list', '--count', `${head}..${remote}`], PROD_DIR)
    const gap = behind ? `${behind}커밋 뒤` : '뒤처짐(커밋 수는 fetch 없이 셀 수 없다)'
    console.log(`  동기화 상태       ⚠️  원격과 다름 — ${gap}`)
    console.log('                    03:00 KST unao-prod-sync 가 반영한다. 급하면 수동 pull.')
    record('WARN', 'unao-prod', `원격과 불일치(${gap})`)
  }

  if (staleRef && remote && staleRef !== remote) {
    console.log('  ⓘ 로컬 origin/main ref가 원격과 다르다 — 이래서 rev-list 비교는 거짓 0을 낸다.')
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. 개발 작업트리
 * ═══════════════════════════════════════════════════════════════════════════ */

function checkDevWorktree(): void {
  header('[4] 개발 작업트리 — 운영과 분리돼 있어야 한다')

  if (!isGitRepo(DEV_DIR)) {
    console.log('  ⓘ 개발 작업트리를 찾지 못했다(다른 머신일 수 있음). 건너뛴다.')
    return
  }
  const head = run('git', ['rev-parse', 'HEAD'], DEV_DIR)
  const headMsg = run('git', ['log', '-1', '--format=%s'], DEV_DIR) ?? ''
  const dirty = run('git', ['status', '--porcelain'], DEV_DIR) ?? ''
  const dirtyCount = dirty ? dirty.split('\n').filter(Boolean).length : 0
  const behind = run('git', ['rev-list', '--count', 'HEAD..origin/main'], DEV_DIR)

  console.log(`  HEAD    ${shortSha(head)}  ${headMsg.slice(0, 46)}`)
  console.log(`  behind  ${behind ?? '?'}커밋 (로컬 origin/main ref 기준)`)
  console.log(`  dirty   ${dirtyCount}건`)

  // 개발트리가 뒤처지거나 지저분한 것 자체는 정상이다. 운영이 여기를 실행하지 않는 한 문제가 아니다.
  console.log('  ⓘ 개발트리의 behind/dirty는 그 자체로 문제가 아니다.')
  console.log('    문제가 되는 경우는 launchd가 이 경로를 실행할 때뿐이며, 그건 [5-7]에서 본다.')
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 5-7 & 10. launchd plist
 * ═══════════════════════════════════════════════════════════════════════════ */

interface PlistInfo {
  file: string
  label: string
  workDir: string | null
  envWorkDir: string | null
  programArgs: string[]
  stdout: string | null
  stderr: string | null
}

function readPlist(file: string): PlistInfo | null {
  const raw = run('plutil', ['-convert', 'json', '-o', '-', join(LAUNCH_AGENTS, file)])
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (typeof parsed !== 'object' || parsed === null) return null
  const p = parsed as Record<string, unknown>
  const env = (typeof p.EnvironmentVariables === 'object' && p.EnvironmentVariables !== null)
    ? p.EnvironmentVariables as Record<string, unknown>
    : {}
  const args = Array.isArray(p.ProgramArguments)
    ? p.ProgramArguments.filter((a): a is string => typeof a === 'string')
    : []
  return {
    file,
    label: typeof p.Label === 'string' ? p.Label : file.replace(/\.plist$/, ''),
    workDir: typeof p.WorkingDirectory === 'string' ? p.WorkingDirectory : null,
    envWorkDir: typeof env.UNAO_WORKDIR === 'string' ? env.UNAO_WORKDIR : null,
    programArgs: args,
    stdout: typeof p.StandardOutPath === 'string' ? p.StandardOutPath : null,
    stderr: typeof p.StandardErrorPath === 'string' ? p.StandardErrorPath : null,
  }
}

/** 경로가 어느 실행 루트에 속하는지 — 표에 짧게 찍기 위한 라벨 */
function rootOf(path: string | null): string {
  if (!path) return '-'
  if (path.startsWith(PROD_DIR)) return 'prod'
  if (path.startsWith(OPS_DIR)) return 'ops'
  if (path.startsWith(DEV_DIR)) return 'DEV'
  return 'other'
}

function checkLaunchd(opsTracked: boolean): PlistInfo[] {
  header('[5-7] launchd — 어느 경로를 실행하는가')

  if (!existsSync(LAUNCH_AGENTS)) {
    console.log('  ⓘ ~/Library/LaunchAgents 없음. 건너뛴다.')
    return []
  }
  // `com.unao.` prefix로 좁힌다. `com.unaoeo.figma-*`(Figma MCP 도구)는 우나어 운영 잡이 아니다.
  const files = readdirSync(LAUNCH_AGENTS)
    .filter((f) => f.endsWith('.plist') && f.startsWith('com.unao.'))
    .sort()

  if (files.length === 0) {
    console.log('  ⓘ unao 관련 plist가 없다.')
    return []
  }

  const infos: PlistInfo[] = []
  console.log('  잡 이름                                 workdir  env  args  out  err')
  for (const f of files) {
    const info = readPlist(f)
    if (!info) {
      console.log(`  ${f.padEnd(40)} (파싱 실패)`)
      record('WARN', 'launchd', `${f} 파싱 실패`)
      continue
    }
    infos.push(info)

    // ProgramArguments 중 실행 루트를 가리키는 인자(스크립트 경로 등)만 본다
    const argRoots = new Set(
      info.programArgs
        .filter((a) => a.startsWith('/Users/'))
        .map((a) => rootOf(a))
        .filter((r) => r !== 'other'),
    )
    const argLabel = argRoots.size ? [...argRoots].join(',') : '-'

    const name = info.label.replace(/^com\.unao\./, '')
    console.log(
      `  ${name.padEnd(40)} ${rootOf(info.workDir).padEnd(7)} ${rootOf(info.envWorkDir).padEnd(4)} ` +
      `${argLabel.padEnd(5)} ${rootOf(info.stdout).padEnd(4)} ${rootOf(info.stderr)}`,
    )

    // (a) 개발 작업트리를 가리키면 즉시 문제 — 운영이 미커밋 코드를 실행하게 된다
    const allRoots = [rootOf(info.workDir), rootOf(info.envWorkDir), rootOf(info.stdout), rootOf(info.stderr), ...argRoots]
    if (allRoots.includes('DEV')) {
      record('FATAL', 'launchd', `${name}: 개발 작업트리를 가리킨다`)
    } else if (allRoots.includes('ops')) {
      // unao-ops가 git으로 추적되고 있으면 별도 실행 루트라는 사실만 알리면 된다.
      if (opsTracked) {
        record('PASS', 'launchd', `${name}: unao-ops 경로 (git 추적 중 — 별도 실행 루트)`)
      } else {
        record('WARN', 'launchd', `${name}: unao-ops 경로 — git 미관리라 실행 코드 추적 불가`)
      }
    } else if (allRoots.some((r) => r === 'other')) {
      record('WARN', 'launchd', `${name}: 알 수 없는 경로`)
    }

    // (b) 실행 대상 스크립트가 실제로 존재하는가 — 없으면 그 잡은 매 회차 실패한다
    const scriptArg = info.programArgs.find((a) => a.startsWith('/Users/') && /\.(mjs|js|ts|sh)$/.test(a))
    if (scriptArg && !existsSync(scriptArg)) {
      console.log(`      ❌ 실행 파일 없음: ${scriptArg}`)
      record('FATAL', 'launchd', `${name}: 실행 파일 없음 (${scriptArg})`)
    }
  }

  const prodOnly = infos.filter((i) => rootOf(i.workDir) === 'prod').length
  console.log(`\n  요약: 총 ${infos.length}개 · unao-prod ${prodOnly}개 · 그 외 ${infos.length - prodOnly}개`)
  return infos
}

function checkFmkorea(infos: PlistInfo[]): void {
  header('[10] fmkorea — 비활성이어야 한다')
  const fm = infos.filter((i) => i.label.toLowerCase().includes('fmkorea'))
  const loaded = run('launchctl', ['list']) ?? ''
  const loadedFm = loaded.split('\n').filter((l) => l.toLowerCase().includes('fmkorea'))

  console.log(`  plist        ${fm.length}개`)
  console.log(`  launchctl    ${loadedFm.length}개 로드됨`)
  if (fm.length === 0 && loadedFm.length === 0) {
    console.log('  ✅ 비활성 (plist 없음 · 로드 없음)')
    record('PASS', 'fmkorea', '비활성')
  } else {
    console.log('  ⚠️  활성 흔적이 있다 — 의도한 것인지 확인 필요')
    record('WARN', 'fmkorea', `plist ${fm.length} · loaded ${loadedFm.length}`)
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 8. unao-ops
 * ═══════════════════════════════════════════════════════════════════════════ */

function checkOpsDir(): boolean {
  header('[8] unao-ops — git 추적 여부')

  if (!existsSync(OPS_DIR)) {
    console.log('  ⓘ 디렉토리 없음. 이 경로를 쓰는 잡이 없다면 정상이다.')
    return true
  }
  if (isGitRepo(OPS_DIR)) {
    const head = run('git', ['rev-parse', 'HEAD'], OPS_DIR)
    const dirty = run('git', ['status', '--porcelain'], OPS_DIR) ?? ''
    console.log(`  ✅ git 관리 중 — HEAD ${shortSha(head)} · dirty ${dirty ? dirty.split('\n').filter(Boolean).length : 0}건`)
    record('PASS', 'unao-ops', 'git 관리 중')
    return true
  } else {
    console.log('  ⚠️  git 미관리 디렉토리다.')
    console.log('      여기서 도는 잡은 무엇이 실행 중인지 이력 추적이 안 된다.')
    console.log('      → 성격을 정해야 한다: git으로 편입하거나, unao-prod로 흡수하거나, 폐기하거나.')
    record('WARN', 'unao-ops', 'git 미관리 — 실행 코드 이력 추적 불가')
    return false
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 9. 로그 경로
 * ═══════════════════════════════════════════════════════════════════════════ */

function checkLogs(): void {
  header('[9] 로그 경로 — 07-30 전환으로 두 곳에 갈렸다')

  const targets: { label: string; dir: string; note: string }[] = [
    { label: 'unao-prod/logs', dir: join(PROD_DIR, 'logs'), note: '현재 운영 (07-31~)' },
    { label: 'unao-ops/logs', dir: join(OPS_DIR, 'logs'), note: 'unao-ops 잡' },
    { label: '개발트리/logs', dir: join(DEV_DIR, 'logs'), note: '과거 기록 (~07-30) — 삭제 금지' },
  ]

  for (const t of targets) {
    const latest = latestFile(t.dir)
    if (!latest) {
      console.log(`  ${t.label.padEnd(18)} (없음/비어있음)          ${t.note}`)
      continue
    }
    const ageH = (Date.now() - latest.mtime.getTime()) / 3_600_000
    const fresh = ageH < 12 ? '🟢' : ageH < 48 ? '🟡' : '⚪'
    console.log(
      `  ${t.label.padEnd(18)} ${fresh} ${fmtTime(latest.mtime)}  ${latest.name.slice(0, 28).padEnd(28)} ${t.note}`,
    )
  }
  console.log('\n  ⓘ 로그는 append다. 과거 기록을 찾을 때는 **두 경로를 모두** 봐야 한다.')
  console.log('    한쪽만 보고 "기록이 없다"고 판단한 오판 사례가 있었다(2026-08-04).')
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 요약
 * ═══════════════════════════════════════════════════════════════════════════ */

function summarize(): number {
  header('요약')
  const fatal = findings.filter((f) => f.level === 'FATAL')
  const warn = findings.filter((f) => f.level === 'WARN')
  const pass = findings.filter((f) => f.level === 'PASS')

  for (const f of [...fatal, ...warn]) {
    console.log(`  ${ICON[f.level]} [${f.section}] ${f.message}`)
  }
  if (fatal.length === 0 && warn.length === 0) {
    console.log('  ✅ 이상 없음')
  }

  console.log(`\n  PASS ${pass.length} · WARN ${warn.length} · FATAL ${fatal.length}`)
  if (fatal.length > 0) {
    console.log('\n  ❌ FATAL이 있다. 운영이 멈추거나 잘못된 코드를 실행 중일 수 있다.')
    return 1
  }
  if (warn.length > 0) {
    console.log('\n  ⚠️  WARN은 즉시 장애는 아니지만 확인이 필요하다. (exit 0)')
  }
  return 0
}

/* ═══════════════════════════════════════════════════════════════════════════ */

function main(): void {
  console.log('ops-doctor — 운영 실행 경로 · git 정합성 진단 (read-only)')
  console.log(`실행 시각: ${fmtTime(new Date())}`)

  checkProdClone()
  checkDevWorktree()
  // unao-ops 추적 여부를 먼저 확인해야 launchd 경로 판정에 반영할 수 있다
  const opsTracked = checkOpsDir()
  const infos = checkLaunchd(opsTracked)
  checkLogs()
  checkFmkorea(infos)

  process.exit(summarize())
}

main()
