import { describe, it, expect } from 'vitest'
import {
  cleanCuratedTitle,
  cleanCuratedContent,
  hasPublishableBody,
} from '../../agents/cafe/curator-shared'

/**
 * 발행 전 정화 후 본문이 비는 원문을 후보 단계에서 거르기 위한 헬퍼 고정.
 *
 * 실제 사고(2026-07-28 18:06~10:36 KST): masanmam "지진 맞죠?" 원문 1건이
 * 93회 반복 선정되어 12회 연속 0발행을 만들었다. 댓글 54개·killerScore 73으로
 * 앞선 게이트를 전부 통과했지만 본문이 카페 안내문 27자뿐이라 정화하면 0자가 됐다.
 */

/** 사고 당시 실제 원문 본문 */
const INCIDENT_CONTENT = '💗서로 배려하는 마음으로 예쁜 글 부탁드려요💗'
const INCIDENT_TITLE = '지진 맞죠?'

describe('cleanCuratedContent — 카페 안내문만 있는 원문', () => {
  it('실제 사고 원문("지진 맞죠?")은 정화 후 본문이 0자가 된다', () => {
    expect(cleanCuratedContent(INCIDENT_CONTENT)).toBe('')
  })

  it('제목은 정상적으로 남는다 — 본문만 비는 케이스', () => {
    expect(cleanCuratedTitle(INCIDENT_TITLE)).toBe(INCIDENT_TITLE)
  })

  it('빈 문자열·공백만 있는 본문도 0자', () => {
    expect(cleanCuratedContent('')).toBe('')
    expect(cleanCuratedContent('   \n\n  ')).toBe('')
  })
})

describe('cleanCuratedContent — 정상 생활글은 살아남는다', () => {
  it('안내문 뒤에 본문이 있으면 본문이 남는다', () => {
    const raw = `${INCIDENT_CONTENT}\n\n오늘 병원 다녀왔는데 검사 결과가 생각보다 괜찮았어요. 다들 건강 챙기세요.`
    const cleaned = cleanCuratedContent(raw)
    expect(cleaned.length).toBeGreaterThan(0)
    expect(cleaned).toContain('검사 결과가 생각보다 괜찮았어요')
  })

  it('안내문 없는 일반 본문은 그대로 유지', () => {
    const raw = '퇴직하고 나서 아침에 할 일이 없어 한동안 힘들었어요.'
    expect(cleanCuratedContent(raw)).toContain('퇴직하고 나서')
  })

  it('마크다운 강조만 제거하고 텍스트는 보존', () => {
    expect(cleanCuratedContent('**중요한 이야기** 입니다')).toContain('중요한 이야기')
  })
})

describe('hasPublishableBody — 후보 자격 판정', () => {
  it('사고 원문은 후보 자격 없음 (본문 0자)', () => {
    expect(hasPublishableBody(INCIDENT_TITLE, INCIDENT_CONTENT)).toBe(false)
  })

  it('정상 생활글은 후보 자격 있음', () => {
    expect(hasPublishableBody('은퇴 후 하루 일과', '요즘은 아침에 산책부터 시작합니다. 오후엔 도서관에 들러요.')).toBe(true)
  })

  it('제목이 비면 후보 자격 없음', () => {
    expect(hasPublishableBody('', '본문은 충분히 있습니다. 오늘 있었던 일을 적어봅니다.')).toBe(false)
    expect(hasPublishableBody('   ', '본문은 충분히 있습니다.')).toBe(false)
  })

  it('본문이 비면 후보 자격 없음 — 제목이 멀쩡해도', () => {
    expect(hasPublishableBody('멀쩡한 제목입니다', '')).toBe(false)
    expect(hasPublishableBody('멀쩡한 제목입니다', INCIDENT_CONTENT)).toBe(false)
  })

  it('null/undefined가 들어와도 throw하지 않고 false', () => {
    expect(hasPublishableBody(undefined as unknown as string, undefined as unknown as string)).toBe(false)
    expect(hasPublishableBody('제목', null as unknown as string)).toBe(false)
  })
})

describe('cleanCuratedTitle — 제목 정화', () => {
  it('마크다운 기호를 제거한다', () => {
    expect(cleanCuratedTitle('**굵은 제목**')).toBe('굵은 제목')
  })

  it('앞뒤 공백을 제거한다', () => {
    expect(cleanCuratedTitle('  제목입니다  ')).toBe('제목입니다')
  })

  it('마크다운 기호만 있으면 0자', () => {
    expect(cleanCuratedTitle('***')).toBe('')
  })
})
