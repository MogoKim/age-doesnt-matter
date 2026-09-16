/**
 * 목록 매퍼 **호출부별 계약** — Foundation 3.0 (A2).
 *
 * ── 왜 "본문이 같다"로 합치지 않는가 ────────────────────────
 *  `toUserSummary` 4곳·`toPostSummary` 3곳은 **같지 않았다.**
 *
 *   · `posts.base.toUserSummary` 만 `null` 과 `status==='WITHDRAWN'` 을 `DELETED_USER` 로 마스킹한다.
 *     나머지 3곳(댓글·내 활동·검색)은 저장된 값을 그대로 보여준다.
 *     **이건 개인정보·표시 정책이다. 리팩토링으로 바꾸지 않는다.**
 *   · `toPostSummary` 는 **반환 키 자체가 다르다**:
 *       posts.base → `slug`·`hotPromotedAt`·`isPinned` 있음
 *       my         → `isPinned` 만 있음
 *       search     → 셋 다 없음
 *     `PostSummary` 타입에서 이 셋은 optional 이라 부재가 정상이다.
 *     합치면서 키가 생기면 클라이언트로 가는 payload 모양이 바뀐다.
 *
 *  이 테스트는 **리팩토링 전에 먼저 통과**시켰고, 후에도 같은 결과여야 한다.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { toUserSummary as baseUser, toPostSummary as basePost } from '@/lib/queries/posts/posts.base'
import { toUserSummary as commentsUser } from '@/lib/queries/comments'
import { toUserSummary as myUser, toPostSummary as myPost } from '@/lib/queries/my'
import { toUserSummary as searchUser, toPostSummary as searchPost } from '@/lib/queries/search'

const AUTHOR = { id: 'u1', nickname: '테스트회원', grade: 'SPROUT', profileImage: null }
const AUTHOR_IMG = { ...AUTHOR, profileImage: 'https://cdn.example.com/p.webp' }

const POST = {
  id: 'p1',
  boardType: 'STORY' as const,
  category: '일상',
  title: '제목',
  summary: '요약',
  thumbnailUrl: 'https://cdn.example.com/t.webp',
  likeCount: 3,
  commentCount: 2,
  viewCount: 10,
  trendingScore: 1.5,
  createdAt: new Date('2026-09-01T00:00:00Z'),
}

/* ─────────────────────────────────────────────────────────────
   toUserSummary — 공통 5키
   ───────────────────────────────────────────────────────────── */
describe('toUserSummary — 네 곳이 공유하는 공통 매핑', () => {
  const ALL = [
    ['posts.base', baseUser],
    ['comments', commentsUser],
    ['my', myUser],
    ['search', searchUser],
  ] as const

  it.each(ALL)('%s — 키 5개와 값이 같다', (_name, fn) => {
    const r = fn(AUTHOR)
    expect(Object.keys(r).sort()).toEqual(['grade', 'gradeEmoji', 'id', 'nickname', 'profileImage'])
    expect(r.id).toBe('u1')
    expect(r.nickname).toBe('테스트회원')
    expect(r.grade).toBe('SPROUT')
    expect(r.profileImage).toBeNull()
    expect(typeof r.gradeEmoji).toBe('string')
  })

  it.each(ALL)('%s — profileImage 는 그대로 통과시킨다', (_name, fn) => {
    expect(fn(AUTHOR_IMG).profileImage).toBe('https://cdn.example.com/p.webp')
  })

  it.each(ALL)('%s — 모르는 등급이면 기본 이모지 🌱', (_name, fn) => {
    expect(fn({ ...AUTHOR, grade: 'NOT_A_GRADE' }).gradeEmoji).toBe('🌱')
  })

  it.each(ALL)('%s — 등급 문자열을 그대로 grade 로 넘긴다', (_name, fn) => {
    expect(fn({ ...AUTHOR, grade: 'TREE' }).grade).toBe('TREE')
  })
})

describe('🔴 탈퇴 마스킹은 posts.base 만의 계약이다 (정책 변경 금지)', () => {
  it('posts.base — null 이면 탈퇴한 회원', () => {
    const r = baseUser(null)
    expect(r.nickname).toBe('탈퇴한 회원')
    expect(r.id).toBe('')
  })

  it('posts.base — status WITHDRAWN 이면 저장된 닉네임 대신 탈퇴한 회원', () => {
    expect(baseUser({ ...AUTHOR, nickname: 'anon_8xk2', status: 'WITHDRAWN' }).nickname).toBe('탈퇴한 회원')
  })

  it('posts.base — status 가 ACTIVE·undefined 면 마스킹하지 않는다', () => {
    expect(baseUser({ ...AUTHOR, status: 'ACTIVE' }).nickname).toBe('테스트회원')
    expect(baseUser(AUTHOR).nickname).toBe('테스트회원')
  })

  it.each([
    ['comments', commentsUser],
    ['my', myUser],
    ['search', searchUser],
  ])('%s — WITHDRAWN 이어도 마스킹하지 않는다 (기존 동작 유지)', (_name, fn) => {
    const r = fn({ ...AUTHOR, nickname: 'anon_8xk2', status: 'WITHDRAWN' } as typeof AUTHOR)
    expect(r.nickname).toBe('anon_8xk2')
  })
})

/* ─────────────────────────────────────────────────────────────
   toPostSummary — 키 집합이 호출부마다 다르다
   ───────────────────────────────────────────────────────────── */
