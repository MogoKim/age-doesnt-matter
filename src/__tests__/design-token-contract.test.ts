/**
 * 디자인 토큰 **계약** 테스트.
 *
 * 값의 정본은 `src/app/globals.css`, 사용 규칙의 정본은 `src/lib/design-tokens.ts` 다.
 * 둘이 어긋나거나, 화면 코드가 규칙을 어기면 여기서 잡는다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────
 *  2026-09-15 진단: 토큰 112개 중 tailwind 에 노출된 건 37개뿐이었고,
 *  `#FF6F61`(= `--primary`)이 globals.css 밖에서 86회 하드코딩돼 있었다.
 *  토큰이 없어서가 아니라 **계약이 코드에 없어서** 생긴 일이다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HSL_TRIPLET_TOKENS, LITERAL_VALUE_TOKENS, REFERENCE_TOKENS,
  RESERVED_TOKENS, CONTROL_HEIGHT, NO_CSS_VAR_CONTEXTS, TOUCH_RULE_SCOPE,
} from '@/lib/design-tokens'

const read = (f: string) => readFileSync(resolve(process.cwd(), f), 'utf8')
const CSS = read('src/app/globals.css')
const TW = read('tailwind.config.ts')

/** `:root` 블록의 토큰 이름 → 값 */
function rootTokens(): Map<string, string> {
  const start = CSS.indexOf('  :root {')
  const body = CSS.slice(start, CSS.indexOf('\n  }', start))
  const out = new Map<string, string>()
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim())
  return out
}
const TOKENS = rootTokens()

function sourceFiles(dir: string): string[] {
  return readdirSync(resolve(process.cwd(), dir)).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(resolve(process.cwd(), full)).isDirectory()) {
      return ['generated', '__tests__', 'node_modules'].includes(name) ? [] : sourceFiles(full)
    }
    return /\.tsx?$/.test(name) ? [full] : []
  })
}
const SRC = sourceFiles('src')
// `design-tokens.ts` 는 토큰 **이름을 나열하는** 계약 정본이라 사용처 스캔에서 뺀다.
const CONTRACT_FILE = 'src/lib/design-tokens.ts'
const BODY = new Map(SRC.filter((f) => f !== CONTRACT_FILE).map((f) => [f, read(f)]))

describe('토큰 값과 계약이 일치한다', () => {
  it('HSL triplet 으로 선언된 토큰만 HSL_TRIPLET_TOKENS 에 있다', () => {
    for (const t of HSL_TRIPLET_TOKENS) {
      const v = TOKENS.get(t)
      expect(v, `${t} 가 globals.css 에 없다`).toBeDefined()
      expect(v, `${t} = ${v} 는 HSL triplet 이 아니다`).toMatch(/^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/)
    }
  })

  it('완성값 토큰은 HSL triplet 이 아니다', () => {
    for (const t of LITERAL_VALUE_TOKENS) {
      const v = TOKENS.get(t)
      expect(v, `${t} 가 globals.css 에 없다`).toBeDefined()
      expect(v, `${t} = ${v} 는 triplet 처럼 보인다`).not.toMatch(/^\d+ \d+% \d+%$/)
    }
  })

  it('🔴 Tailwind 는 HSL 토큰만 `hsl(var(--x))` 로 감싼다', () => {
    for (const m of TW.matchAll(/hsl\(var\((--[a-z0-9-]+)\)\)/g)) {
      expect(HSL_TRIPLET_TOKENS as readonly string[], `${m[1]} 을 hsl() 로 감쌌다`).toContain(m[1])
    }
  })

  it('🔴 Tailwind 가 완성값 토큰을 `hsl()` 없이 쓴다', () => {
    for (const t of ['--radius-full', '--elevation-1', '--control-h-touch', '--content-max']) {
      expect(TW, `${t} 가 tailwind 에 없다`).toContain(`var(${t})`)
      expect(TW).not.toContain(`hsl(var(${t}))`)
    }
  })

  it('밀도 상수가 CSS 토큰과 같다', () => {
    const px = (t: string) => Number((TOKENS.get(t) ?? '').replace('px', ''))
    expect(CONTROL_HEIGHT.touch).toBe(px('--control-h-touch'))
    expect(CONTROL_HEIGHT.desktop).toBe(px('--control-h-desktop'))
    expect(CONTROL_HEIGHT.compact).toBe(px('--control-h-compact'))
  })

  it('터치 규칙의 적용 범위는 공개면이다 — admin 에 강제하지 않는다', () => {
    expect(TOUCH_RULE_SCOPE).toBe('public')
  })
})

