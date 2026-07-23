import { describe, it, expect } from 'vitest'
import { buildDiscussionForumJsonLd, DFP_COMMENT_LIMIT, type DiscussionForumInput } from '@/lib/seo/discussion-forum'

interface JsonLdShape {
  '@context': string
  '@type': string
  headline: string
  text: string
  url: string
  datePublished: string
  dateModified: string
  author: { '@type': string; name: string }
  image?: string
  interactionStatistic: Array<{ '@type': string; interactionType: string; userInteractionCount: number }>
  comment?: Array<{ '@type': string; author: { '@type': string; name: string }; text: string; datePublished: string }>
}
const build = (i: DiscussionForumInput) => buildDiscussionForumJsonLd(i) as unknown as JsonLdShape

const base: DiscussionForumInput = {
  title: '갱년기 증상인가요?',
  text: '요즘 얼굴로 열이 확 오르고 잠도 잘 안 와요.',
  authorName: '불안한밤',
  datePublished: '2026-07-23T01:00:00.000Z',
  dateModified: '2026-07-23T02:00:00.000Z',
  url: 'https://age-doesnt-matter.com/community/stories/갱년기-증상인가요-2',
  image: 'https://age-doesnt-matter.com/img.webp',
  likeCount: 5,
  viewCount: 40,
  commentCount: 4,
  publisherName: '우리 나이가 어때서',
  publisherUrl: 'https://age-doesnt-matter.com',
  comments: [
    { authorName: '황당맘', text: '번아웃이 온 게 아닐까요?', datePublished: '2026-07-23T01:10:00.000Z' },
    { authorName: '공감백퍼', text: '저도 몇 년간 심했어요', datePublished: '2026-07-23T01:20:00.000Z' },
  ],
}

describe('buildDiscussionForumJsonLd', () => {
  it('@type = DiscussionForumPosting (Article 아님)', () => {
    const j = buildDiscussionForumJsonLd(base)
    expect(j['@type']).toBe('DiscussionForumPosting')
    expect(j['@context']).toBe('https://schema.org')
  })

  it('필수 필드: author.name / datePublished / text 존재', () => {
    const j = buildDiscussionForumJsonLd(base)
    expect(j.author).toEqual({ '@type': 'Person', name: '불안한밤' })
    expect(j.datePublished).toBe('2026-07-23T01:00:00.000Z')
    expect(j.text).toBeTruthy()
    expect(j.headline).toBe('갱년기 증상인가요?')
    expect(j.url).toContain('/community/stories/')
    expect(j.dateModified).toBe('2026-07-23T02:00:00.000Z')
  })

  it('interactionStatistic = Like/View/Comment 3개', () => {
    const j = build(base)
    expect(j.interactionStatistic).toHaveLength(3)
    const like = j.interactionStatistic.find((x) => x.interactionType.endsWith("LikeAction"))!
    expect(like.userInteractionCount).toBe(5)
  })

  it('댓글 있는 글: comment[] 포함 + Comment 매핑', () => {
    const j = build(base)
    expect(j.comment)!.toHaveLength(2)
    expect(j.comment![0]).toEqual({
      '@type': 'Comment',
      author: { '@type': 'Person', name: '황당맘' },
      text: '번아웃이 온 게 아닐까요?',
      datePublished: '2026-07-23T01:10:00.000Z',
    })
  })

  it('댓글 없는 글: comment 필드 생략', () => {
    const j = build({ ...base, comments: [] })
    expect('comment' in j).toBe(false)
  })

  it('이름/본문 빈 댓글은 제외', () => {
    const j = build({
      ...base,
      comments: [
        { authorName: '', text: '내용', datePublished: '2026-07-23T01:10:00.000Z' },
        { authorName: '정상', text: '', datePublished: '2026-07-23T01:10:00.000Z' },
        { authorName: '정상', text: '내용있음', datePublished: '2026-07-23T01:10:00.000Z' },
      ],
    })
    expect(j.comment)!.toHaveLength(1)
    expect(j.comment![0].author.name).toBe('정상')
  })

  it(`댓글 상한 ${DFP_COMMENT_LIMIT}개`, () => {
    const many = Array.from({ length: 15 }, (_, k) => ({ authorName: `u${k}`, text: `t${k}`, datePublished: '2026-07-23T01:10:00.000Z' }))
    const j = build({ ...base, comments: many })
    expect(j.comment)!.toHaveLength(DFP_COMMENT_LIMIT)
  })

  it('image 없으면 image 필드 생략', () => {
    const j = build({ ...base, image: null })
    expect('image' in j).toBe(false)
    const j2 = build({ ...base, image: undefined })
    expect('image' in j2).toBe(false)
  })

  it('게스트 닉네임도 author.name으로 사용 (호출부가 guestNickname을 authorName에 매핑)', () => {
    const j = build({
      ...base,
      comments: [{ authorName: '지나가던손님', text: '공감해요', datePublished: '2026-07-23T01:10:00.000Z' }],
    })
    expect(j.comment![0].author.name).toBe('지나가던손님')
  })
})
