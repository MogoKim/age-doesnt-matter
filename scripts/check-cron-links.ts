#!/usr/bin/env tsx
/**
 * Cron Link Checker — runner.ts HANDLERS ↔ GitHub Actions 워크플로우 연결 검증
 * 사용법: npx tsx scripts/check-cron-links.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const RUNNER_PATH = join(ROOT, 'agents/cron/runner.ts')
const WORKFLOWS_DIR = join(ROOT, '.github/workflows')

/**
 * 워크플로우에서 핸들러 키를 뽑는 패턴.
 *
 * `CRON_LINK_ANNOTATION` 은 주석인데도 연결로 **인정한다**. 워크플로우가
 * `runner.ts community ${{ steps.determine.outputs.task }}` 처럼 task 를 런타임에
 * 정하면 정적 스캔으로는 키를 알 수 없어서, 저장소가 쓰는 기존 규약이다.
 * 그 외 주석 줄은 전부 버린다 — 예전에는 주석 처리된 `echo "agent=..."` 를 세는 바람에
 * launchd 로 이관해 GHA 를 껐는데도 "연결됨"으로 나왔다(cafe_crawler:magazine-generate).
 */
const CRON_LINK_ANNOTATION = /^\s*#\s*cron-link-check:\s*runner\.ts\s+(\S+)\s+(\S+)/
const RUNNER_CALL = /runner\.ts\s+(\S+)\s+(\S+)/g
const ECHO_AGENT = /echo\s+["']agent=([^"'\s]+)["']/g
const ECHO_TASK = /echo\s+["']task=([^"'\s]+)["']/g

/**
 * 크론 미연결이 의도적임을 알리는 면제 표기.
 *
 * 저장소에 세 표기가 섞여 있어 전부 받는다 — `// DISPATCH ONLY`,
 * JSDoc 의 ` * LOCAL ONLY`, 그리고 ` * // DISPATCH ONLY`.
 * 예전에는 `//` 만 봐서 JSDoc 에 적어 둔 파일은 면제가 안 잡혔다
 * (magazine-generator.ts). 대신 줄 **앞머리**에서만 인정한다 — 본문 아무 데나
 * 적힌 문장이 면제로 둔갑하면 끊긴 크론이 조용히 통과한다.
 */
const EXEMPT_DISPATCH = /^[\s*/]*DISPATCH\s+ONLY\b/im
const EXEMPT_LOCAL = /^[\s*/]*LOCAL\s+ONLY\b/im

export interface HandlerInfo { key: string; importPath: string }

export interface LaunchdOrphan { plist: string; missingFile: string }

export interface Report {
  total: number
  linked: number
  orphaned: string[]
  dispatchOnly: string[]
  localOnly: string[]
  unlinkedWithoutReason: string[]
  launchdOrphans: LaunchdOrphan[]
}

export function extractHandlers(runnerPath: string = RUNNER_PATH): HandlerInfo[] {
  const src = readFileSync(runnerPath, 'utf-8')
  const results: HandlerInfo[] = []
  const re = /^\s*'([^']+)':\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    results.push({ key: m[1], importPath: m[2] })
  }
  return results
}

/**
 * 워크플로우 전체에서 `<agent>:<task>` 키를 모은다.
 *
 * 파일 이름으로 거르지 않는다 — 예전에는 `agents-*.yml` 만 읽어서
 * `post-deploy-qa.yml` 이 실제로 호출하는 `qa:deploy-audit` 가 orphan 으로 나왔다.
 * 대신 **줄 단위로** 읽어 주석을 걸러낸다. 파일 통째로 정규식을 돌리면
 * 주석 처리된 호출과 설명 문장까지 같이 걸린다.
 */
