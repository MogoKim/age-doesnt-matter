import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  buildReport,
  extractHandlers,
  extractWorkflowKeys,
  hasExemptComment,
  isFailingReport,
} from '../../scripts/check-cron-links'

/**
 * R6 P0-7 — cron-links 스캔 범위 회귀 테스트.
 *
 * 이 가드는 "runner.ts 핸들러가 실제로 어떤 워크플로우에 물려 있는가"를 답한다.
 * 답이 틀리는 두 방향 중 **거짓 linked 가 더 나쁘다** — 끊긴 크론이 연결된 것처럼
 * 보이면 아무도 안 고친다. 실제로 `cafe_crawler:magazine-generate` 는 GHA 를 끄고
 * launchd 로 옮겼는데도, 주석 처리된 `echo "agent=..."` 줄을 스캐너가 세는 바람에
 * 계속 linked 로 보고됐다.
 *
 * 반대로 `agents-` 접두어가 없는 워크플로우가 실제로 호출하는 키는,
 * 스캔이 `agents-*.yml` 만 읽어서 orphan 으로 분류됐다.
 *
 * 두 오류가 서로를 가려 총계는 맞아 보였다. 그래서 총계만 보는 테스트로는
 * 부족하고, 아래처럼 **개별 키의 분류**까지 고정한다.
 */

const tmpRoots: string[] = []

function workflowDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cron-links-wf-'))
  tmpRoots.push(dir)
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8')
  }
  return dir
}

function runnerFile(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cron-links-runner-'))
  tmpRoots.push(dir)
  const path = join(dir, 'runner.ts')
  writeFileSync(path, body, 'utf-8')
  return path
}

function sourceFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cron-links-src-'))
  tmpRoots.push(dir)
  const path = join(dir, name)
  writeFileSync(path, content, 'utf-8')
  return path
}

afterAll(() => {
  for (const dir of tmpRoots) rmSync(dir, { recursive: true, force: true })
})

