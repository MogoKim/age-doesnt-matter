import { describe, expect, it } from 'vitest'

import {
  appendTopicHubLinkToRelated,
  resolveMagazineTopicHubLink,
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
})
