import { describe, expect, it } from 'vitest'
import { classifyMenopauseCandidate } from '../../agents/core/menopause-classifier'

describe('classifyMenopauseCandidate', () => {
  it('제목에 갱년기 강신호가 있으면 자동 라우팅 후보로 본다', () => {
    const r = classifyMenopauseCandidate({
      title: '갱년기 방광염 자꾸 걸리시는 분 계신가요 ㅠㅠ',
      content: '',
    })

    expect(r.shouldRoute).toBe(true)
    expect(r.level).toBe('strong')
    expect(r.reason).toBe('TITLE_STRONG')
    expect(r.category).toBe('몸의 변화')
  })

  it('폐경/완경/호르몬 제목은 완경·호르몬으로 분류한다', () => {
    expect(classifyMenopauseCandidate({ title: '폐경 이후 호르몬제 고민' }).category).toBe('완경·호르몬')
    expect(classifyMenopauseCandidate({ title: '완경 후 생리불순인지 궁금해요' }).category).toBe('완경·호르몬')
  })

  it('갱년기 + 감정 신호는 마음의 변화로 분류한다', () => {
    const r = classifyMenopauseCandidate({
      title: '갱년기 때문인지 자꾸 눈물이 나요',
      content: '요즘 우울하고 불안합니다',
    })

    expect(r.shouldRoute).toBe(true)
    expect(r.category).toBe('마음의 변화')
  })

  it('갱년기 + 가족 신호는 가족·관계로 분류한다', () => {
    const r = classifyMenopauseCandidate({
      title: '남편이 제 갱년기를 이해 못해요',
      content: '',
    })

    expect(r.shouldRoute).toBe(true)
    expect(r.category).toBe('가족·관계')
  })

  it('강신호가 본문에만 있으면 자동 라우팅하지 않고 medium으로 남긴다', () => {
    const r = classifyMenopauseCandidate({
      title: '요즘 잠이 안 와요',
      content: '갱년기 때문인지 모르겠습니다',
    })

    expect(r.shouldRoute).toBe(false)
    expect(r.level).toBe('medium')
    expect(r.reason).toBe('CONTENT_ONLY_STRONG')
  })

  it('우울/불안/잠/피로 같은 약신호만으로는 갱년기톡에 보내지 않는다', () => {
    const cases = [
      '요즘 너무 우울하고 불안해요',
      '잠을 못 자서 피곤합니다',
      '관절이 아프고 체중이 늘었어요',
    ]

    for (const title of cases) {
      const r = classifyMenopauseCandidate({ title })
      expect(r.shouldRoute).toBe(false)
      expect(r.level).toBe('weak')
      expect(r.reason).toBe('WEAK_ONLY')
    }
  })

  it('일반 건강글은 자동 라우팅하지 않는다', () => {
    const r = classifyMenopauseCandidate({
      title: '혈압약을 바꿨는데 어지러워요',
      content: '병원에 다시 가야 할까요',
    })

    expect(r.shouldRoute).toBe(false)
    expect(r.level).toBe('none')
  })

  it('구강작열감처럼 열감이 다른 의학 단어 안에 들어간 경우는 강신호로 보지 않는다', () => {
    const r = classifyMenopauseCandidate({
      title: '구강작열감 때문에 힘드네요',
      content: '',
    })

    expect(r.shouldRoute).toBe(false)
    expect(r.reason).toBe('NO_SIGNAL')
  })

  it('일반 가족/직장 글도 갱년기 신호 없이는 자동 라우팅하지 않는다', () => {
    const r = classifyMenopauseCandidate({
      title: '남편이 집안일을 안 도와줘요',
      content: '직장 다녀오면 너무 힘듭니다',
    })

    expect(r.shouldRoute).toBe(false)
    expect(r.reason).toBe('NO_SIGNAL')
  })
})
