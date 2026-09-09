import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  BOT_TYPE_HEADER,
  BOT_TYPE_VALUE,
  DEFAULT_FIRST_PARTY_ORIGINS,
  FIRST_PARTY_ENV_KEYS,
  buildFirstPartyOrigins,
  isFirstPartyUrl,
  toOrigin,
} from '../../e2e/fixtures/first-party-origins'

/**
 * E2E first-party 헤더 가드 회귀 테스트.
 *
 * `x-bot-type` 을 전역으로 붙이면 서드파티 광고 iframe 요청까지 실려 CORS preflight 가
 * 거부되고, 광고가 실제로 렌더된 실행에서만 CI 가 실패한다.
 * 반대로 first-party 에서 헤더가 빠지면 EventLog 와 익명 세션이 오염된다 —
 * 이쪽이 더 나쁘다. 두 방향을 광고 fill 여부와 무관하게 여기서 고정한다.
 */

const THIRD_PARTY_URLS = [
  'https://ads-partners.coupang.com/g.js',
  'https://static.cloudflareinsights.com/beacon.min.js',
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://www.googletagmanager.com/gtm.js',
  'https://age-doesnt-matter.com.evil.example/steal',
]

describe('toOrigin', () => {
  it('URL 을 origin 으로 정규화한다 (경로·쿼리 제거)', () => {
    expect(toOrigin('https://age-doesnt-matter.com/jobs?x=1', 'test')).toBe(
      'https://age-doesnt-matter.com',
    )
  })

  it('포트를 보존한다', () => {
    expect(toOrigin('http://localhost:3000/', 'test')).toBe('http://localhost:3000')
  })

  it('잘못된 URL 은 조용히 무시하지 않고 명확히 실패시킨다', () => {
    expect(() => toOrigin('not-a-url', 'E2E_BASE_URL')).toThrow(/E2E_BASE_URL/)
    expect(() => toOrigin('', 'QA_AUDIT_URL')).toThrow(/QA_AUDIT_URL/)
  })
})

describe('buildFirstPartyOrigins', () => {
  it('환경변수가 없어도 기본 3개를 포함한다', () => {
    const origins = buildFirstPartyOrigins({})
    expect([...origins].sort()).toEqual([
      'http://localhost:3000',
      'https://age-doesnt-matter.com',
      'https://www.age-doesnt-matter.com',
    ])
  })

  it('E2E_BASE_URL · QA_AUDIT_URL · QA_EVENT_URL origin 을 추가한다', () => {
    const origins = buildFirstPartyOrigins({
      E2E_BASE_URL: 'https://preview-1.vercel.app/some/path',
      QA_AUDIT_URL: 'https://audit.example.com',
      QA_EVENT_URL: 'https://event.example.com:8443/x',
    })
    expect(origins.has('https://preview-1.vercel.app')).toBe(true)
    expect(origins.has('https://audit.example.com')).toBe(true)
    expect(origins.has('https://event.example.com:8443')).toBe(true)
  })

  it('빈 문자열·미설정 환경변수는 건너뛴다', () => {
    const origins = buildFirstPartyOrigins({ E2E_BASE_URL: '', QA_AUDIT_URL: undefined })
    expect(origins.size).toBe(3)
  })

  it('프로젝트 baseURL 도 포함한다', () => {
    const origins = buildFirstPartyOrigins({}, 'https://project-base.example.com/path')
    expect(origins.has('https://project-base.example.com')).toBe(true)
  })

  it('환경변수가 잘못되면 실패시킨다', () => {
    expect(() => buildFirstPartyOrigins({ QA_AUDIT_URL: 'httpz://broken' })).not.toThrow()
    expect(() => buildFirstPartyOrigins({ QA_AUDIT_URL: '///' })).toThrow(/QA_AUDIT_URL/)
  })

  it('감시 대상 환경변수 목록이 유지된다', () => {
    expect([...FIRST_PARTY_ENV_KEYS]).toEqual(['E2E_BASE_URL', 'QA_AUDIT_URL', 'QA_EVENT_URL'])
    expect([...DEFAULT_FIRST_PARTY_ORIGINS]).toHaveLength(3)
  })
})

