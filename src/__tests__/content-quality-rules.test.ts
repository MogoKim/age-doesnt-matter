import { describe, it, expect } from 'vitest'
import {
  findSheetContentQualityViolation,
  findStaleSeriesOrReportViolation,
  findOriginalCafeContextViolation,
  findSheetAdOrTradeViolation,
} from '../../agents/core/content-quality-rules'

/**
 * 콘텐츠 품질 rule gate 1차 (PR-1) 고정 — image-router→Sheet→sheet-scraper 경로.
 * 차단 근거: 창업자 숨김 70건 감사 실측 / 통과 근거: 창업자 시트 발행 505건 + 발행 유지글.
 * 발행 시점 고정: 2026-07-14 (KST 화요일, 7월)
 */
const NOW = new Date('2026-07-14T03:00:00Z') // KST 2026-07-14 12:00 화요일

const check = (title: string, content = '') => findSheetContentQualityViolation(title, content, NOW)

describe('차단 — 숨김 실사례 (날짜 스탬프 연재/브리핑/매매일지)', () => {
  const blocked: Array<[string, string]> = [
    ['[26년 5월] 23.74억(+3.52억) / 배당금 377만원', '총 자산 23.74억 / 전월대비 +3.52억'],
    ['7월 8일 삼전, 닉스, 스퀘어 매수', '단기투자 계좌에서 하이닉스 매수 관련입니다'],
    ['6월19일 장전 브리핑 - 반도체 강세', '금일 장전 브리핑 시작하겠습니다'],
    ['5/29 슬기로운 은퇴생활... 도보배달 / 파리날림', '오늘도 길을 나섭니다'],
    ['6/3 슬기로운 은퇴생활 - 도보배달 / 올리브영', '요 며칠 배달일은 마가 낀듯'],
    ['월말기획!! 뚜둥...우주테크 ETF - 과연 누가 왕이 될 상인가?', 'ETF를 출시하면서'],
    ['오늘 시장 정리', '이전글 요약부터 하겠습니다. 지난주 매수 내역은'],
    ['반도체 이야기', '지난글 이어서 계속 정리해봅니다'],
  ]
  for (const [title, content] of blocked) {
    it(`차단: "${title.slice(0, 30)}"`, () => {
      expect(check(title, content)).not.toBeNull()
    })
  }
})

describe('차단 — 광고/체험단/입점 이벤트', () => {
  it('체험단 이벤트', () => {
    expect(check('[체험단이벤트] 하림 오드그로서 극강의 신선함', '체험단 모집합니다')).toMatch(/^AD:/)
  })
  it('입점 기념 이벤트', () => {
    expect(check('한국투자증권 연금 입점 기념 환영 댓글 이벤트', '입점을 기념하여 이벤트에 참여해 주세요')).toMatch(/^AD:/)
  })
})

describe('차단 — 원 카페 흔적', () => {
  it('회원 저격', () => {
    expect(check('XX님 삼전 하닉 사라고 선동 그만하세요 경고합니다', '순진한 회원님들 선동 그만하세요')).toMatch(/^CAFE_CONTEXT:/)
  })
  it('도용 경고 공지', () => {
    expect(check('[필독] 글 도용 주의하세요! (제가 당했어요)', '누군가 글들을 다른 사이트에 올리고 있습니다')).toMatch(/^CAFE_CONTEXT:/)
  })
  it('원 카페 메타 발화', () => {
    expect(check('요즘 아쉬워요', '이 카페에 볼만한 글이 없네요 인기글만 매일 봤었는데')).toMatch(/^CAFE_CONTEXT:/)
  })
  it('댓글 캡쳐 위협', () => {
    expect(check('앞으로 댓글쓸때 조심들 하십시요', '올리시는 모든 댓글 캡쳐 들어갑니다')).toMatch(/^CAFE_CONTEXT:/)
  })
})

describe('차단 — 요일 자기선언 불일치 (발행일 화요일)', () => {
  it('"금요일인데" → 차단', () => {
    expect(check('금요일인데 다들 뭐하시나요??', '여름이라 해가 중천이에요')).toMatch(/^DAY_MISMATCH:/)
  })
  it('"화요일인데"(발행 요일과 일치) → 통과', () => {
    expect(check('화요일인데 벌써 피곤하네요', '한 주가 기네요')).toBeNull()
  })
})

describe('통과 — 미래 예정/과거 회고/기념일 (날짜만으로 차단 금지)', () => {
  const pass: Array<[string, string]> = [
    ['딸만 온다더니', '8월 1일 예비사위도 따라서 놀러오겠답니다'],
    ['자식 자랑 할 곳이 없어서', '6월 30일까지 회사 다녔어요 입사 준비가 힘들었을'],
    ['결혼날짜', '내년 5월 8일에 결혼날짜를 잡았는데 어버이날이라 괜찮을까요?'],
  ]
  for (const [title, content] of pass) {
    it(`통과: "${content.slice(0, 24)}"`, () => {
      expect(check(title, content)).toBeNull()
    })
  }
})

describe('통과 — 지역 생활글 (차단 절대 금지)', () => {
  const pass: Array<[string, string]> = [
    ['동네 맛집 다녀왔어요', '가족들이랑 칼국수집 갔는데 맛있었어요'],
    ['지역 병원 다녀온 후기', '무릎이 아파서 정형외과 다녀왔는데 친절하시더라고요'],
    ['창원 홈플러스 폐점 아쉽네요', '십년넘게 이용하던 곳인데 문을 닫는대요'],
  ]
  for (const [title, content] of pass) {
    it(`통과: "${title}"`, () => {
      expect(check(title, content)).toBeNull()
    })
  }
})

describe('통과 — 무해 일상글', () => {
  const pass: Array<[string, string]> = [
    ['장마철 제습기 고민', '습도가 너무 높아서 제습기를 사야 하나 고민이에요'],
    ['가전 가격이 너무 비싸요', '냉장고 바꾸려는데 가격이 만만치 않네요'],
    ['부부 연금 어떻게 나누세요', '남편 연금이랑 제 연금을 합쳐서 관리할지 고민입니다'],
    ['은퇴 후 매일 걷기 시작했어요', '하루 만 보씩 걷고 있는데 몸이 가벼워졌어요'],
  ]
  for (const [title, content] of pass) {
    it(`통과: "${title}"`, () => {
      expect(check(title, content)).toBeNull()
    })
  }
})

describe('경계 — 함수 단위 원칙 고정', () => {
  it('날짜+매수 결합만 차단, 매수 단독은 통과 ("하닉 고점 대비 1억 잃었어요" 유지 실증)', () => {
    expect(findStaleSeriesOrReportViolation('하닉 고점 대비 1억 잃었어요', '작년에 매수했다가 물렸네요', NOW)).toBeNull()
  })
  it('연월 스탬프는 발행월 일치 시 통과 ("[26년 7월]" 7월 발행)', () => {
    expect(findStaleSeriesOrReportViolation('[26년 7월] 가계부 공유해요', '이번 달 식비 정리', NOW)).toBeNull()
  })
  it('"동네 카페 다녀왔어요"는 카페 메타 아님', () => {
    expect(findOriginalCafeContextViolation('동네 카페 다녀왔어요', '분위기 좋은 커피집 발견했어요')).toBeNull()
  })
  it('"당근마켓의 생활화"(시트 발행 실증)는 거래 아님', () => {
    expect(findSheetAdOrTradeViolation('당근마켓의 생활화', '안 쓰는 물건 정리하는 재미가 있어요')).toBeNull()
  })
})
