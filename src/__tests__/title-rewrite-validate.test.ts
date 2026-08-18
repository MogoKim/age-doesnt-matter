import { describe, it, expect } from 'vitest'
import {
  validateSeoDescription,
  MIN_DESC_LENGTH,
  MAX_DESC_LENGTH,
} from '../../agents/cafe/title-rewrite-validate'

/**
 * P0-3 — seoDescription 기계 검증 (2026-08-17)
 *
 * ## 왜 이 검증이 있나
 *
 * 신규 발행글의 `seoDescription` 98%가 본문 앞부분 복사다(최근 7일 641건 실측).
 * NULL은 3.3%뿐이라 "빈칸 채우기"가 아니라 **"원문 발췌를 고유 설명으로 덮어쓰기"**가 목적이다.
 * 따라서 이 검증의 핵심은 길이가 아니라 **원문과 얼마나 다른가**다.
 *
 * ## 실패해도 발행과 title 적용을 막지 않는다
 *
 * 검증 실패 시 호출부는 `seoDescription`만 update data에서 제외한다.
 * 값이 없으면 기존 값(원문 발췌)이 남고, 그건 지금까지의 동작과 같다 — 안전한 축퇴다.
 *
 * 설계 문서: docs/seo/experiments/2026-08-17-p0-3-seo-description-rewrite.md
 */

/** 실제 발행글 원문 (2026-08-17 회차) */
const BODY =
  '관둬야 할까요? 저번주 입사했는데 텃새가 빡칠정도로 있네요 제가 나이가 많은데 신입이고 ' +
  '집도가깝고 출퇴근시간도 조정해주셔서 감사한마음으로 다닐려고 했는데 어린놈이 싸가지가.. ' +
  '메모하면 스마트폰으로 하면되지 구식이라는식으로 말하고 한번 알려주고 못하면 개무시하네요'
const ORIGINAL_TITLE = '입사한지 얼마안됐는데 이상한 직원있으면'
const NEW_TITLE = '저번주 입사했는데 어린 직원이 물어보지 말래요'

/** 길이만 채우는 중립 채움말 — 길이 경계 테스트에서 내용 간섭을 없앤다 */
const pad = (s: string, n: number) => (s + ' 그런 마음이 들어 여기에 적어봅니다.'.repeat(20)).slice(0, n)

describe('길이 경계', () => {
  it(`하한은 ${MIN_DESC_LENGTH}자, 상한은 ${MAX_DESC_LENGTH}자다`, () => {
    expect(MIN_DESC_LENGTH).toBe(70)
    // 130→140 (2026-08-18): P0-4 거부 표본 10건 중 DESC_TOO_LONG 8건, 그중 5건이
    // 131~140 — 상한 바로 위에서 좋은 후보가 잘려 원문 발췌가 남았다. 160까지는 열지 않는다.
    expect(MAX_DESC_LENGTH).toBe(140)
  })

  it('69자 → DESC_TOO_SHORT', () => {
    const d = pad('새 직장에서 겪은 일을 적어봅니다.', 69)
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('DESC_TOO_SHORT')
  })

  it('141자 → DESC_TOO_LONG', () => {
    const d = pad('새 직장에서 겪은 일을 적어봅니다.', 141)
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('DESC_TOO_LONG')
  })

  it('70자·140자 경계는 길이로는 통과한다', () => {
    for (const n of [70, 140]) {
      const d = pad('새 직장에서 겪은 일을 적어봅니다.', n)
      expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).not.toBe('DESC_TOO_SHORT')
      expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).not.toBe('DESC_TOO_LONG')
    }
  })

  it('빈 문자열 → EMPTY', () => {
    expect(validateSeoDescription('', NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('EMPTY')
  })
})