describe('🔴 system 토큰이 표기 계약에서 빠지지 않는다 — 전수 검증', () => {
  // state 토큰 3개가 `LITERAL_VALUE_TOKENS` 에서 통째로 빠져 있었다(2026-09-15).
  // 계약에 없으면 "이건 hsl() 로 감싸야 하나" 를 아무도 판정할 수 없다.
  const declared = new Set<string>([...HSL_TRIPLET_TOKENS, ...LITERAL_VALUE_TOKENS])

  /** component 계층(색 세트·아이콘·등급 등)은 전부 완성값이라 개별 나열하지 않는다. */
  const COMPONENT_PREFIXES = ['--icon-', '--cat-', '--grade-', '--hero-', '--gradient-', '--surface-', '--border-coral']

  it.each(['--control-h-', '--state-', '--elevation-', '--content-max', '--space-', '--radius', '--text-', '--font-family'])(
    '%s 계열 system 토큰이 전부 계약에 있다',
    (prefix) => {
      const missing = [...TOKENS.keys()].filter(
        (t) => t.startsWith(prefix) && !declared.has(t) && !COMPONENT_PREFIXES.some((c) => t.startsWith(c)),
      )
      // 타이포·폰트는 길이/문자열이라 색 표기 계약 대상이 아니다 — 예외를 명시적으로 적는다.
      const TYPO_EXEMPT = prefix === '--text-' || prefix === '--font-family'
      if (TYPO_EXEMPT) return
      expect(missing, `계약에 없는 토큰: ${missing.join(', ')}`).toEqual([])
    },
  )

  it('계약에 적힌 토큰은 전부 globals.css 에 실재한다 — 죽은 계약 금지', () => {
    const ghosts = [...declared].filter((t) => !TOKENS.has(t))
    expect(ghosts, `globals.css 에 없는 토큰: ${ghosts.join(', ')}`).toEqual([])
  })
})

describe('화면 코드가 표기 계약을 지킨다', () => {
  it('🔴 HSL 토큰을 `hsl()` 없이 쓰지 않는다 — 그러면 색이 안 나온다', () => {
    const bad: string[] = []
    for (const [f, t] of BODY) {
      for (const tok of HSL_TRIPLET_TOKENS) {
        // `var(--primary)` 가 `hsl(var(--primary))` 안이 아닌 채로 나오면 위반
        const re = new RegExp(`(?<!hsl\\()var\\(${tok}\\)`, 'g')
        if (re.test(t)) bad.push(`${f}: var(${tok})`)
      }
    }
    expect(bad, `HSL 토큰을 hsl() 없이 사용:\n${bad.join('\n')}`).toEqual([])
  })

  it('🔴 완성값 토큰을 `hsl()` 로 감싸지 않는다 — 감싸면 무효다', () => {
    const bad: string[] = []
    for (const [f, t] of BODY) {
      for (const tok of LITERAL_VALUE_TOKENS) {
        if (t.includes(`hsl(var(${tok}))`)) bad.push(`${f}: hsl(var(${tok}))`)
      }
    }
    expect(bad, bad.join('\n')).toEqual([])
  })

  it('🔴 reference 토큰을 화면 코드가 직접 쓰지 않는다', () => {
    // reference 는 원자값이다. 화면은 system/component 를 통해 써야 색 역할이 유지된다.
    const bad: string[] = []
    for (const [f, t] of BODY) {
      for (const tok of REFERENCE_TOKENS) {
        if (t.includes(`var(${tok})`)) bad.push(`${f}: var(${tok})`)
      }
    }
    expect(bad, `reference 토큰 직접 사용:\n${bad.join('\n')}`).toEqual([])
  })
})