export function extractWorkflowKeys(workflowsDir: string = WORKFLOWS_DIR): Set<string> {
  const keys = new Set<string>()
  const files = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)).sort()

  for (const file of files) {
    const lines = readFileSync(join(workflowsDir, file), 'utf-8').split('\n')

    // 주석을 걷어낸 '실행되는 줄'만 남긴다. 규약 주석은 따로 먼저 건진다.
    const executable: string[] = []
    for (const line of lines) {
      const annotated = CRON_LINK_ANNOTATION.exec(line)
      if (annotated) {
        keys.add(`${annotated[1].toLowerCase()}:${annotated[2]}`)
        continue
      }
      // 줄 전체가 주석이면 버린다. 뒤에 붙은 주석(`... ;; # 중단`)은 앞부분이 살아 있으므로 남긴다.
      if (line.trimStart().startsWith('#')) continue
      executable.push(line)
    }
    const content = executable.join('\n')

    let m: RegExpExecArray | null
    RUNNER_CALL.lastIndex = 0
    while ((m = RUNNER_CALL.exec(content)) !== null) {
      keys.add(`${m[1].toLowerCase()}:${m[2]}`)
    }

    // determine 스텝의 출력 쌍 — 등장 순서로 짝짓는다.
    const agents: string[] = []
    const tasks: string[] = []
    ECHO_AGENT.lastIndex = 0
    ECHO_TASK.lastIndex = 0
    while ((m = ECHO_AGENT.exec(content)) !== null) agents.push(m[1].toLowerCase())
    while ((m = ECHO_TASK.exec(content)) !== null) tasks.push(m[1])
    for (let i = 0; i < Math.min(agents.length, tasks.length); i++) {
      keys.add(`${agents[i]}:${tasks[i]}`)
    }
  }
  return keys
}

function resolveSourcePath(importPath: string): string {
  // Convert relative import like '../cmo/band-manager.js' to absolute .ts path
  const tsPath = importPath.replace(/\.js$/, '.ts')
  return resolve(join(ROOT, 'agents/cron'), tsPath)
}

export function hasExemptComment(filePath: string): 'dispatch' | 'local' | null {
  try {
    const src = readFileSync(filePath, 'utf-8')
    if (EXEMPT_DISPATCH.test(src)) return 'dispatch'
    if (EXEMPT_LOCAL.test(src)) return 'local'
  } catch { /* file not found */ }
  return null
}

export function checkLaunchdOrphans(): LaunchdOrphan[] {
  const plistDir = resolve(ROOT, 'launchd')
  const SKIP_PATTERNS = [/^node$/, /^npx$/, /^tsx$/, /\/bin\//, /\.log$/, /^[a-z-]+$/]
  const orphans: LaunchdOrphan[] = []

  let plistFiles: string[]
  try {
    plistFiles = readdirSync(plistDir).filter(f => f.endsWith('.plist'))
  } catch { return orphans }

  for (const plistFile of plistFiles) {
    const content = readFileSync(resolve(plistDir, plistFile), 'utf-8')
    const args = [...content.matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1])
    for (const arg of args) {
      if (SKIP_PATTERNS.some(p => p.test(arg))) continue
      if (!arg.startsWith(ROOT)) continue
      if (/\.(ts|js|mjs|sh)$/.test(arg) && !existsSync(arg)) {
        orphans.push({ plist: plistFile, missingFile: arg })
      }
    }
  }
  return orphans
}

export function buildReport(): Report {
  const handlers = extractHandlers()
  const workflowKeys = extractWorkflowKeys()

  const orphaned: string[] = []
  const dispatchOnly: string[] = []
  const localOnly: string[] = []
  const unlinkedWithoutReason: string[] = []

  for (const { key, importPath } of handlers) {
    if (workflowKeys.has(key)) continue
    orphaned.push(key)
    const srcPath = resolveSourcePath(importPath)
    const exempt = hasExemptComment(srcPath)
    if (exempt === 'dispatch') dispatchOnly.push(key)
    else if (exempt === 'local') localOnly.push(key)
    else unlinkedWithoutReason.push(key)
  }

  const launchdOrphans = checkLaunchdOrphans()

  return {
    total: handlers.length,
    linked: handlers.length - orphaned.length,
    orphaned,
    dispatchOnly,
    localOnly,
    unlinkedWithoutReason,
    launchdOrphans,
  }
}

function main() {
  const report = buildReport()
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.unlinkedWithoutReason.length > 0 || report.launchdOrphans.length > 0 ? 1 : 0)
}

// 테스트가 import 할 때 실행·exit 되지 않도록 직접 실행일 때만 돈다.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