describe('★ 원문 복사 차단 — P0-3의 존재 이유', () => {
  it('본문 첫 문장을 그대로 옮기면 reject', () => {
    const d = '관둬야 할까요? 저번주 입사했는데 텃새가 빡칠정도로 있네요 제가 나이가 많은데 신입이고 집도가깝고 출퇴근시간도 조정해주셔서 감사한마음으로 다닐려고 했는데'
    const r = validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('DESC_COPIED_FROM_SOURCE')
  })

  it('본문 앞부분 어절을 재배열해도 reject (유사도)', () => {
    const d = '저번주 입사했는데 텃새가 있네요. 제가 나이가 많은데 신입이고 집도가깝고 출퇴근시간도 조정해주셔서 감사한마음으로 다닐려고 했는데 어린놈이 그러네요.'
    const r = validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('DESC_COPIED_FROM_SOURCE')
  })

  it('★ 실제 현재 값(원문 첫 문장)이 reject 되는지 — 회귀 고정', () => {
    // 실측된 현재 상태. 이런 값이 통과하면 P0-3는 아무 일도 하지 않은 것이다.
    const current = '사람이 사는게 저렇게 많은 물건이 필요할까? 그냥 평범한 예로 음처기, 식세기 비롯해서 요즘엔 편리를 위한 전자제품이나 템들이 너무 많잖아요 그쵸'
    const body = '사람이 사는게 저렇게 많은 물건이 필요할까? 그냥 평범한 예로 음처기, 식세기 비롯해서 요즘엔 편리를 위한 전자제품이나 템들이 너무 많잖아요'
    const r = validateSeoDescription(current, '미니멀리스트 됐나 싶었어요', '자취남 채널 보면서 하는 생각', body)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('DESC_COPIED_FROM_SOURCE')
  })

  it('우리 관점으로 다시 쓴 문장은 통과한다', () => {
    const d = '나이 많은 신입으로 들어갔는데 텃새를 겪고 있습니다. 메모하는 방식까지 지적받으니 마음이 상했고, 계속 다녀야 할지 아니면 그만두는 게 나을지 고민이 깊어집니다.'
    const r = validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY)
    expect(r.ok).toBe(true)
  })
})

describe('★ 제목 반복 차단', () => {
  it('title과 어절이 과도하게 겹치면 DESC_SAME_AS_TITLE', () => {
    const d = '저번주 입사했는데 어린 직원이 물어보지 말래요. 저번주 입사했는데 어린 직원이 물어보지 말래요. 정말 저번주 입사했는데 어린 직원이 물어보지 말래요.'
    const r = validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('DESC_SAME_AS_TITLE')
  })

  it('제목과 다른 각도면 통과 (제목=사건, 설명=맥락)', () => {
    const d = '나이 많은 신입으로 들어가 텃새를 겪는 중입니다. 대표님은 붙잡으시지만 작은 회사라 그 사람과 계속 둘이 일해야 해서 마음이 좀처럼 정리되지 않습니다.'
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).ok).toBe(true)
  })
})