describe('isFirstPartyUrl — 헤더 부착 판정', () => {
  const origins = buildFirstPartyOrigins({ E2E_BASE_URL: 'https://age-doesnt-matter.com' })

  it('first-party 요청은 true (헤더 부착 대상)', () => {
    for (const url of [
      'https://age-doesnt-matter.com/',
      'https://age-doesnt-matter.com/api/events',
      'https://www.age-doesnt-matter.com/jobs/abc',
      'http://localhost:3000/community/stories',
    ]) {
      expect(isFirstPartyUrl(url, origins), url).toBe(true)
    }
  })

  it('서드파티 요청은 false (헤더 미부착)', () => {
    for (const url of THIRD_PARTY_URLS) {
      expect(isFirstPartyUrl(url, origins), url).toBe(false)
    }
  })

  it('도메인 접미사 공격을 허용하지 않는다', () => {
    // origin 문자열 완전일치이므로 evil.example 은 통과하지 못한다
    expect(isFirstPartyUrl('https://age-doesnt-matter.com.evil.example/x', origins)).toBe(false)
    expect(isFirstPartyUrl('https://notage-doesnt-matter.com/x', origins)).toBe(false)
  })

  it('스킴이 다르면 다른 origin 이다', () => {
    expect(isFirstPartyUrl('http://age-doesnt-matter.com/', origins)).toBe(false)
  })

  it('파싱 불가 URL 은 서드파티로 본다(fail-closed)', () => {
    for (const url of ['data:text/html,x', 'about:blank', 'blob:xyz', '']) {
      expect(isFirstPartyUrl(url, origins), url).toBe(false)
    }
  })

  it('헤더 이름·값 상수가 유지된다', () => {
    expect(BOT_TYPE_HEADER).toBe('x-bot-type')
    expect(BOT_TYPE_VALUE).toBe('e2e-test')
  })
})

describe('정적 스캔 — raw @playwright/test import 우회 차단', () => {
  /** ESLint 설정이 되돌려져도 여기서 잡힌다 */
  const ALLOWED = new Set([
    'e2e/fixtures/first-party-header.ts',
    'e2e/export-kakao-cookies.ts',
  ])

  function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full, acc)
      else if (full.endsWith('.ts')) acc.push(full)
    }
    return acc
  }

  const files = walk('e2e')

  it('e2e 파일을 실제로 스캔한다 (0개면 스캔 자체가 깨진 것)', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('허용 파일 외에는 raw @playwright/test 런타임 import 가 없다', () => {
    const offenders: string[] = []
    for (const f of files) {
      if (ALLOWED.has(f)) continue
      const src = readFileSync(f, 'utf8')
      // `import type { ... } from '@playwright/test'` 는 런타임 코드가 없어 우회 경로가 아니다
      const runtimeImport = /^\s*import\s+(?!type\s)[^;]*from\s+'@playwright\/test'/m
      if (runtimeImport.test(src)) offenders.push(f)
    }
    expect(offenders, `raw import 발견: ${offenders.join(', ')}`).toEqual([])
  })

  it('spec 은 공용 fixture 에서 test 를 가져온다', () => {
    const specs = files.filter((f) => f.endsWith('.spec.ts'))
    expect(specs.length).toBeGreaterThan(40)
    const missing = specs.filter((f) => !readFileSync(f, 'utf8').includes('fixtures/first-party-header'))
    expect(missing, `fixture import 누락: ${missing.join(', ')}`).toEqual([])
  })

  it('playwright.config.ts 에 전역 extraHTTPHeaders 가 남아 있지 않다', () => {
    const src = readFileSync('playwright.config.ts', 'utf8')
    expect(src).not.toContain('extraHTTPHeaders')
  })

  it('ESLint 가드가 설정에 존재한다', () => {
    // Next 16 전환(2026-09-09)에서 `.eslintrc.json` → `eslint.config.mjs`(flat config) 로 옮겼다.
    // 형식만 바뀌고 **가드는 그대로**여야 한다 — 여기서 그것을 확인한다.
    const cfg = readFileSync('eslint.config.mjs', 'utf8')

    const block = cfg.slice(cfg.indexOf("files: ['e2e/**/*.ts']"))
    expect(block, 'e2e 전용 블록이 있어야 한다').not.toBe('')
    expect(block).toContain('@typescript-eslint/no-restricted-imports')
    expect(block).toContain("name: '@playwright/test'")

    // e2e/fixtures/** 전체 예외는 금지 — auth.setup.ts 가 그 안에 있다.
    const ignores = /ignores:\s*\[([^\]]*)\]/.exec(block)?.[1] ?? ''
    expect(ignores).toContain('e2e/fixtures/first-party-header.ts')
    expect(ignores).toContain('e2e/export-kakao-cookies.ts')
    expect(ignores, 'fixtures 디렉터리 통째 예외는 가드를 무력화한다').not.toContain('e2e/fixtures/**')
  })

  it('lint:e2e 스크립트가 존재하고 lint 가 이를 호출한다', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['lint:e2e']).toBe('eslint e2e playwright.config.ts --ext .ts')
    expect(pkg.scripts.lint).toContain('lint:e2e')
  })
})
