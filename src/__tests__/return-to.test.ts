import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildReturnTo } from '@/lib/return-to'

/**
 * 로그인·온보딩으로 보낼 때 "원래 가려던 곳"이 쿼리째 살아남아야 한다.
 *
 * 회귀 이력: middleware가 pathname만 넘겨서 /community/write?board=stories로 가려던 사람이
 * 로그인 뒤 board 없는 글쓰기 폼으로 떨어졌다. 폼은 board가 없으면 안내 없이 첫 게시판을 고른다.
 * 신규 가입자는 온보딩을 한 번 더 거쳐서, 로그인 단계에서 살려도 거기서 다시 잃었다.
 *
 * 동시에, 되돌아갈 주소는 그대로 브라우저 이동에 쓰이므로 외부로 나갈 수 있으면 안 된다.
 */

const root = join(__dirname, '../..')
const read = (p: string) => readFileSync(join(root, p), 'utf-8')

describe('buildReturnTo — 쿼리 보존', () => {
  it('쿼리가 없으면 경로만', () => {
    expect(buildReturnTo('/my')).toBe('/my')
    expect(buildReturnTo('/community/write', '')).toBe('/community/write')
  })

  it('board 쿼리를 지킨다 — 이게 깨졌던 부분', () => {
    expect(buildReturnTo('/community/write', '?board=stories'))
      .toBe('/community/write?board=stories')
  })

  it('쿼리가 여러 개여도 통째로 지킨다', () => {
    expect(buildReturnTo('/community/write', '?board=menopause&resumeDraft=1'))
      .toBe('/community/write?board=menopause&resumeDraft=1')
  })

  it('인코딩된 값을 다시 건드리지 않는다', () => {
    expect(buildReturnTo('/search', '?q=%EA%B0%B1%EB%85%84%EA%B8%B0'))
      .toBe('/search?q=%EA%B0%B1%EB%85%84%EA%B8%B0')
  })
})

describe('buildReturnTo — 외부로 나갈 수 있는 값은 버린다', () => {
  it('프로토콜 상대 경로(//evil.com)는 null', () => {
    expect(buildReturnTo('//evil.com')).toBeNull()
    expect(buildReturnTo('//evil.com/path', '?a=1')).toBeNull()
  })

  it('절대 URL은 null — 애초에 pathname 자리에 올 수 없지만 방어한다', () => {
    for (const v of ['https://evil.com', 'http://evil.com', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(buildReturnTo(v), v).toBeNull()
    }
  })

  it('백슬래시 우회(/\\evil.com)는 null', () => {
    expect(buildReturnTo('/\\evil.com')).toBeNull()
    expect(buildReturnTo('/ok', '?next=/\\evil.com')).toBeNull()
  })

  it('상대 경로는 null', () => {
    expect(buildReturnTo('community/write')).toBeNull()
    expect(buildReturnTo('')).toBeNull()
  })

  it('통과한 값은 항상 하나의 /로 시작한다 — 외부로 읽힐 여지가 없다', () => {
    for (const [p, s] of [['/my', ''], ['/community/write', '?board=humor'], ['/a/b/c', '?x=1&y=2']]) {
      const r = buildReturnTo(p, s)
      expect(r, `${p}${s}`).not.toBeNull()
      expect(r!.startsWith('/'), `${p}${s}`).toBe(true)
      expect(r!.startsWith('//'), `${p}${s}`).toBe(false)
    }
  })
})

describe('middleware가 이 함수를 쓰는지 — 소스 고정', () => {
  const src = read('src/middleware.ts')

  it('callbackUrl을 만드는 두 곳이 모두 buildReturnTo를 쓴다', () => {
    expect(src).toMatch(/from '@\/lib\/return-to'/)
    // set('callbackUrl', …)에 pathname을 그대로 넣던 형태가 남아 있으면 안 된다
    expect(src).not.toMatch(/searchParams\.set\('callbackUrl',\s*pathname\s*\)/)
    // 로그인·온보딩 두 지점 = 2회
    expect(src.match(/buildReturnTo\(pathname, request\.nextUrl\.search\)/g)?.length).toBe(2)
  })

  it('보호 경로는 /my만 — 글쓰기는 저장 단계에서 막는다', () => {
    expect(src).toMatch(/PROTECTED_PATHS\s*=\s*\['\/my'\]/)
    // 글쓰기를 다시 진입 단계에서 막으면 비회원 선작성 흐름이 통째로 사라진다
    expect(src).not.toMatch(/PROTECTED_PATHS\s*=\s*\[[^\]]*'\/community\/write'/)
  })

  it('인증 로직 파일은 건드리지 않는다 — middleware는 auth 설정을 import하지 않는다', () => {
    expect(src).not.toMatch(/from '@\/lib\/auth(\.config)?'/)
  })
})
