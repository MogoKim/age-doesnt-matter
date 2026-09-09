import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitizeHtml, sanitizeMagazineHtml, stripHtmlTags, plainTextToSafeHtml } from '@/lib/sanitize'

/**
 * P1-A 보안 업데이트 회귀 방지선 — 2026-09-09.
 *
 * 올린 것: `next-auth` 5.0.0-beta.30 → beta.32, `@auth/core` override 0.41.1 → 0.41.3
 * (critical 3건: 이메일 정규화 homoglyph 우회 · getToken 미처리 예외 · OAuth state/nonce/PKCE
 * 쿠키가 발급 provider 에 묶이지 않는 문제), `sanitize-html` 2.17.4 → 2.17.7,
 * Tiptap 6개 3.20.4/3.22.0 혼재 → 3.31.3 정렬.
 *
 * 이 패키지들은 **로그인·세션·사용자 입력 정화** 경로에 있다. 버전만 올리고 끝내면
 * 무엇이 깨졌는지 배포 후에 알게 된다. 여기서 다섯 계약을 고정한다.
 */

const ROOT = join(__dirname, '../..')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
  dependencies: Record<string, string>
  overrides?: Record<string, string>
}
const authConfigSrc = readFileSync(join(ROOT, 'src/lib/auth.config.ts'), 'utf-8')
const authSrc = readFileSync(join(ROOT, 'src/lib/auth.ts'), 'utf-8')

/** `^5.0.0-beta.32` 같은 범위에서 beta 번호만 뽑는다. */
function betaOf(range: string): number {
  return Number(/beta\.(\d+)/.exec(range)?.[1] ?? -1)
}

describe('① 취약 버전으로 되돌아가지 않는다', () => {
  it('next-auth 는 5.0.0-beta.32 이상이다', () => {
    expect(betaOf(pkg.dependencies['next-auth']), 'beta.31 이하는 @auth/core critical 3건에 걸린다')
      .toBeGreaterThanOrEqual(32)
  })

  it('@auth/core override 는 0.41.3 이상이다', () => {
    // 이 override 는 0.41.1 로 고정돼 있었고, 그게 취약 버전을 붙잡고 있었다.
    // 삭제하지 않고 올린 이유는 next-auth 와 @auth/prisma-adapter 가 같은 버전을 쓰게 하기 위해서다.
    const v = pkg.overrides?.['@auth/core'] ?? ''
    const [maj, min, patch] = v.replace(/^[^\d]*/, '').split('.').map(Number)
    expect([maj, min, patch], `현재 override=${v}`).toEqual([0, 41, expect.any(Number)])
    expect(patch, 'audit 숫자를 가리려고 낮추지 마라').toBeGreaterThanOrEqual(3)
  })

  it('Tiptap 6개 버전이 하나로 정렬돼 있다', () => {
    const tiptap = Object.entries(pkg.dependencies).filter(([k]) => k.startsWith('@tiptap/'))
    expect(tiptap.length).toBeGreaterThanOrEqual(6)
    expect(new Set(tiptap.map(([, v]) => v)).size, `버전 혼재: ${JSON.stringify(Object.fromEntries(tiptap))}`).toBe(1)
  })
})

describe('② Kakao provider redirect 계약', () => {
  it('authorize·token 엔드포인트가 카카오 도메인 그대로다', () => {
    expect(authConfigSrc).toContain("url: 'https://kauth.kakao.com/oauth/authorize'")
    expect(authConfigSrc).toContain("url: 'https://kauth.kakao.com/oauth/token'")
  })

  it('state check 가 켜져 있다 — OAuth 쿠키 바인딩 수정의 전제다', () => {
    expect(authConfigSrc).toMatch(/checks:\s*\['state'\]/)
  })

  it('카카오 응답 호환 conform 이 남아 있다 (content-type·www-authenticate 정규화)', () => {
    // beta 업그레이드가 oauth4webapi 를 건드리므로 이 우회가 사라지면 로그인이 깨진다.
    expect(authConfigSrc).toContain('conform:')
    expect(authConfigSrc).toContain("newHeaders.set('content-type', 'application/json')")
    expect(authConfigSrc).toContain("newHeaders.delete('www-authenticate')")
  })

  it('로그인·에러 페이지 경로가 그대로다', () => {
    expect(authConfigSrc).toContain("signIn: '/login'")
    expect(authConfigSrc).toContain("error: '/auth/error'")
  })
})

describe('③ 세션 계약', () => {
  it('JWT 전략과 30일 만료를 유지한다', () => {
    expect(authConfigSrc).toMatch(/strategy:\s*'jwt'/)
    expect(authConfigSrc).toContain('maxAge: 30 * 24 * 60 * 60')
  })

  it('session 콜백이 우나어 고유 필드를 채운다', () => {
    for (const f of ['session.user.id', 'session.user.role', 'session.user.grade', 'session.user.nickname', 'session.user.needsOnboarding']) {
      expect(authConfigSrc, `${f} 가 빠지면 로그인 후 화면이 깨진다`).toContain(f)
    }
  })

  it('남성 가입 차단이 살아 있다', () => {
    expect(authSrc).toContain("kakaoData?.gender === 'male'")
  })
})

describe('④ HTML sanitization — sanitize-html 업그레이드 후', () => {
  it('script 를 제거한다', () => {
    expect(sanitizeHtml('<p>안녕</p><script>alert(1)</script>')).not.toContain('<script')
  })

  it('이벤트 핸들러 속성을 제거한다', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">문단</p>')
    expect(out).not.toContain('onclick')
    expect(out).toContain('문단')
  })

  it('javascript: 링크를 제거한다', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">링크</a>')).not.toContain('javascript:')
  })

  it('허용된 서식은 살린다 — 과잉 제거도 회귀다', () => {
    const out = sanitizeHtml('<p><strong>굵게</strong> 그리고 <em>기울임</em></p>')
    expect(out).toContain('<strong>')
    expect(out).toContain('<em>')
  })

  it('매거진용 sanitizer 도 script 를 막는다', () => {
    expect(sanitizeMagazineHtml('<h2>제목</h2><script>x()</script>')).not.toContain('<script')
  })

  it('stripHtmlTags 는 태그를 벗기고 본문을 남긴다', () => {
    expect(stripHtmlTags('<p>우리 <b>나이</b>가 어때서</p>')).toContain('나이')
    expect(stripHtmlTags('<p>본문</p>')).not.toContain('<p>')
  })

  it('plainTextToSafeHtml 은 입력의 꺾쇠를 이스케이프한다', () => {
    expect(plainTextToSafeHtml('<script>alert(1)</script>')).not.toContain('<script>')
  })
})

describe('⑤ 에디터 입력/출력 경로', () => {
  const editorSrc = readFileSync(join(ROOT, 'src/components/features/community/TipTapEditor.tsx'), 'utf-8')

  it('Tiptap 3.x API(useEditor)를 그대로 쓴다', () => {
    expect(editorSrc).toContain('useEditor')
    expect(editorSrc).toContain('@tiptap/react')
  })

  it('에디터 출력은 저장 전에 정화된다', () => {
    // 에디터가 만든 HTML 이 그대로 DB 로 가면 XSS 경로가 된다.
    const posts = readFileSync(join(ROOT, 'src/lib/actions/posts.ts'), 'utf-8')
    expect(posts, 'posts 액션이 sanitize 를 거치지 않는다').toMatch(/sanitize/i)
  })

  it('댓글 경로도 정화를 거친다', () => {
    const comments = readFileSync(join(ROOT, 'src/lib/actions/comments.ts'), 'utf-8')
    expect(comments).toMatch(/sanitize/i)
  })
})