describe('금지어·톤 (제목 검증과 같은 상수 재사용)', () => {
  it.each([
    ['시니어', '시니어 세대가 새 직장에서 겪는 텃새 이야기입니다. 나이 많은 신입이라 더 조심스러운데 계속 다녀야 할지 고민이 깊어지는 상황을 그대로 적어봤습니다.', 'BANNED_WORD'],
    ['어르신', '어르신들이 새 직장에서 겪는 텃새 이야기입니다. 나이 많은 신입이라 더 조심스러운데 계속 다녀야 할지 고민이 깊어지는 상황을 그대로 적어봤습니다.', 'BANNED_WORD'],
  ])('금지어(%s) → %s', (_label, d, reason) => {
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe(reason)
  })

  it('카페명 노출 → CAFE_NAME_LEAK', () => {
    const d = '레몬테라스에서 본 사연입니다. 나이 많은 신입으로 들어가 텃새를 겪는 중이라며 계속 다녀야 할지 모르겠다는 이야기를 그대로 옮겨 적어봅니다.'
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('CAFE_NAME_LEAK')
  })

  it('낚시 표현 → CLICKBAIT', () => {
    const d = '충격적인 직장 텃새 이야기입니다. 나이 많은 신입으로 들어가 겪은 일을 하나씩 그대로 적어보려고 하는데 마음이 아직도 복잡하기만 합니다.'
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('CLICKBAIT')
  })

  it('블로그·기사체 → BLOGGY_OR_NEWSY', () => {
    const d = '직장 텃새 완벽 정리입니다. 나이 많은 신입으로 들어가 겪은 일을 하나씩 차분히 적어보려고 하는데 마음이 아직도 정리되지 않은 상태입니다.'
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('BLOGGY_OR_NEWSY')
  })

  it('의료 단정 → MEDICAL_ASSERTION (약물·시술 + 단정형 결합일 때만)', () => {
    const body = '호르몬제를 먹기 시작했는데 잠이 안 옵니다. 병원에서 검사를 받아봐야 하나 고민하다가 여기에 적어봅니다.'
    const d = '호르몬제를 먹으면 갱년기 불면은 무조건 낫습니다. 병원에 가지 않아도 되니 그대로 따라 해보시길 권해드리며 잠 못 이루는 밤이 사라졌다고 자신 있게 말씀드립니다.'
    expect(validateSeoDescription(d, '잠이 안 와요', '갱년기 불면', body).reason).toBe('MEDICAL_ASSERTION')
  })

  it('약물 언급만 있고 단정이 없으면 통과한다 (과차단 방지)', () => {
    const body = '호르몬제를 먹기 시작했는데 잠이 안 옵니다. 병원에서 검사를 받아봐야 하나 고민하다가 여기에 적어봅니다.'
    const d = '호르몬제를 먹기 시작한 뒤로 잠이 오지 않아 고민입니다. 병원에서 검사를 받아봐야 할지 망설이면서 비슷한 경험을 하신 분들 이야기가 궁금해 적어봤습니다.'
    expect(validateSeoDescription(d, '잠이 안 와요', '갱년기 불면', body).ok).toBe(true)
  })
})

describe('사실 근거 (제목 검증과 같은 로직)', () => {
  it('본문에 없는 숫자 → NUMBER_NOT_IN_SOURCE', () => {
    const d = '입사 27일 만에 텃새를 겪고 있습니다. 나이 많은 신입이라 더 조심스러운데 계속 다녀야 할지 아니면 그만두는 게 나을지 고민이 깊습니다.'
    const r = validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('NUMBER_NOT_IN_SOURCE')
  })

  it('본문에 없는 가족관계 → ENTITY_NOT_IN_SOURCE', () => {
    const d = '며느리가 새 직장에서 텃새를 겪고 있다고 합니다. 나이 많은 신입이라 더 힘들다며 계속 다녀야 할지 모르겠다고 고민을 털어놓았습니다.'
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('ENTITY_NOT_IN_SOURCE')
  })

  it('본문에 없는 직업 → ENTITY_NOT_IN_SOURCE', () => {
    const d = '간호사로 새 직장에 들어가 텃새를 겪는 중입니다. 계속 다녀야 할지 아니면 그만두는 게 나을지 마음이 좀처럼 정리되지 않습니다.'
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).reason).toBe('ENTITY_NOT_IN_SOURCE')
  })

  it('본문에 없는 나이대는 숫자 검증에서 먼저 걸린다', () => {
    // '50대'는 AGE_JOB_PATTERN 이전에 숫자 검증(50)이 잡는다 — 어느 쪽이든 차단되면 된다.
    const d = '50대 신입으로 새 직장에 들어가 텃새를 겪는 중입니다. 계속 다녀야 할지 아니면 그만두는 게 나을지 마음이 정리되지 않습니다.'
    expect(validateSeoDescription(d, NEW_TITLE, ORIGINAL_TITLE, BODY).ok).toBe(false)
  })

  it('원제목에 있던 정보는 허용된다 (근거 = 원제목 + 본문)', () => {
    const body = '오늘로 21일차입니다. 몸무게는 크게 안 줄었는데 식욕이 확실히 줄었어요. 다들 어떠신가요 경험이 궁금합니다.'
    const d = '마운자로 21일차 기록입니다. 몸무게 변화는 크지 않지만 식욕이 확실히 줄어든 걸 느끼며 지내는 중이라 다른 분들 경험도 궁금해집니다.'
    expect(validateSeoDescription(d, '3펜째 후기', '마운자로 3펜째. (21일차)', body).ok).toBe(true)
  })
})
