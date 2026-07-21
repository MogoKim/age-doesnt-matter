import { describe, it, expect } from 'vitest'
import { classifyNearMissQuery } from '../../agents/magazine/keyword-research/gsc-nearmiss'

/**
 * 우나어 SEO 화이트 검색어 기준표 v2 — 타깃 게이트 계약 고정 (2026-07-21 창업자 확정).
 * 픽스처는 GSC 도메인 속성 near-miss 실측 70개 + universe 1,188개 검증에서 추출.
 */

describe('전처리 — 공백·대소문자 무관', () => {
  it('"50 대" / "국민 연금" 공백 변형 흡수', () => {
    expect(classifyNearMissQuery('50 대 커뮤니티')).toBe('pass_conditional')
    expect(classifyNearMissQuery('국민 연금 조기 수령')).toBe('pass')
    expect(classifyNearMissQuery('퇴직금 IRP 해지')).toBe('pass')
  })
})

describe('1. 반드시 통과 — 고유 주제어 (연령어 불필요)', () => {
  const cases = [
    '갱년기 증상', '폐경 나이', '완경 이후', '안면홍조 원인', '식은땀 이유',
    '갱년기 불면', '질건조 관리', '여성 호르몬 후기', '골다공증 검사', '요실금 운동',
    '오십견 스트레칭', '무릎 관절 운동', '대장내시경 준비', '갑상선 결절',
    '남편 은퇴 후', '시댁 갈등', '며느리 도리', '손주 용돈', '빈둥지 증후군', '황혼 재혼',
    'irp 계좌 해지', 'isa 계좌', '기초연금 수급자격', '경력단절 취업', '요양보호사 자격증',
    '노안 교정', '여성 탈모 원인',
  ]
  for (const c of cases) it(`통과: ${c}`, () => expect(classifyNearMissQuery(c)).toBe('pass'))
})

describe('2. 조건부 통과 — 연령어+범용어 결합', () => {
  it('결합은 통과', () => {
    expect(classifyNearMissQuery('50대 여행')).toBe('pass_conditional')
    expect(classifyNearMissQuery('60대 알바')).toBe('pass_conditional')
    expect(classifyNearMissQuery('중장년 패션')).toBe('pass_conditional')
    expect(classifyNearMissQuery('쿠팡 알바 60대')).toBe('pass_conditional')
    expect(classifyNearMissQuery('40대 커뮤니티')).toBe('pass_conditional')
  })
  it('범용어 단독은 자동 통과 금지 (needs_review drop)', () => {
    expect(classifyNearMissQuery('여행')).toBe('needs_review')
    expect(classifyNearMissQuery('알바')).toBe('needs_review')
    expect(classifyNearMissQuery('패션 코디')).toBe('needs_review')
  })
  it('연령어 단독도 자동 통과 금지', () => {
    expect(classifyNearMissQuery('50대')).toBe('needs_review')
  })
})

describe('3. 차단', () => {
  it('연예/이슈/잡학 (실측 대표)', () => {
    for (const c of ['김부장 노잼', '송하윤 근황', '황정민 거상', '김신영 냄비', '걸레릭', '바질김치', '만나이', '벤치 40kg', '난초 꽃말']) {
      expect(classifyNearMissQuery(c)).toBe('blocked')
    }
  })
  it('연령어+함정어(연예 리스트) 결합도 차단', () => {
    expect(classifyNearMissQuery('50대 여자 배우 리스트')).toBe('blocked')
    expect(classifyNearMissQuery('50대 여자 트로트 가수')).toBe('blocked')
  })
  it('브랜드 쿼리', () => {
    expect(classifyNearMissQuery('우리 나이가 어때서')).toBe('blocked')
    expect(classifyNearMissQuery('우나어')).toBe('blocked')
  })
  it('법률 세부 — 황혼이혼 자체는 허용, 소송/재산분할 결합만 차단', () => {
    expect(classifyNearMissQuery('황혼이혼')).toBe('pass')
    expect(classifyNearMissQuery('황혼이혼 재산분할')).toBe('blocked')
    expect(classifyNearMissQuery('이혼 소송 절차')).toBe('blocked')
  })
  it('의약품/성분/부작용/직구 — 염색약은 오탐 금지', () => {
    expect(classifyNearMissQuery('남대문시장 멜라토닌')).toBe('blocked')
    expect(classifyNearMissQuery('2080 치약 불소')).toBe('blocked')
    expect(classifyNearMissQuery('갱년기 영양제 부작용')).toBe('blocked')
    expect(classifyNearMissQuery('무릎 관절 통증 약')).toBe('blocked')
    expect(classifyNearMissQuery('흰머리 염색약 추천')).not.toBe('blocked') // 염색약 ≠ 의약품
  })
  it('젊은층 — 탈모+20대 결합도 차단', () => {
    expect(classifyNearMissQuery('여성탈모 20대')).toBe('blocked')
    expect(classifyNearMissQuery('대학생 커뮤니티')).toBe('blocked')
    expect(classifyNearMissQuery('50 살 수능')).toBe('blocked')
  })
  it('행정서류/잡음 (universe 실측)', () => {
    expect(classifyNearMissQuery('가족 관계 증명서 다운로드 방법')).toBe('blocked')
    expect(classifyNearMissQuery('자기효능감 중요성')).toBe('blocked')
  })
})

describe('4. 수동검토 — drop + needsReview 로그', () => {
  it('고등 학부모', () => {
    expect(classifyNearMissQuery('고3 아들 학원 라이딩 준비')).toBe('needs_review')
  })
  it('50대 남자 심리', () => {
    expect(classifyNearMissQuery('50대 남자 심리')).toBe('needs_review')
  })
})

describe('5. 실측 오탐 회귀 방지 (universe 검증에서 발견)', () => {
  it('"대처 방법"이 "처방"으로 오탐되지 않는다', () => {
    expect(classifyNearMissQuery('갱년기 대처 방법')).toBe('pass')
  })
  it('영양제 "추천"은 타깃 쿼리 — 부작용 결합만 차단', () => {
    expect(classifyNearMissQuery('갱년기 영양제 추천')).toBe('pass')
    expect(classifyNearMissQuery('갱년기 영양제 부작용')).toBe('blocked')
  })
  it('탈모 단독 CORE 금지 — 인명+탈모 차단, 여성/중년 결합만 통과', () => {
    expect(classifyNearMissQuery('빈살만 탈모')).toBe('blocked')
    expect(classifyNearMissQuery('여성 탈모 원인')).toBe('pass')
    expect(classifyNearMissQuery('갱년기 탈모')).toBe('pass')
  })
})
