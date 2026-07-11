import { describe, it, expect } from 'vitest'
import { findAgeFitViolation } from '../../agents/core/age-fit-blocklist'

/** age-fit 기계 필터 — 차단(발화자 타깃 부적합) / 통과(자녀·손주·회상·직업 맥락 오탐 방지) 고정 */

describe('findAgeFitViolation — 차단 대상 (발화자가 40대 중반~60대 여성으로 보기 어려움)', () => {
  const blocked: Array<[string, string]> = [
    // [카테고리 프리픽스, 케이스]
    ['AGE', '20대초부터 아이 둘, 유산까지 생각'],
    ['AGE', '20대 초반인데 벌써 이런 고민을 하네요'],
    ['AGE', '30대 초반 여자입니다 조언 부탁드려요'],
    ['AGE', '35-45세 다이어트 골든타임'],
    ['AGE', '미혼인데 남편될 사람이 이래요'],
    ['STUDENT', '고2 딸 학원 보내는데 고민이에요'],
    ['STUDENT', '고3 아들 수능이 코앞인데'],
    ['STUDENT', '중간고사 준비 때문에 예민해요'],
    ['STUDENT', '기말고사 기간이라 정신없네요'],
    ['STUDENT', '농어촌특별전형을 위해 이사가는건 무리수일까요'],
    ['STUDENT', '학부모 상담 다녀왔어요'],
    ['PARENT', '등하원 도우미 구해요'],
    ['PARENT', '아침마다 등원시키고 출근해요'],
    ['ROMANCE', '소개팅에서 만난 사람이랑 잘 안 돼요'],
    ['ROMANCE', '결혼정보회사 등록할까 고민 중'],
    ['ROMANCE', '남친이 연락이 없어요'],
    ['ROMANCE', '여친이 화가 났는데 이유를 모르겠어요'],
    ['ROMANCE', '남자친구가 프로포즈를 안 해요'],
    ['PARENT', '임신 초기라 조심스러워요'],
    ['PARENT', '출산 준비물 뭐가 필요할까요'],
    ['PARENT', '신생아 키우느라 잠을 못 자요'],
    ['PARENT', '이유식 시작했는데 안 먹어요'],
    ['PARENT', '어린이집 등원시키고 커피 한 잔'],
    ['PARENT', '유치원 방학이라 힘들어요'],
  ]
  it.each(blocked)('%s: "%s" → 차단', (category, text) => {
    const v = findAgeFitViolation(text, '')
    expect(v).not.toBeNull()
    expect(v).toMatch(new RegExp(`^(${category}|AGE|PARENT|STUDENT|ROMANCE):`))
  })

  it('본문에만 위반 신호가 있어도 차단한다', () => {
    expect(findAgeFitViolation('요즘 고민이 많아요', '저는 20대 초반인데 벌써 이런 걱정을 하네요')).not.toBeNull()
    expect(findAgeFitViolation('행복한 하루', '내일 어린이집 준비물을 챙겨야 해요')).not.toBeNull()
  })
})

describe('findAgeFitViolation — 오탐 방지 (자녀/손주/회상/직업/타깃 본인 맥락은 통과)', () => {
  const passed: string[] = [
    '20대 아들 취직 소식이에요',
    '20대 딸 결혼 준비 중이에요',
    '29살 딸이 남친을 데려왔어요',
    '30대 아들이 아직 독립을 안 해요',
    '학원 그만둔 지 30년 됐네요',
    '남편이 학원 강사를 시작했어요',
    '고등학교 동창을 만났어요',
    '고등학교 친구랑 여행 다녀왔어요',
    '고등학교 시절이 그립네요',
    '출산한 지 30년 만에 딸이 결혼해요',
    '출산율 걱정이 많은 요즘이에요',
    '임신인 줄 알았는데 폐경이래요',
    '손주 어린이집 데려다주고 왔어요',
    '손주 유치원 재롱잔치 다녀왔어요',
    '50대 워킹맘 고민 들어주세요',
    '50대 여자인데 다이어트가 안 돼요',
    '60대 남편과 노후 준비 중입니다',
  ]
  it.each(passed)('"%s" → 통과', (text) => {
    expect(findAgeFitViolation(text, '')).toBeNull()
  })

  it('단독 단어는 차단하지 않는다 — 배우자/워킹맘/학원/고등학교', () => {
    expect(findAgeFitViolation('배우자와 대화가 필요해요', '')).toBeNull()
    expect(findAgeFitViolation('워킹맘으로 30년을 살았어요', '')).toBeNull()
    expect(findAgeFitViolation('학원 앞 붕어빵이 맛있네요', '')).toBeNull()
    expect(findAgeFitViolation('고등학교 앞을 지나가다가', '')).toBeNull()
  })

  it('타깃 본인 연령(40대 중반~60대)은 통과한다', () => {
    expect(findAgeFitViolation('40대 중후반이 되니 몸이 달라져요', '')).toBeNull()
    expect(findAgeFitViolation('50대에 새 취미를 시작했어요', '')).toBeNull()
    expect(findAgeFitViolation('갱년기라 잠을 못 자요', '')).toBeNull()
  })
})

describe('findAgeFitViolation — 반환 형식', () => {
  it('위반 시 "카테고리:매칭어" 형식을 반환한다', () => {
    expect(findAgeFitViolation('소개팅 나갔어요', '')).toBe('ROMANCE:소개팅')
    expect(findAgeFitViolation('35-45세 다이어트 골든타임', '')).toMatch(/^AGE:/)
  })
  it('통과 시 null을 반환한다', () => {
    expect(findAgeFitViolation('은퇴 후 연금 관리 어떻게 하세요', '')).toBeNull()
  })
})
