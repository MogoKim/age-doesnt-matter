import { describe, expect, it } from 'vitest'

import {
  appendTopicHubLinkToRelated,
  getMagazineTopicTitleKeywords,
  resolveMagazineTopicHubLink,
  scoreMagazineTopic,
  sortMagazineRelatedPostsByTopic,
  type MagazineTopicHubLink,
} from '@/lib/seo/magazine-topic-link'

describe('magazine topic hub link', () => {
  it('matches menopause articles from strong title keywords', () => {
    const link = resolveMagazineTopicHubLink({
      title: '갱년기 끝나는 나이, 나만 이런 걸까요',
      category: '건강',
    })

    expect(link?.href).toBe('/topic/menopause')
    expect(link?.label).toBe('갱년기 관련 글 더 보기')
  })

  it('matches menopause sleep and body-change articles', () => {
    const link = resolveMagazineTopicHubLink({
      title: '50대 수면 잘 오게 하는 습관 10가지',
      seoDescription: '새벽에 깨고 잠을 못 자는 몸의 변화가 걱정될 때',
      category: '건강',
    })

    expect(link?.href).toBe('/topic/menopause')
  })

  it('matches second-act work and retirement articles', () => {
    const link = resolveMagazineTopicHubLink({
      title: '퇴직금 IRP 해지 방법 완벽 정리',
      seoDescription: '은퇴 후 건강보험과 생활비를 함께 확인하세요',
      category: '은퇴준비',
    })

    expect(link?.href).toBe('/topic/second-act')
    expect(link?.label).toBe('인생 2막과 일 이야기 더 보기')
  })

  it('matches Coupang job guide articles to second-act', () => {
    const link = resolveMagazineTopicHubLink({
      title: '50대 쿠팡 알바 재취업 현실',
      preview: '다시 일하려고 마음먹었을 때 확인할 점',
      category: '일자리',
    })

    expect(link?.href).toBe('/topic/second-act')
  })

  it('does not match unrelated magazine articles', () => {
    const link = resolveMagazineTopicHubLink({
      title: '경주 걷기 편한 코스 추천',
      seoDescription: '천천히 걷기 좋은 여행지',
      category: '여행',
    })

    expect(link).toBeNull()
  })

  it('does not match broad health category without a strong topic keyword', () => {
    const link = resolveMagazineTopicHubLink({
      title: '건강한 아침 식사 습관',
      seoDescription: '하루를 가볍게 시작하는 생활 습관',
      category: '건강',
    })

    expect(link).toBeNull()
  })

  it('chooses only the stronger topic when both topics are mentioned', () => {
    const link = resolveMagazineTopicHubLink({
      title: '갱년기 불면과 수면 관리',
      seoDescription: '은퇴 후 생활 리듬이 바뀌며 잠을 못 잘 때',
      category: '건강',
    })

    expect(link?.href).toBe('/topic/menopause')
  })

  it('keeps related item density by replacing the last related card', () => {
    const related = [
      { id: 'r1' },
      { id: 'r2' },
      { id: 'r3' },
      { id: 'r4' },
      { id: 'r5' },
    ]
    const topic: MagazineTopicHubLink = {
      kind: 'topic-hub',
      id: 'menopause',
      href: '/topic/menopause',
      label: '갱년기 관련 글 더 보기',
      badge: '주제 모아보기',
    }

    const items = appendTopicHubLinkToRelated(related, topic, 5)

    expect(items).toHaveLength(5)
    expect(items.slice(0, 4)).toEqual(related.slice(0, 4))
    expect(items[4]).toBe(topic)
  })

  it('leaves unrelated related cards unchanged when topic link is absent', () => {
    const related = [{ id: 'r1' }, { id: 'r2' }]

    expect(appendTopicHubLinkToRelated(related, null, 5)).toEqual(related)
  })

  it('exposes bounded topic title keywords for related-post lookup', () => {
    expect(getMagazineTopicTitleKeywords('menopause', 3)).toEqual(['갱년기', '폐경', '완경'])
    expect(getMagazineTopicTitleKeywords('second-act', 3)).toEqual(['재취업', '일자리', '구직'])
    expect(getMagazineTopicTitleKeywords(null)).toEqual([])
  })

  it('scores menopause candidates higher when they share menopause intent', () => {
    expect(scoreMagazineTopic({ title: '갱년기 불면, 새벽마다 깨는 이유', category: '건강' }, 'menopause'))
      .toBeGreaterThan(scoreMagazineTopic({ title: '아침 식사 습관', category: '건강' }, 'menopause'))
  })

  it('sorts menopause related magazines ahead of broad health articles', () => {
    const related = [
      { id: 'general', title: '건강한 아침 식사 습관', preview: '하루를 가볍게 시작하는 법', category: '건강' },
      { id: 'sleep', title: '갱년기 불면, 새벽마다 깨는 이유', preview: '잠을 못 자는 몸의 변화', category: '건강' },
      { id: 'joint', title: '폐경 후 관절 통증이 심해질 때', preview: '몸의 변화가 걱정될 때', category: '건강' },
    ]

    expect(sortMagazineRelatedPostsByTopic(related, 'menopause').map((post) => post.id))
      .toEqual(['sleep', 'joint', 'general'])
  })

  it('sorts second-act related magazines ahead of weak same-category articles', () => {
    const related = [
      { id: 'essay', title: '은퇴 후 아침 산책을 시작했어요', preview: '하루 루틴 이야기', category: '은퇴준비' },
      { id: 'coupang', title: '60대 쿠팡 알바 시작 전 확인할 것', preview: '다시 일하려는 분들이 묻는 점', category: '일자리' },
      { id: 'pension', title: '퇴직 후 건강보험과 국민연금 확인 순서', preview: '생활비를 다시 계산할 때', category: '은퇴준비' },
    ]

    expect(sortMagazineRelatedPostsByTopic(related, 'second-act').map((post) => post.id))
      .toEqual(['pension', 'coupang', 'essay'])
  })

  it('keeps unrelated related magazines in existing order when no topic is provided', () => {
    const related = [
      { id: 'walk', title: '경주 걷기 편한 코스 추천', category: '여행' },
      { id: 'meal', title: '가볍게 먹기 좋은 점심', category: '일상' },
    ]

    expect(sortMagazineRelatedPostsByTopic(related, null).map((post) => post.id))
      .toEqual(['walk', 'meal'])
  })

  it('sorts mixed articles by the stronger resolved topic only', () => {
    const current = resolveMagazineTopicHubLink({
      title: '갱년기 불면과 수면 관리',
      seoDescription: '은퇴 후 생활 리듬이 바뀌며 잠을 못 잘 때',
      category: '건강',
    })
    const related = [
      { id: 'retire', title: '은퇴 후 생활비 다시 계산하기', category: '은퇴준비' },
      { id: 'menopause', title: '갱년기 수면과 안면홍조 관리', category: '건강' },
    ]

    expect(current?.id).toBe('menopause')
    expect(sortMagazineRelatedPostsByTopic(related, current?.id).map((post) => post.id))
      .toEqual(['menopause', 'retire'])
  })
})
