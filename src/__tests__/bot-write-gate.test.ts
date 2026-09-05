import { describe, it, expect } from 'vitest'
import { isBotWriteEnabled } from '@/lib/bot-write-gate'

/**
 * 외부 봇의 글쓰기 입구는 "기본 차단"이어야 한다.
 * 여기가 느슨해지면 R4에서 멈춘 자동 발행이 env 한 줄 실수로 다시 열린다.
 */
describe('isBotWriteEnabled', () => {
  it('env 미설정이면 차단(false)', () => {
    expect(isBotWriteEnabled({})).toBe(false)
  })
  it("정확히 'true' 일 때만 허용", () => {
    expect(isBotWriteEnabled({ BOT_WRITE_ENABLED: 'true' })).toBe(true)
  })
  it("'1' · 'TRUE' · 'yes' · 'false' 는 전부 차단", () => {
    for (const v of ['1', 'TRUE', 'yes', 'false', '']) {
      expect(isBotWriteEnabled({ BOT_WRITE_ENABLED: v })).toBe(false)
    }
  })
})