const COMMON_KEYS = [
  'author', 'boardType', 'category', 'commentCount', 'createdAt', 'id',
  'likeCount', 'preview', 'promotionLevel', 'thumbnailUrl', 'title', 'trendingScore', 'viewCount',
]

describe('toPostSummary — 공통 값', () => {
  const results = {
    base: basePost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR }),
    my: myPost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR }),
    search: searchPost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR }),
  }

  it.each(Object.entries(results))('%s — 공통 키의 값이 같다', (_name, r) => {
    expect(r.id).toBe('p1')
    expect(r.boardType).toBe('STORY')
    expect(r.category).toBe('일상')
    expect(r.title).toBe('제목')
    expect(r.preview).toBe('요약')            // summary → preview 로 이름이 바뀐다
    expect(r.thumbnailUrl).toBe('https://cdn.example.com/t.webp')
    expect(r.likeCount).toBe(3)
    expect(r.commentCount).toBe(2)
    expect(r.viewCount).toBe(10)
    expect(r.trendingScore).toBe(1.5)
    expect(r.createdAt).toBe('2026-09-01T00:00:00.000Z')  // Date → ISO 문자열
    expect(r.author.nickname).toBe('테스트회원')
    expect(r.promotionLevel).toBe('NORMAL')
  })

  it('category·summary 가 null 이면 세 곳 모두 빈 문자열', () => {
    const nulled = { ...POST, category: null, summary: null, promotionLevel: 'NORMAL' as const, author: AUTHOR }
    expect(basePost(nulled).category).toBe('')
    expect(basePost(nulled).preview).toBe('')
    expect(myPost(nulled).category).toBe('')
    expect(myPost(nulled).preview).toBe('')
    expect(searchPost(nulled).category).toBe('')
    expect(searchPost(nulled).preview).toBe('')
  })

  it('thumbnailUrl 이 null 이면 세 곳 모두 null', () => {
    const nulled = { ...POST, thumbnailUrl: null, promotionLevel: 'NORMAL' as const, author: AUTHOR }
    expect(basePost(nulled).thumbnailUrl).toBeNull()
    expect(myPost(nulled).thumbnailUrl).toBeNull()
    expect(searchPost(nulled).thumbnailUrl).toBeNull()
  })

  it('HALL_OF_FAME 승격 등급이 세 곳 모두 그대로 전달된다', () => {
    const hof = { ...POST, promotionLevel: 'HALL_OF_FAME' as const, author: AUTHOR }
    expect(basePost(hof).promotionLevel).toBe('HALL_OF_FAME')
    expect(myPost(hof).promotionLevel).toBe('HALL_OF_FAME')
    expect(searchPost(hof).promotionLevel).toBe('HALL_OF_FAME')
  })
})

describe('🔴 toPostSummary — 키 집합은 호출부마다 다르다 (합치면서 늘리지 않는다)', () => {
  const base = basePost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR, slug: 'my-slug', hotPromotedAt: new Date('2026-09-02T00:00:00Z'), isPinned: true })
  const my = myPost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR, isPinned: true })
  const search = searchPost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR })

  it('posts.base — 공통 + slug·hotPromotedAt·isPinned', () => {
    expect(Object.keys(base).sort()).toEqual([...COMMON_KEYS, 'hotPromotedAt', 'isPinned', 'slug'].sort())
    expect(base.slug).toBe('my-slug')
    expect(base.hotPromotedAt).toBe('2026-09-02T00:00:00.000Z')
    expect(base.isPinned).toBe(true)
  })

  it('my — 공통 + isPinned 만. slug·hotPromotedAt 키는 없다', () => {
    expect(Object.keys(my).sort()).toEqual([...COMMON_KEYS, 'isPinned'].sort())
    expect('slug' in my).toBe(false)
    expect('hotPromotedAt' in my).toBe(false)
    expect(my.isPinned).toBe(true)
  })

  it('search — 공통만. slug·hotPromotedAt·isPinned 키가 모두 없다', () => {
    expect(Object.keys(search).sort()).toEqual([...COMMON_KEYS].sort())
    expect('slug' in search).toBe(false)
    expect('hotPromotedAt' in search).toBe(false)
    expect('isPinned' in search).toBe(false)
  })
})

describe('기본값 — 없거나 null 일 때', () => {
  it('posts.base — slug·hotPromotedAt 없으면 null, isPinned 없으면 false', () => {
    const r = basePost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR })
    expect(r.slug).toBeNull()
    expect(r.hotPromotedAt).toBeNull()
    expect(r.isPinned).toBe(false)
  })

  it('posts.base — author 가 없으면 탈퇴한 회원으로 채운다', () => {
    const r = basePost({ ...POST, promotionLevel: 'NORMAL' })
    expect(r.author.nickname).toBe('탈퇴한 회원')
  })

  it('posts.base — category·summary·thumbnailUrl 키 자체가 없어도 기본값을 만든다', () => {
    const r = basePost({
      id: 'p2', boardType: 'STORY', title: 't', likeCount: 0, commentCount: 0, viewCount: 0,
      promotionLevel: 'NORMAL', trendingScore: 0, createdAt: new Date('2026-09-01T00:00:00Z'),
    })
    expect(r.category).toBe('')
    expect(r.preview).toBe('')
    expect(r.thumbnailUrl).toBeNull()
  })

  it('my — isPinned 가 없으면 false', () => {
    expect(myPost({ ...POST, promotionLevel: 'NORMAL', author: AUTHOR }).isPinned).toBe(false)
  })
})
