import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildSummary as srcBuild, htmlToPlainText as srcPlain } from '@/lib/summary'
import { buildSummary as agentsBuild, htmlToPlainText as agentsPlain } from '../../agents/core/summary'

/**
 * src 런타임(@/lib/summary)과 크롤·백필(agents/core/summary)이 어긋나지 않게 고정한다.
 *
 * 두 구현이 따로 있는 이유는 import가 양방향 모두 막혀 있어서다 —
 * `.vercelignore`가 `/agents/`를 배포에서 빼고, `.claude/rules/agents.md`가
 * agents → src 런타임 import를 금지한다. 그래서 코드 공유 대신 이 테스트로 계약을 맞춘다.
 *
 * 이 파일은 vitest 전용이다. 런타임 번들에는 들어가지 않으므로 배포 제약과 무관하다.
 */

/** 두 구현이 같은 결과를 내야 하는 입력 — normalizeSourceReferences가 관여하지 않는 것들 */
const SHARED_CASES: string[] = [
  '<p>가</p><p>나</p>',
  '<p>오늘​ ​설치했어요</p>',
  '<p>가&nbsp;나</p>',
  '<p>&amp;lt;태그&amp;gt;</p>',
  '<p>말줄임&hellip;끝</p>',
  '<p>안녕</p><script>alert(1)</script>',
  '<style>.a{color:red}</style><p>본문</p>',
  '<p>본문</p><script>alert(1)',
  `<p>${'가'.repeat(120)}</p>`,
  `<p>${'가'.repeat(100)}</p>`,
  '<p><img src="https://img.example.com/a.webp"></p>',
  '<p></p><p>​</p>',
  '',
  '<p>이 기사 보세요 https://n.news.naver.com/article/001</p>',
  '<p>https://youtube.com/shorts/abc 쇼츠에 떠서 해봤는데 되네요</p>',
  '<p>https://petitions.assembly.go.kr/proceed/onGoingAll/525630 동의해주세요</p>',
  '<p>www.example.com</p>',
  '<p>충청 화법하니까 그거 생각난다 instiz.net</p>',
  '<p>회사 메일이 example.co.kr 로 바뀌었어요</p>',
  '<p>(자료출처:인터넷) 국민연금 월 167만원이 중요한 이유</p>',
  '<p>사자 갈기 숱이 적어진다고 ㅊㅊ:</p>',
  '<p>좋은 글 ㅊㅊ: https://example.com/abc</p>',
  '<p>ㅊㅊ: https://example.com/abc</p>',
  '<p>이 영화 ㅊㅊ해요 정말 재밌었어요</p>',
  '<p>고양이 합사해 보신 분 계신가요?</p>',
  '<p>이 자료의 출처를 찾다가 결국 원본을 못 찾았는데요 혹시 아시는 분 계신가요 정말 궁금해서 여쭤봅니다</p>',
]

describe('summary 계약 — src와 agents 구현 일치', () => {
  it.each(SHARED_CASES)('htmlToPlainText 동일: %s', (html) => {
    expect(srcPlain(html)).toBe(agentsPlain(html))
  })

  it.each(SHARED_CASES)('buildSummary 동일: %s', (html) => {
    expect(srcBuild(html)).toBe(agentsBuild(html))
  })

  it('의도적 차이 — 외부 사이트명 정규화는 agents판에만 있다', () => {
    // agents판은 크롤 원문 재발행이라 "82쿡"을 "우나어"로 일반화한다.
    // src판은 회원이 직접 쓴 문장을 왜곡하지 않으려고 그 단계를 뺐다.
    const html = '<p>82쿡에서 봤는데 이 방법이 좋대요</p>'
    expect(srcBuild(html)).toBe('82쿡에서 봤는데 이 방법이 좋대요')
    expect(agentsBuild(html)).toBe('우나어에서 봤는데 이 방법이 좋대요')
  })
})

/** 레거시 자체 절단 로직이 되살아나지 않게 소스를 직접 본다. */
describe('summary 생성 경로 단일화 — 레거시 잔존 0', () => {
  const root = join(__dirname, '..', '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf-8')

  const RUNTIME_PATHS = [
    'src/lib/actions/posts.ts',
    'src/lib/actions/greeting.ts',
    'src/app/api/bot/posts/route.ts',
  ]

  it.each(RUNTIME_PATHS)('%s — 자체 slice 절단 로직이 없다', (p) => {
    const src = read(p)
    // "…slice(0, 97) + '...'" 형태의 손수 절단
    expect(src).not.toMatch(/slice\(\s*0\s*,\s*97\s*\)/)
    // summary 를 직접 조립하는 삼항식
    expect(src).not.toMatch(/summary\s*=\s*\w+\.length\s*>\s*100/)
  })

  it.each(RUNTIME_PATHS)('%s — @/lib/summary의 buildSummary를 쓴다', (p) => {
    const src = read(p)
    expect(src).toMatch(/import\s*\{[^}]*buildSummary[^}]*\}\s*from\s*'@\/lib\/summary'/)
    expect(src).toMatch(/buildSummary\(/)
  })

  it('봇 API post.create가 summary를 넣는다', () => {
    const src = read('src/app/api/bot/posts/route.ts')
    expect(src).toMatch(/summary:\s*buildSummary\(/)
  })

  it('src 런타임이 agents를 import하지 않는다 (배포 제약)', () => {
    for (const p of RUNTIME_PATHS) {
      expect(read(p)).not.toMatch(/from\s*'[^']*agents\//)
    }
  })
})