describe('extractWorkflowKeys — 워크플로우에서 키를 뽑는 규칙', () => {
  it('활성 runner.ts 호출을 인식한다', () => {
    const dir = workflowDir({
      'anything.yml': `jobs:\n  run:\n    steps:\n      - run: cd agents && npx tsx cron/runner.ts coo moderator\n`,
    })
    expect([...extractWorkflowKeys(dir)]).toContain('coo:moderator')
  })

  it('파일 이름이 agents- 로 시작하지 않아도 스캔한다', () => {
    // 예전 버전은 `agents-*.yml` 만 읽어서 접두어가 다른 파일을 통째로 놓쳤다.
    const dir = workflowDir({
      'custom-qa.yml': `      - run: npx tsx cron/runner.ts coo moderator\n`,
      'zz-other.yaml': `      - run: npx tsx cron/runner.ts cdo kpi-collector\n`,
    })
    const keys = extractWorkflowKeys(dir)
    expect(keys.has('coo:moderator')).toBe(true)
    expect(keys.has('cdo:kpi-collector'), '.yaml 확장자도 읽어야 한다').toBe(true)
  })

  it('주석 처리된 runner.ts 호출은 연결로 세지 않는다', () => {
    const dir = workflowDir({
      'a.yml': `      # - run: npx tsx cron/runner.ts ceo weekly-report\n`,
    })
    expect(extractWorkflowKeys(dir).has('ceo:weekly-report')).toBe(false)
  })

  it('활성 echo agent/task 쌍을 인식한다', () => {
    const dir = workflowDir({
      'a.yml': `            echo "agent=coo" >> $GITHUB_OUTPUT; echo "task=content-scheduler" >> $GITHUB_OUTPUT ;;\n`,
    })
    expect(extractWorkflowKeys(dir).has('coo:content-scheduler')).toBe(true)
  })

  it('주석 처리된 echo 는 연결로 세지 않는다 — magazine-generate 사고의 원인', () => {
    const dir = workflowDir({
      'a.yml': [
        '              # "0 7 * * *") — launchd 이관 완료, GHA 비활성화',
        '              # echo "agent=cafe_crawler" >> $GITHUB_OUTPUT; echo "task=magazine-generate" >> $GITHUB_OUTPUT ;;',
        '              "11 5 * * *")',
        '                echo "agent=coo" >> $GITHUB_OUTPUT; echo "task=content-scheduler" >> $GITHUB_OUTPUT ;;',
      ].join('\n'),
    })
    const keys = extractWorkflowKeys(dir)
    expect(keys.has('cafe_crawler:magazine-generate')).toBe(false)
    // 주석을 걷어내도 살아 있는 쌍은 그대로 잡혀야 한다(과잉 삭제 방지)
    expect(keys.has('coo:content-scheduler')).toBe(true)
  })

  it('줄 끝에 붙은 주석은 앞부분을 살린다', () => {
    const dir = workflowDir({
      'a.yml': `                echo "agent=ceo" >> $GITHUB_OUTPUT; echo "task=approval-reminder" >> $GITHUB_OUTPUT ;; # 중단 검토중\n`,
    })
    expect(extractWorkflowKeys(dir).has('ceo:approval-reminder')).toBe(true)
  })

  it('`# cron-link-check:` 규약만 주석인데도 연결로 인정한다', () => {
    // task 를 런타임에 정하는 워크플로우는 정적 스캔으로 키를 알 수 없어 이 규약을 쓴다.
    const dir = workflowDir({
      'a.yml': [
        '        # cron-link-check: runner.ts community dawn-sheet-scrape',
        '        # cron-link-check: runner.ts community dawn-sheet-cleanup',
        '        run: cd agents && npx tsx cron/runner.ts community ${{ steps.determine.outputs.task }}',
      ].join('\n'),
    })
    const keys = extractWorkflowKeys(dir)
    expect(keys.has('community:dawn-sheet-scrape')).toBe(true)
    expect(keys.has('community:dawn-sheet-cleanup')).toBe(true)
  })

  it('YAML name: 의 설명문 속 runner.ts 는 키로 뽑지 않는다', () => {
    // 실제 저장소 줄(agents-cafe-hourly-curation.yml:119). `runner.ts` 라는 글자만 찾으면
    // 이 한국어 산문에서 `25분:중복` 이라는 키가 나온다.
    const dir = workflowDir({
      'a.yml': '      - name: Run Content Curator (45분 간격 5건 — runner.ts 25분 중복 방지 내장)\n',
    })
    const keys = extractWorkflowKeys(dir)
    expect(keys.has('25분:중복')).toBe(false)
    expect([...keys]).toEqual([])
  })

  it('셸 실행 형식이 아니면 인정하지 않는다 — tsx 로 실행되는 것만 호출이다', () => {
    const dir = workflowDir({
      'a.yml': [
        '      - name: runner.ts cdo kpi-collector 를 설명하는 문장',
        '        run: cd agents && npx tsx cron/runner.ts coo moderator',
      ].join('\n'),
    })
    const keys = extractWorkflowKeys(dir)
    expect(keys.has('coo:moderator'), '실제 실행은 잡아야 한다').toBe(true)
    expect(keys.has('cdo:kpi-collector'), '설명문은 잡으면 안 된다').toBe(false)
  })

  it('동적 인자는 키로 뽑지 않는다', () => {
    const dir = workflowDir({
      'a.yml': [
        '        run: cd agents && npx tsx cron/runner.ts ${{ steps.determine.outputs.agent }} ${{ steps.determine.outputs.task }}',
        '            echo "agent=$INPUT_AGENT" >> $GITHUB_OUTPUT',
        '            echo "task=$INPUT_TASK" >> $GITHUB_OUTPUT',
      ].join('\n'),
    })
    // 런타임에 정해지는 값이라 정적으로는 알 수 없다. 이런 워크플로우는 cron-link-check 규약으로 고정한다.
    expect([...extractWorkflowKeys(dir)]).toEqual([])
  })

  it('서로 다른 줄에 흩어진 agent/task 는 묶지 않는다', () => {
    // 파일 전체를 배열로 모아 순서로 짝지으면 남남끼리 엮여 없는 조합이 연결로 잡힌다.
    const dir = workflowDir({
      'a.yml': [
        '              "0 1 * * *")',
        '                echo "agent=ceo" >> $GITHUB_OUTPUT ;;',
        '              "0 2 * * *")',
        '                echo "task=kpi-collector" >> $GITHUB_OUTPUT ;;',
      ].join('\n'),
    })
    expect([...extractWorkflowKeys(dir)], 'ceo:kpi-collector 는 존재하지 않는 조합이다').toEqual([])
  })

  it('설명 문장 속 runner.ts 는 키로 뽑지 않는다', () => {
    // push-scheduled.yml 의 안내 주석이 `등록·check-cron-links:대상` 같은 가짜 키를 만들던 문제.
    const dir = workflowDir({
      'push-scheduled.yml':
        '# 순수 HTTP 트리거: agents/ 핸들러가 아니므로 runner.ts 등록·check-cron-links 대상 아님.\n',
    })
    expect([...extractWorkflowKeys(dir)]).toEqual([])
  })
})

