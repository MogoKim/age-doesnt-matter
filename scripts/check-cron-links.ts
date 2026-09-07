#!/usr/bin/env tsx
/**
 * Cron Link Checker — runner.ts HANDLERS ↔ GitHub Actions 워크플로우 연결 검증
 * 사용법: npx tsx scripts/check-cron-links.ts
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import ts from 'typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const RUNNER_PATH = join(ROOT, 'agents/cron/runner.ts')
const WORKFLOWS_DIR = join(ROOT, '.github/workflows')

/**
 * 핸들러 키에 쓰이는 문자 범위.
 *
 * 이 제한이 파서의 방어선이다. `\S+` 로 받으면 한국어 산문·`${{ ... }}` 템플릿·
 * `$INPUT_AGENT` 같은 셸 변수까지 키로 둔갑한다. 실제로
 * `- name: Run Content Curator (45분 간격 5건 — runner.ts 25분 중복 방지 내장)`
 * 이 `25분:중복` 이라는 키를 만들었다.
 */
const KEY_TOKEN = '[a-z0-9:_-]+'

/**
 * 워크플로우에서 핸들러 키를 뽑는 패턴.
 *
 * `CRON_LINK_ANNOTATION` 은 주석인데도 연결로 **인정한다**. 워크플로우가
 * `runner.ts community ${{ steps.determine.outputs.task }}` 처럼 task 를 런타임에
 * 정하면 정적 스캔으로는 키를 알 수 없어서, 저장소가 쓰는 기존 규약이다.
 * 그 외 주석 줄은 전부 버린다 — 예전에는 주석 처리된 `echo "agent=..."` 를 세는 바람에
 * launchd 로 이관해 GHA 를 껐는데도 "연결됨"으로 나왔다(cafe_crawler:magazine-generate).
 *
 * `RUNNER_CALL` 은 **실제 셸 실행 형식만** 인정한다 — `tsx <경로>runner.ts a b`.
 * `runner.ts` 라는 글자만 찾으면 그 이름을 언급하는 YAML `name:` 설명문까지 걸린다.
 * 동적 인자(`${{ ... }}`)는 KEY_TOKEN 에 걸러지고, 그런 워크플로우는 위 규약으로 고정한다.
 */
const CRON_LINK_ANNOTATION = new RegExp(`^\\s*#\\s*cron-link-check:\\s*runner\\.ts\\s+(${KEY_TOKEN})\\s+(${KEY_TOKEN})`, 'i')
const RUNNER_CALL = new RegExp(`tsx\\s+\\S*runner\\.ts\\s+(${KEY_TOKEN})\\s+(${KEY_TOKEN})`, 'gi')
const ECHO_AGENT = new RegExp(`echo\\s+["']agent=(${KEY_TOKEN})["']`, 'gi')
const ECHO_TASK = new RegExp(`echo\\s+["']task=(${KEY_TOKEN})["']`, 'gi')

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
  /** 워크플로우가 부르는데 runner 에 없는 키 — 실행되면 즉시 exit 1 로 죽는다 */
  workflowWithoutHandler: string[]
  launchdOrphans: LaunchdOrphan[]
}

/**
 * 워크플로우가 쓰지만 핸들러가 아닌 예약값.
 *
 * determine 스텝이 "이번 시각엔 아무것도 실행하지 않는다"를 표현할 때 쓴다
 * (`echo "agent=skip"; echo "task=skip"`). runner 로 넘어가지 않으므로 핸들러가 없어도 정상이다.
 * 여기 값을 늘려서 역방향 가드를 무력화하지 마라 — 조용한 whitelist 는 가드를 죽인다.
 */
const RESERVED_WORKFLOW_KEYS = new Set(['skip:skip'])

/**
 * `import(...)` 호출의 정적 경로를 찾는다. 초기화식 어디에 있든 상관없다 —
 * `() => import(x)` 도, `() => { ...; return import(x) }` 도 같은 방법으로 잡힌다.
 */
function findStaticImportPath(node: ts.Node): string | null {
  let found: string | null = null
  const walk = (n: ts.Node): void => {
    if (found !== null) return
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0]
      if (arg && ts.isStringLiteralLike(arg)) {
        found = arg.text
        return
      }
    }
    ts.forEachChild(n, walk)
  }
  walk(node)
  return found
}

/**
 * runner.ts 의 HANDLERS 객체에서 핸들러를 읽는다.
 *
 * 정규식이 아니라 **AST** 로 읽는다. 예전에는 `'키': () => import(` 라는 글자 모양을
 * 찾았는데, 블록 바디로 등록된 핸들러(`() => { ...; return import(x) }`)가 통째로
 * 안 보였다 — linked 도 orphaned 도 아닌 채 집계에서 빠졌다.
 * `community:dawn-sheet-scrape` 가 그랬고, 그래서 total 이 79 가 아니라 78 이었다.
 * 이 형태로 새 핸들러를 등록하면 크론이 끊겨도 가드가 침묵한다.
 *
 * AST 로 읽으면 주석 속 가짜 핸들러(삭제 기록 등)와 HANDLERS 밖의 객체 키는
 * 애초에 후보에 오르지 않는다.
 */
