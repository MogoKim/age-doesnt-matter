import { describe, it, expect } from 'vitest'
import { classifyShadowAge } from '../../agents/cafe/shadow-age-policy'

/**
 * neutral_daily 1차 정책 고정 (2026-07-13)
 * - 허용 근거: 창업자 Google Sheet '우나어 커뮤니티 스크래퍼' 발행 505건 — positive 신호 없는
 *   일상글(음식/생활소비/가전/감정/에피소드)이 사는이야기 발행 실적으로 존재
 * - 차단 유지: 육아/입시/젊은 연령 자기언급/미혼연애/지역거래·홍보
 */

function usableSignal(title: string, content: string): string | null {
  const r = classifyShadowAge(title, content)
  return r.usable ? r.ageSignal : null
}
function rejectReason(title: string, content: string): string | null {
  const r = classifyShadowAge(title, content)
  return r.usable ? null : r.reason
}

describe('NEUTRAL_DAILY 허용 — 창업자 시트 발행 사례 + masanmam 실측 잡담', () => {
  const allowCases: Array<[string, string]> = [
    ['된장찌개 끓였어요 ㅋㅋ', '오늘 저녁 된장찌개 끓였는데 두부 넣으니 맛있네요'],
    ['오늘 저녁은 맛있는 김치볶음밥', '계란후라이 올려서 먹었어요'],
    ['쉑쉑버거 먹엇어용', '오랜만에 나가서 버거 먹고 왔어요'],
    ['사과나무에 사과가', '마당 사과나무에 사과가 열리기 시작했어요'],
    ['저 방금 현대백화점에서 연예인 본것 같아요', '누구였는지 기억이 안 나네요'],
    ['제가 없는 사이 직원이 제 향수를 썼어요', '자리 비운 사이에 뿌린 것 같은데 기분이 그렇네요'],
    ['평소에 음악 틀어두고 생활하시나요?', '저는 조용한 게 더 편하기도 해서요'],
    ['다이슨 에어랩 살까요? 사지말까요???', '비싸니깐 고민 고민 또 고민합니다'],
    ['밥먹고 잠옴ㅠ', '식곤증인지 잠이 쏟아져서 걷고 있습니다'],
    ['홈플러스 이제 끝..ㅠ', '십년넘게 이용하던 홈플러스가 진짜 문닫았네요 환불하러 갔다왔어요'],
  ]
  for (const [title, content] of allowCases) {
    it(`통과(NEUTRAL_DAILY): "${title}"`, () => {
      expect(usableSignal(title, content)).toBe('NEUTRAL_DAILY')
    })
  }
})

describe('POSITIVE 신호는 필수가 아니라 우선순위 마킹', () => {
  it('남편 언급 → POSITIVE', () => {
    expect(usableSignal('남편이 요즘 통 말이 없어요', '결혼 25년차인데 요즘 부쩍 그러네요')).toBe('POSITIVE')
  })
  it('갱년기 언급 → POSITIVE', () => {
    expect(usableSignal('갱년기라 그런지 밤에 잠이 안 와요', '새벽마다 깨서 힘드네요')).toBe('POSITIVE')
  })
})

describe('hard negative 차단 유지 — 육아', () => {
  const cases: Array<[string, string]> = [
    ['임신 초기인데 입덧이 심해요', '먹을 수 있는 게 없네요'],
    ['출산 준비물 뭐가 필요할까요', '처음이라 막막해요'],
    ['신생아 수면 교육 어떻게 하세요', '통잠을 못 자요'],
    ['이유식 거부하는 아기', '어떻게 해야 할까요'],
    ['어린이집 상담 다녀왔어요', '적응을 잘 못하는 것 같아요'],
    ['유치원 발표회 준비', '의상을 만들어야 해요'],
  ]
  for (const [title, content] of cases) {
    it(`차단(HARD): "${title}"`, () => {
      expect(rejectReason(title, content)).toMatch(/^(HARD|PARENT):/)
    })
  }
})

describe('hard/soft negative 차단 유지 — 입시·학원·학생', () => {
  it('수능 (positive 없음) → SOFT 차단', () => {
    expect(rejectReason('수능 도시락 뭐 싸주세요?', '벌써부터 고민이네요')).toMatch(/^(SOFT|STUDENT):/)
  })
  it('학원 (positive 없음) → SOFT 차단', () => {
    expect(rejectReason('학원 숙제가 너무 많아요', '아이가 힘들어하네요')).toMatch(/^(SOFT|STUDENT):/)
  })
  it('중고등 자녀 콤보 → 차단', () => {
    expect(rejectReason('고3 딸 뒷바라지 힘드네요', '입시 스트레스가 저한테도 오네요')).toMatch(/^(SOFT|STUDENT):/)
  })
  it('초등 → HARD 차단', () => {
    expect(rejectReason('초등학생 방학 일정', '어디 보내야 할까요')).toMatch(/^(HARD|PARENT):/)
  })
})

describe('hard negative 차단 유지 — 젊은 연령 자기언급·미혼연애', () => {
  it('"20살입니다" → AGE 차단', () => {
    expect(rejectReason('20살입니다..', '조언 부탁드려요')).toMatch(/^AGE:/)
  })
  it('"30대 초반인데" → AGE 차단', () => {
    expect(rejectReason('고민 있어요', '저는 30대 초반인데 직장을 옮겨야 할지 모르겠어요')).toMatch(/^AGE:/)
  })
  it('"미혼입니다" → AGE 차단', () => {
    expect(rejectReason('창업 고민입니다', '미혼입니다 모아둔 돈으로 가게를 해볼까 해요')).toMatch(/^AGE:/)
  })
  it('남친 → ROMANCE 차단', () => {
    expect(rejectReason('남친이 연락이 없어요', '싸운 것도 아닌데 이러네요')).toMatch(/^ROMANCE:/)
  })
  it('소개팅 → ROMANCE 차단', () => {
    expect(rejectReason('소개팅 나가는데 뭐 입을까요', '너무 떨려요')).toMatch(/^ROMANCE:/)
  })
})

describe('hard negative 차단 유지 — 지역 거래/홍보/공구/동네 Q&A', () => {
  const cases: Array<[string, string]> = [
    ['아기옷 정리해서 팝니다', '상태 좋아요 직거래 원해요'],
    ['에어프라이어 삽니다', '안 쓰시는 분 연락주세요'],
    ['강아지 분양해요', '3개월 됐어요'],
    ['수박 공구 모집합니다', '10통 이상이면 저렴해요'],
    ['화장품 체험단 모집', '후기만 남겨주시면 됩니다'],
    ['창원 피부과 잘하는 곳 추천해주세요', '기미 때문에 가보려고요'],
  ]
  for (const [title, content] of cases) {
    it(`차단(TRADE): "${title}"`, () => {
      expect(rejectReason(title, content)).toMatch(/TRADE:|HARD:/)
    })
  }
})

describe('경계 — 오탐 방지 (EXCLUDE 소거 상속)', () => {
  it('성인 자녀 언급은 통과 (POSITIVE)', () => {
    expect(usableSignal('성인 자녀 어디까지 해줘야 할까요', '취업한 아들인데 아직 용돈을 줘요')).toBe('POSITIVE')
  })
  it('positive 있으면 학원 언급도 통과 (기존 SOFT 규칙 유지)', () => {
    expect(usableSignal('50대에 요리 학원 다니기 시작했어요', '은퇴 준비로 배우고 있어요')).toBe('POSITIVE')
  })
})