describe('hasExemptComment — 크론 미연결이 의도적임을 알리는 표기', () => {
  it('`// DISPATCH ONLY` 줄 주석을 인식한다', () => {
    const p = sourceFile('a.ts', '// DISPATCH ONLY — 수동 실행 전용\nexport {}\n')
    expect(hasExemptComment(p)).toBe('dispatch')
  })

  it('JSDoc 의 ` * LOCAL ONLY` 를 인식한다', () => {
    // magazine-generator.ts 가 이 형태였는데 예전 정규식은 `//` 만 봐서 놓쳤다.
    const p = sourceFile('b.ts', '/**\n * 매거진 생성기\n * LOCAL ONLY — launchd 12:00 KST 실행\n */\nexport {}\n')
    expect(hasExemptComment(p)).toBe('local')
  })

  it('JSDoc 안의 ` * // DISPATCH ONLY` 도 인식한다', () => {
    const p = sourceFile('c.ts', '/**\n * 캠페인 생성\n * // DISPATCH ONLY — 최초 1회 수동 실행\n */\nexport {}\n')
    expect(hasExemptComment(p)).toBe('dispatch')
  })

  it('본문 한가운데 적힌 문장은 면제로 보지 않는다', () => {
    // 아무 데나 적힌 문장이 면제로 둔갑하면 끊긴 크론이 조용히 통과한다.
    const p = sourceFile('d.ts', 'const note = "이 작업은 DISPATCH ONLY 로 운영한다"\nexport { note }\n')
    expect(hasExemptComment(p)).toBeNull()
  })

  it('표기가 없으면 null 이다', () => {
    expect(hasExemptComment(sourceFile('e.ts', 'export {}\n'))).toBeNull()
  })
})

describe('buildReport — 실제 저장소 기준 분류', () => {
  const report = buildReport()

  it('cafe_crawler:magazine-generate 는 localOnly 다 (GHA 비활성 · launchd 이관)', () => {
    expect(report.orphaned).toContain('cafe_crawler:magazine-generate')
    expect(report.localOnly).toContain('cafe_crawler:magazine-generate')
  })

  it('분류 총계를 고정한다', () => {
    expect({
      total: report.total,
      linked: report.linked,
      orphaned: report.orphaned.length,
      dispatchOnly: report.dispatchOnly.length,
      localOnly: report.localOnly.length,
      unlinkedWithoutReason: report.unlinkedWithoutReason.length,
      workflowWithoutHandler: report.workflowWithoutHandler.length,
      launchdOrphans: report.launchdOrphans.length,
    }).toEqual({
      total: 78,
      linked: 45,
      orphaned: 33,
      dispatchOnly: 25,
      localOnly: 8,
      unlinkedWithoutReason: 0,
      workflowWithoutHandler: 0,
      launchdOrphans: 0,
    })
  })

  it('orphan 은 전부 사유가 붙어 있다 — 사유 없는 orphan 이 곧 CI 실패다', () => {
    expect(report.dispatchOnly.length + report.localOnly.length + report.unlinkedWithoutReason.length)
      .toBe(report.orphaned.length)
    expect(report.unlinkedWithoutReason, '사유 없는 orphan').toEqual([])
  })
})

