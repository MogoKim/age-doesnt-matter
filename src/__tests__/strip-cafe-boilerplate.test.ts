import { describe, it, expect } from 'vitest'
import { stripCafeBoilerplate } from '../../agents/cafe/curator-shared'

describe('stripCafeBoilerplate — 카페 게시판 안내문 맨 앞 제거', () => {
  // ── 제거 케이스 ──
  it('하트 감싼 안내문 + 빈 줄 제거 → 본문만 남김', () => {
    expect(
      stripCafeBoilerplate('💗서로 배려하는 마음으로 예쁜 글 부탁드려요💗\n\n동생이 만나는 남자가 있는데...'),
    ).toBe('동생이 만나는 남자가 있는데...')
  })

  it('하트 없는 안내문 + 빈 줄 제거', () => {
    expect(stripCafeBoilerplate('서로 배려하는 마음으로 예쁜 글 부탁드려요\n\n본문')).toBe('본문')
  })

  it('안내문 뒤 단일 개행도 제거', () => {
    expect(stripCafeBoilerplate('서로 배려하는 마음으로 예쁜 글 부탁드려요\n본문')).toBe('본문')
  })

  it('앞쪽 공백/제로폭 + 이모지 변형(❤️)도 허용', () => {
    expect(stripCafeBoilerplate('  ​❤️ 서로 배려하는 마음으로 예쁜 글 부탁드려요 ❤️\n\n실제 글')).toBe('실제 글')
  })

  it('원문 전체가 안내문뿐이면 빈 문자열(호출부 empty guard가 처리)', () => {
    expect(stripCafeBoilerplate('💗서로 배려하는 마음으로 예쁜 글 부탁드려요💗')).toBe('')
  })

  // ── 과삭제 방지(유지) 케이스 ──
  it('비슷하지만 다른 문장은 유지', () => {
    expect(stripCafeBoilerplate('서로 배려하면서 지내야 한다고 생각해요')).toBe(
      '서로 배려하면서 지내야 한다고 생각해요',
    )
  })

  it('일반 본문 첫 줄은 그대로', () => {
    expect(stripCafeBoilerplate('동생이 만나는 남자가 있는데...')).toBe('동생이 만나는 남자가 있는데...')
  })

  it('본문 중간에 같은 표현이 있어도 제거하지 않음(맨 앞만)', () => {
    const input = '오늘 있었던 일 이야기할게요.\n\n서로 배려하는 마음으로 예쁜 글 부탁드려요\n\n그래서 말인데'
    expect(stripCafeBoilerplate(input)).toBe(input)
  })

  it('안내 구절 뒤에 실제 본문이 같은 줄에 이어지면 제거하지 않음(줄 단독일 때만)', () => {
    const input = '서로 배려하는 마음으로 예쁜 글 부탁드려요 그리고 오늘 이야기'
    expect(stripCafeBoilerplate(input)).toBe(input)
  })

  it('"배려"·"예쁜 글" 단어 단독으로는 제거하지 않음', () => {
    expect(stripCafeBoilerplate('예쁜 글 쓰고 싶어서 배려도 했는데')).toBe('예쁜 글 쓰고 싶어서 배려도 했는데')
  })

  it('빈 입력은 그대로', () => {
    expect(stripCafeBoilerplate('')).toBe('')
  })
})
