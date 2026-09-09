import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 어드민 E2E 의 false-green·production write 회귀 방지선 — R6, 2026-09-09.
 *
 * 두 결함이 함께 있었다.
 *
 * ① **false-green**: `e2e-admin` job 은 자격증명이 없으면 `exit 0` 으로 넘어갔다.
 *    그 자격증명은 등록된 적이 없어서, 어드민 E2E 는 한 번도 실행되지 않은 채
 *    job 만 계속 success 였다 — 어드민을 건드리는 PR 이 무검증으로 초록불이었다.
 * ② **production write**: `e2e/08-admin-service-sync.spec.ts` 가 어드민으로 로그인해
 *    게시글 숨김·삭제·핀·일괄삭제를 수행했다. 이 파일은 `qa-admin` 이 아니라
 *    `chromium` project 에 잡히고, `e2e-smoke` job 은 `E2E_BASE_URL` 을 실서비스 도메인으로
 *    둔 채 **변경된 spec 을 그대로 돌린다.** 이 파일을 고치는 PR 은 실서비스 글을 지울 수 있었다.
 *
 * 어드민 E2E 는 격리된 staging 과 전용 테스트 계정에서만 켠다. 그 계약을 여기서 고정한다.
 *
 * YAML 은 파싱하지 않고 `scripts/check-cron-links.ts` 와 같은 줄 단위로 읽는다 —
 * js-yaml 은 이 저장소의 직접 의존이 아니다.
 */

const ROOT = join(__dirname, '../..')
const PRODUCTION_HOST_RE = /(^|[^a-z0-9.-])(www\.)?age-doesnt-matter\.com/

const ciLines = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf-8').split('\n')

/** `  e2e-admin:` 부터 다음 job(들여쓰기 2칸 키)까지를 잘라낸다. */
function jobBlock(name: string): string[] {
  const start = ciLines.findIndex((l) => l === `  ${name}:`)
  if (start === -1) throw new Error(`ci.yml 에 ${name} job 이 없다`)
  let end = ciLines.length
  for (let i = start + 1; i < ciLines.length; i++) {
    if (/^ {2}[A-Za-z0-9_-]+:/.test(ciLines[i])) {
      end = i
      break
    }
  }
  return ciLines.slice(start, end)
}

const adminBlock = jobBlock('e2e-admin')
/** 주석을 뺀 실제 설정 줄만 — 설명문에 적힌 도메인·`exit 0` 을 결함으로 오인하지 않는다. */
const adminConfig = adminBlock.filter((l) => !/^\s*#/.test(l))
const adminConfigText = adminConfig.join('\n')

describe('qa-admin job 은 production 을 대상으로 하지 않는다', () => {
  it('env 값으로 실서비스 도메인을 지정하지 않는다', () => {
    const hits = adminConfig.filter(
      (l) => /^\s{8,}[A-Za-z0-9_]+:\s*\S/.test(l) && PRODUCTION_HOST_RE.test(l),
    )
    expect(hits, 'production URL 이 어드민 E2E 대상으로 다시 박혔다').toEqual([])
  })

  it('테스트 URL 은 E2E_ADMIN_BASE_URL repository variable 에서 온다', () => {
    const baseUrls = adminConfig.filter((l) => /^\s+E2E_BASE_URL:/.test(l))
    expect(baseUrls.length, 'Admin E2E 스텝에 E2E_BASE_URL 이 없다').toBeGreaterThan(0)
    for (const line of baseUrls) {
      expect(line, 'staging URL 은 vars.E2E_ADMIN_BASE_URL 로만 주입한다').toContain('vars.E2E_ADMIN_BASE_URL')
    }
  })

  it('production 도메인이 지정되면 테스트 전에 실패시킨다', () => {
    for (const host of ['age-doesnt-matter.com', 'www.age-doesnt-matter.com']) {
      expect(adminConfigText, `${host} 를 거르는 가드가 사라졌다`).toContain(host)
    }
    expect(adminConfigText, '도메인 가드가 실패로 끝나지 않는다').toMatch(/^\s*exit 1\s*$/m)
  })

  it('가드가 playwright 실행보다 앞선다', () => {
    const guardAt = adminConfig.findIndex((l) => PRODUCTION_HOST_RE.test(l))
    const runAt = adminConfig.findIndex((l) => l.includes('--project=qa-admin'))
    expect(guardAt, '도메인 가드를 찾지 못했다').toBeGreaterThan(-1)
    expect(runAt, 'qa-admin 실행 스텝을 찾지 못했다').toBeGreaterThan(-1)
    expect(guardAt, '가드가 테스트 실행 뒤에 있으면 막지 못한다').toBeLessThan(runAt)
  })
})

describe('자격증명 누락을 success 로 처리하지 않는다', () => {
  it('job 어느 스텝에도 exit 0 이 없다', () => {
    const hits = adminConfig.filter((l) => /^\s*exit 0\s*$/.test(l))
    expect(hits, '자격증명이 없을 때 exit 0 으로 넘기는 분기가 되살아났다').toEqual([])
  })

  it('자격증명이 비면 exit 1 이다', () => {
    expect(adminConfigText, '빈 자격증명 분기가 없다').toMatch(/-z\s+"\$\{?E2E_ADMIN_(EMAIL|PASSWORD)/)
    expect(adminConfigText).toMatch(/^\s*exit 1\s*$/m)
  })
})

describe('E2E_ADMIN_ENABLED 없이는 job 자체가 돌지 않는다', () => {
  it('job-level if 가 vars.E2E_ADMIN_ENABLED 를 요구한다', () => {
    const ifLine = adminConfig.find((l) => /^\s{4}if:/.test(l))
    expect(ifLine, 'job-level if 가 없다').toBeDefined()
    expect(ifLine, 'job-level 활성화 스위치가 사라졌다 — 기본이 skipped 여야 한다').toContain(
      "vars.E2E_ADMIN_ENABLED == 'true'",
    )
  })
})

describe('production 어드민 대상 write E2E 가 없다', () => {
  it('e2e/08-admin-service-sync.spec.ts 는 존재하지 않는다', () => {
    expect(
      existsSync(join(ROOT, 'e2e/08-admin-service-sync.spec.ts')),
      '운영 게시글을 숨기고 지우는 레거시 spec 이 되살아났다',
    ).toBe(false)
  })

  it('top-level e2e/*.spec.ts 는 어드민 자격증명을 쓰지 않는다', () => {
    // e2e/qa/** 만 qa-admin project 대상이다. top-level spec 은 chromium project 에 잡히고
    // e2e-smoke job 이 실서비스 도메인을 향해 돌리므로, 여기서 어드민 로그인을 하면 안 된다.
    const hits = readdirSync(join(ROOT, 'e2e'))
      .filter((f) => f.endsWith('.spec.ts'))
      .filter((f) => /E2E_ADMIN_(EMAIL|PASSWORD)/.test(readFileSync(join(ROOT, 'e2e', f), 'utf-8')))
    expect(hits, 'top-level spec 이 어드민으로 로그인한다 — e2e/qa/ 로 옮기고 qa-admin 에서만 돌려라').toEqual([])
  })
})