describe('extractHandlers — AST 로 HANDLERS 를 읽는다', () => {
  it('한 줄 `() => import(...)` 을 읽는다', () => {
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:morning-cycle': () => import('../ceo/morning-cycle.js').then(() => {}),
}
`)
    expect(extractHandlers(p)).toEqual([{ key: 'ceo:morning-cycle', importPath: '../ceo/morning-cycle.js' }])
  })

  it('블록 바디 `() => { ... return import(...) }` 도 읽는다', () => {
    // 정규식 시절 통째로 안 보이던 형태. 이걸 놓치면 크론이 끊겨도 가드가 침묵한다.
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  'community:dawn-sheet-scrape': () => { if (!process.env.MODE) process.env.MODE = 'dawn'; return import('../community/sheet-scraper.js').then(m => m.main()) },
}
`)
    expect(extractHandlers(p)).toEqual([
      { key: 'community:dawn-sheet-scrape', importPath: '../community/sheet-scraper.js' },
    ])
  })

  it('주석 속 가짜 핸들러는 읽지 않는다', () => {
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  // 'cmo:knowledge-responder': () => import('../cmo/knowledge.js').then(() => {}),  삭제됨 2026-05-15
  /* 'cmo:card-news': () => import('../cmo/card.js').then(() => {}), */
  'cmo:seo-optimizer': () => import('../cmo/seo-optimizer.js').then(() => {}),
}
`)
    expect(extractHandlers(p).map((h) => h.key)).toEqual(['cmo:seo-optimizer'])
  })

  it('HANDLERS 밖의 객체 키는 읽지 않는다', () => {
    const p = runnerFile(`const OTHER = { 'fake:key': () => import('./nope.js') }
const HANDLERS: Record<string, () => Promise<void>> = {
  'qa:content-audit': () => import('../qa/content-audit.js').then(() => {}),
}
const ALSO_NOT = { 'another:key': () => import('./nope2.js') }
`)
    expect(extractHandlers(p).map((h) => h.key)).toEqual(['qa:content-audit'])
  })

  it('정적 import 경로가 없으면 조용히 빠뜨리지 않고 실패한다', () => {
    // 조용히 넘기면 그 핸들러는 가드에 영원히 안 보인다.
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:ok': () => import('../ceo/ok.js').then(() => {}),
  'ceo:dynamic': () => import(process.env.MOD_PATH!).then(() => {}),
}
`)
    expect(() => extractHandlers(p)).toThrow(/ceo:dynamic/)
  })

  it('spread 는 조용히 누락되지 않고 실패한다', () => {
    // 넘겨 버리면 런타임에는 등록됐는데 가드에는 안 보이는 핸들러가 생긴다.
    const p = runnerFile(`const EXTRA = { 'ceo:extra': () => import('../ceo/extra.js') }
const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:ok': () => import('../ceo/ok.js').then(() => {}),
  ...EXTRA,
}
`)
    expect(() => extractHandlers(p)).toThrow(/SpreadAssignment/)
  })

  it('shorthand 는 실패한다', () => {
    const p = runnerFile(`const handler = () => import('../ceo/x.js')
const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:ok': () => import('../ceo/ok.js').then(() => {}),
  handler,
}
`)
    expect(() => extractHandlers(p)).toThrow(/ShorthandPropertyAssignment/)
  })

  it('메서드 선언은 실패한다', () => {
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:ok': () => import('../ceo/ok.js').then(() => {}),
  async 'ceo:method'() { await import('../ceo/method.js') },
}
`)
    expect(() => extractHandlers(p)).toThrow(/MethodDeclaration/)
  })

  it('동적 계산 키는 실패한다', () => {
    const p = runnerFile(`const NAME = 'ceo:dynamic'
const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:ok': () => import('../ceo/ok.js').then(() => {}),
  [NAME]: () => import('../ceo/dynamic.js').then(() => {}),
}
`)
    expect(() => extractHandlers(p)).toThrow(/확정할 수 없는 계산된 키/)
  })

  it('정적 문자열 계산 키는 읽는다', () => {
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  ['cmo:test']: () => import('../cmo/test.js').then(() => {}),
}
`)
    expect(extractHandlers(p)).toEqual([{ key: 'cmo:test', importPath: '../cmo/test.js' }])
  })

  it('중복 키는 실패한다 — 런타임은 뒤엣것만 쓴다', () => {
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:dup': () => import('../ceo/first.js').then(() => {}),
  'ceo:dup': () => import('../ceo/second.js').then(() => {}),
}
`)
    expect(() => extractHandlers(p)).toThrow(/중복/)
  })

  it('오류 메시지에 파일과 줄 번호가 들어간다', () => {
    const p = runnerFile(`const HANDLERS: Record<string, () => Promise<void>> = {
  'ceo:ok': () => import('../ceo/ok.js').then(() => {}),
  ...OTHER,
}
`)
    expect(() => extractHandlers(p)).toThrow(/runner\.ts:3/)
  })

  it('HANDLERS 선언이 없으면 실패한다', () => {
    expect(() => extractHandlers(runnerFile('export const NOTHING = {}\n'))).toThrow(/HANDLERS/)
  })

  it('실제 runner.ts 를 읽으면 78개이고 dawn-sheet-scrape 가 들어 있다', () => {
    const handlers = extractHandlers()
    expect(handlers).toHaveLength(78)
    expect(handlers.map((h) => h.key)).toContain('community:dawn-sheet-scrape')
  })
})

describe('workflowWithoutHandler — 역방향 가드', () => {
  it('실제 저장소에는 없다', () => {
    expect(buildReport().workflowWithoutHandler).toEqual([])
  })

  it('`skip:skip` 은 예약값이라 걸리지 않는다', () => {
    // determine 스텝이 "이번엔 실행 안 함"을 표현하는 값. runner 로 넘어가지 않는다.
    const keys = extractWorkflowKeys()
    expect(keys.has('skip:skip'), '워크플로우는 실제로 이 값을 쓴다').toBe(true)
    expect(buildReport().workflowWithoutHandler).not.toContain('skip:skip')
  })

  it('부르는데 없는 키가 있으면 실패로 판정한다', () => {
    const report = { ...buildReport(), workflowWithoutHandler: ['cmo:knowledge-responder'] }
    expect(isFailingReport(report)).toBe(true)
  })

  it('사유 붙은 orphan 만으로는 실패하지 않는다', () => {
    const report = buildReport()
    expect(report.orphaned.length).toBeGreaterThan(0)
    expect(isFailingReport(report), '현재 저장소는 통과 상태여야 한다').toBe(false)
  })
})