export function extractHandlers(runnerPath: string = RUNNER_PATH): HandlerInfo[] {
  const src = readFileSync(runnerPath, 'utf-8')
  const sourceFile = ts.createSourceFile(runnerPath, src, ts.ScriptTarget.Latest, true)

  let handlersObject: ts.ObjectLiteralExpression | undefined
  const findHandlers = (node: ts.Node): void => {
    if (
      handlersObject === undefined &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'HANDLERS' &&
      node.initializer
    ) {
      let init: ts.Expression = node.initializer
      // `= { ... } as const` / `satisfies X` 로 감싸도 안쪽을 본다.
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
        init = init.expression
      }
      if (ts.isObjectLiteralExpression(init)) handlersObject = init
    }
    ts.forEachChild(node, findHandlers)
  }
  findHandlers(sourceFile)

  if (!handlersObject) {
    throw new Error(`${runnerPath} 에서 HANDLERS 객체를 찾지 못했다 — 선언이 바뀌었는지 확인하라.`)
  }

  const results: HandlerInfo[] = []
  const withoutStaticImport: string[] = []

  for (const prop of handlersObject.properties) {
    if (!ts.isPropertyAssignment(prop)) continue // spread·shorthand 는 핸들러 등록이 아니다
    const name = prop.name
    let key: string
    if (ts.isStringLiteralLike(name)) key = name.text
    else if (ts.isIdentifier(name)) key = name.text
    else continue // 계산된 키는 정적으로 알 수 없다

    const importPath = findStaticImportPath(prop.initializer)
    if (importPath === null) {
      withoutStaticImport.push(key)
      continue
    }
    results.push({ key, importPath })
  }

  // 조용히 빠뜨리면 그 핸들러는 가드에 영원히 안 보인다. 차라리 멈춘다.
  if (withoutStaticImport.length > 0) {
    throw new Error(
      `정적 import 경로를 찾지 못한 핸들러 ${withoutStaticImport.length}개: ${withoutStaticImport.join(', ')}\n` +
        `동적 경로를 쓰면 면제 주석도 읽을 수 없어 연결 검증이 불가능하다.`,
    )
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

    for (const line of lines) {
      const annotated = CRON_LINK_ANNOTATION.exec(line)
      if (annotated) {
        keys.add(`${annotated[1].toLowerCase()}:${annotated[2]}`)
        continue
      }
      // 줄 전체가 주석이면 버린다. 뒤에 붙은 주석(`... ;; # 중단`)은 앞부분이 살아 있으므로 남긴다.
      if (line.trimStart().startsWith('#')) continue

      let m: RegExpExecArray | null
      RUNNER_CALL.lastIndex = 0
      while ((m = RUNNER_CALL.exec(line)) !== null) {
        keys.add(`${m[1].toLowerCase()}:${m[2]}`)
      }

      // determine 스텝의 출력 쌍 — **같은 줄**에 있을 때만 묶는다.
      // 파일 전체를 배열로 모아 순서로 짝지으면, 서로 다른 step·분기에 흩어진
      // agent 와 task 가 남남끼리 엮여 있지도 않은 조합이 연결로 잡힌다.
      const agents: string[] = []
      const tasks: string[] = []
      ECHO_AGENT.lastIndex = 0
      ECHO_TASK.lastIndex = 0
      while ((m = ECHO_AGENT.exec(line)) !== null) agents.push(m[1].toLowerCase())
      while ((m = ECHO_TASK.exec(line)) !== null) tasks.push(m[1])
      for (let i = 0; i < Math.min(agents.length, tasks.length); i++) {
        keys.add(`${agents[i]}:${tasks[i]}`)
      }
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

  // 역방향 — 워크플로우가 부르는데 runner 에 없는 키. 실행되면 즉시 exit 1 로 죽는다.
  const handlerKeys = new Set(handlers.map((h) => h.key))
  const workflowWithoutHandler = [...workflowKeys]
    .filter((k) => !handlerKeys.has(k) && !RESERVED_WORKFLOW_KEYS.has(k))
    .sort()

  const launchdOrphans = checkLaunchdOrphans()

  return {
    total: handlers.length,
    linked: handlers.length - orphaned.length,
    orphaned,
    dispatchOnly,
    localOnly,
    unlinkedWithoutReason,
    workflowWithoutHandler,
    launchdOrphans,
  }
}

/**
 * CI 를 빨간불로 만들 조건. 이유가 붙은 orphan(dispatch/local)은 실패가 아니다 —
 * 사유 없이 끊긴 것, 부르는데 없는 것, 파일이 사라진 plist 만 실패다.
 */
export function isFailingReport(report: Report): boolean {
  return (
    report.unlinkedWithoutReason.length > 0 ||
    report.workflowWithoutHandler.length > 0 ||
    report.launchdOrphans.length > 0
  )
}

function main() {
  const report = buildReport()
  console.log(JSON.stringify(report, null, 2))
  process.exit(isFailingReport(report) ? 1 : 0)
}

// 테스트가 import 할 때 실행·exit 되지 않도록 직접 실행일 때만 돈다.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