describe('죽은 토큰이 없다', () => {
  it('🔴 참조 0 토큰은 RESERVED 로 선언된 것뿐이다', () => {
    const exposed = new Set([...TW.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))
    // 🔴 토큰은 `var(--x)` 로만 참조되지 않는다. `IconMenu` 는 이름을 **문자열로** 들고 다니며
    //    런타임에 `var()` 를 만든다(`strokeVar: '--icon-best-stroke'`).
    //    한 형태만 세면 멀쩡히 쓰는 토큰을 "참조 0" 으로 오판한다 — 1차 진단이 실제로 그렇게 틀렸다.
    const used = new Set<string>()
    for (const [, t] of BODY) {
      for (const m of t.matchAll(/var\((--[a-z0-9-]+)\)/g)) used.add(m[1])
      for (const m of t.matchAll(/['"`](--[a-z0-9-]+)['"`]/g)) used.add(m[1])
    }
    // globals.css 자체의 유틸리티·키프레임에서 쓰는 것도 사용으로 친다
    const afterRoot = CSS.slice(CSS.indexOf('\n  }', CSS.indexOf('  :root {')))
    for (const m of afterRoot.matchAll(/var\((--[a-z0-9-]+)\)/g)) used.add(m[1])

    const orphan = [...TOKENS.keys()].filter(
      (t) => !exposed.has(t) && !used.has(t) && !(RESERVED_TOKENS as readonly string[]).includes(t),
    )
    expect(orphan, `참조 0인데 RESERVED 도 아닌 토큰:\n${orphan.join('\n')}`).toEqual([])
  })

  it('🔴 문자열 레지스트리 참조를 사용으로 센다 — IconMenu 형태', () => {
    // 이 형태를 놓치면 IconMenu 가 쓰는 14개 토큰이 통째로 "죽은 토큰" 으로 잡힌다.
    const menu = read('src/components/layouts/IconMenu.tsx')
    expect(menu).toMatch(/strokeVar: '--icon-[a-z0-9-]+'/)
    for (const t of ['--icon-meno-stroke', '--icon-life2-bg', '--cat-job-text']) {
      expect(menu, `${t} 가 IconMenu 에 없다`).toContain(t)
      expect(RESERVED_TOKENS as readonly string[], `${t} 는 사용 중이라 RESERVED 가 아니다`).not.toContain(t)
    }
  })

  it('RESERVED 토큰은 실제로 globals.css 에 있다 — 죽은 예약 금지', () => {
    for (const t of RESERVED_TOKENS) expect(TOKENS.has(t), `${t} 가 없다`).toBe(true)
  })
})

describe('CSS 변수를 못 쓰는 문맥이 문서화돼 있다', () => {
  it('OG·외부 브랜드가 사유와 함께 분류돼 있다', () => {
    const ids = NO_CSS_VAR_CONTEXTS.map((c) => c.id)
    expect(ids).toContain('og-satori')
    expect(ids).toContain('external-brand')
    for (const c of NO_CSS_VAR_CONTEXTS) expect(c.reason.length, c.id).toBeGreaterThan(10)
  })

  it('🔴 근거 없는 예외를 두지 않는다 — `icons/` 전체 예외는 제거했다', () => {
    // `src/components/icons/` 에 하드코딩 색이 **0건**이라 예외를 둘 이유가 없었다.
    // 근거 없는 예외는 나중에 진짜 위반을 숨긴다.
    expect(NO_CSS_VAR_CONTEXTS.map((c) => c.id)).not.toContain('svg-attribute')
    const iconFiles = SRC.filter((f) => f.startsWith('src/components/icons/'))
    const hardcoded = iconFiles.filter((f) => /(?:fill|stroke)="#[0-9a-fA-F]{6}"/.test(read(f)))
    expect(hardcoded, `icons/ 에 하드코딩 색이 생겼다: ${hardcoded.join(', ')}`).toEqual([])
  })

  it('OG 이미지 파일이 실제로 존재한다 — 죽은 예외 금지', () => {
    expect(SRC.some((f) => f.includes('opengraph-image'))).toBe(true)
  })
})
