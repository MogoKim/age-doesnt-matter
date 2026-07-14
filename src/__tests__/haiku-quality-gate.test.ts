import { describe, it, expect } from 'vitest'
import { buildHaikuQualityPrompt, parseHaikuQualityDecision } from '../../agents/cafe/haiku-quality-gate'

/** Haiku 품질 게이트 dry-run (PR-2) — 순수부(프롬프트 빌더·파서) 고정. API 호출은 mock 없이 범위 밖 */

describe('parseHaikuQualityDecision — 응답 파싱', () => {
  it('정상 JSON 파싱', () => {
    const r = parseHaikuQualityDecision(
      '{"decision":"REJECT","confidence":0.9,"speakerRole":"young_self","risks":["newlywed"],"reason":"아직 신혼이라 — 본인 신혼 발화"}',
    )
    expect(r?.decision).toBe('REJECT')
    expect(r?.speakerRole).toBe('young_self')
    expect(r?.risks).toEqual(['newlywed'])
    expect(r?.confidence).toBe(0.9)
  })

  it('코드펜스·잡텍스트에 싸인 JSON도 추출', () => {
    const r = parseHaikuQualityDecision(
      '판정 결과입니다.\n```json\n{"decision":"PASS","confidence":0.8,"speakerRole":"neutral_daily","risks":[],"reason":"무해한 생활글"}\n```',
    )
    expect(r?.decision).toBe('PASS')
    expect(r?.speakerRole).toBe('neutral_daily')
  })

  it('decision이 enum 밖이면 null (호출부 ERROR 처리)', () => {
    expect(parseHaikuQualityDecision('{"decision":"MAYBE","confidence":0.5,"speakerRole":"unknown","risks":[],"reason":"x"}')).toBeNull()
  })

  it('enum 밖 risk는 걸러지고 유효 risk만 남음', () => {
    const r = parseHaikuQualityDecision(
      '{"decision":"NEEDS_REVIEW","confidence":0.6,"speakerRole":"unknown","risks":["male_self","invented_risk"],"reason":"x"}',
    )
    expect(r?.risks).toEqual(['male_self'])
  })

  it('speakerRole이 enum 밖이면 unknown으로 강등', () => {
    const r = parseHaikuQualityDecision('{"decision":"PASS","confidence":0.7,"speakerRole":"grandma","risks":[],"reason":"x"}')
    expect(r?.speakerRole).toBe('unknown')
  })

  it('confidence 범위 밖(1.5)이면 0으로 보정', () => {
    const r = parseHaikuQualityDecision('{"decision":"PASS","confidence":1.5,"speakerRole":"unknown","risks":[],"reason":"x"}')
    expect(r?.confidence).toBe(0)
  })

  it('JSON 없음/깨진 JSON은 null', () => {
    expect(parseHaikuQualityDecision('죄송합니다, 판정할 수 없습니다.')).toBeNull()
    expect(parseHaikuQualityDecision('{"decision":"PASS", 깨짐')).toBeNull()
  })
})

describe('buildHaikuQualityPrompt — 판정 기준 고정', () => {
  const prompt = buildHaikuQualityPrompt({
    cafePostId: 'x',
    title: '에어컨 24시 켜두는집 있으신가요?',
    content: '전기세 걱정되는데 다들 어떻게 하세요',
    boardType: 'STORY',
    now: new Date('2026-07-14T03:00:00Z'), // KST 화요일
  })

  it('발행 시점(날짜·요일)이 주입됨 — 시간성 판정 근거', () => {
    expect(prompt).toContain('2026년 7월 14일 화요일')
  })

  it('발행 게시판 주입', () => {
    expect(prompt).toContain('발행 게시판: STORY')
  })

  it('오판 방지 절대 규칙 포함 — 와이프/타인 이야기/지역', () => {
    expect(prompt).toContain('화자가 여성일 수 있다')
    expect(prompt).toContain('성인 자녀·손주·조카·지인')
    expect(prompt).toContain('차단 사유가 절대 아니다')
  })

  it('과차단 방지 지침 포함 — 애매하면 NEEDS_REVIEW', () => {
    expect(prompt).toContain('NEEDS_REVIEW로 넘겨라')
  })

  it('본문 2000자 절단', () => {
    const long = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'a'.repeat(5000), boardType: 'STORY' })
    expect(long.length).toBeLessThan(4600)
  })
})
