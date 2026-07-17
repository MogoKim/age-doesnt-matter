import { describe, it, expect } from 'vitest'
import { buildHaikuQualityPrompt, parseHaikuQualityDecision, resolveHaikuGateMode, shouldBlockPublish } from '../../agents/cafe/haiku-quality-prompt'

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

  // ── calibration v2 (2026-07-15 창업자 표본 4건) ──
  it('[표본1: lh 애 낳고=REJECT] 무근거 출산·임신은 2030 간주 강 REJECT 지침', () => {
    expect(prompt).toContain('2030 자기발화로 간주')
    expect(prompt).toContain('NEEDS_REVIEW로 미루지 마라')
  })

  it('[표본2: 딸 며느리 차별=PASS] 가족 갈등 사연은 어두운 톤이어도 기본 PASS 후보', () => {
    expect(prompt).toContain('가족 갈등 사연')
    expect(prompt).toContain('갈등 소재 자체를 차단 사유로 쓰지 마라')
  })

  it('[표본3: 50살 여행=PASS] 타깃 연령 자기언급 글의 male_self 단정 금지', () => {
    expect(prompt).toContain('male_self로 단정 금지')
  })

  it('[표본4: 남성 욕망 담론=REJECT] sexualized_age_gap 축 포함', () => {
    expect(prompt).toContain('sexualized_age_gap')
    expect(prompt).toContain('어리고 예쁜 여자')
  })

  it('[보정1 2026-07-16] 현재 양육 우선 규칙 — 가족 갈등 PASS보다 parenting_current가 우선', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('현재 양육 우선 규칙')
    expect(prompt).toContain('가족 갈등 PASS보다 항상 우선')
    expect(prompt).toContain('구몬')
    expect(prompt).toContain('초1,초3 애둘')
    expect(prompt).toContain('가족 갈등이라는 이유로 PASS시키지 마라')
  })
  it('[보정2 2026-07-16] 원카페 호칭·맥락 신호 — 레테님들 등, 일반 님 단독 금지', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('레테님들')
    expect(prompt).toContain('인기글에서 봤는데')
    expect(prompt).toContain("일반적인 '님' 존칭 하나만으로 잡지 마라")
  })
  it('[보정3 2026-07-16] early_marriage_tone — 단어 단독 차단 금지 + 중장년 단서 부재 결합 판정', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('early_marriage_tone')
    expect(prompt).toContain('절대 단독 차단하지 마라')
    expect(prompt).toContain('부부싸움을 양가에 알릴지')
    expect(prompt).toContain('중장년 회고·오래된 부부·성인자녀 맥락이면 PASS')
    expect(prompt).toContain('early_marriage_tone risk를 달았으면 decision을 PASS로 두지 마라')
    expect(prompt).toContain('결혼 20~30년차는 그런 고민을 하지 않는다')
  })
  it('[보정3] 파서가 early_marriage_tone risk 수용', () => {
    const r = parseHaikuQualityDecision(
      '{"decision":"NEEDS_REVIEW","confidence":0.6,"speakerRole":"unknown","risks":["early_marriage_tone"],"reason":"x"}',
    )
    expect(r?.risks).toEqual(['early_marriage_tone'])
  })
  it('[v4 축1 2026-07-17] 연령대 자기 호출 — 30,40대/3040 자기 집단 호출은 REJECT 후보, 타인 지칭 제외', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('연령대 자기 호출')
    expect(prompt).toContain('young_self 계열 REJECT 후보')
    expect(prompt).toContain('"30대 자녀"/"40대 아들"/"30대 후배"처럼 타인을 지칭하는 경우와 "50,60대 분들" 자기 호출은 제외')
  })
  it('[v4 축2] 결혼 연차 산술 — 15년차 이하+미성년 자녀+중장년 단서 부재는 낙관 추정 금지', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('결혼 연차 산술')
    expect(prompt).toContain('40대 중반 이상으로 추정해 PASS시키지 마라')
    expect(prompt).toContain('결혼 13년차 외동자녀')
  })
  it('[v4 축3] 또래 문맥 전이 — 친구/또래의 임신·난임·영유아 문맥은 other_person_story 예외', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('또래 문맥 전이')
    expect(prompt).toContain('6살 애 자랑')
    expect(prompt).toContain('자녀·손주·며느리·사위 세대 이야기는 기존처럼 정상')
  })
  it('신규 risk enum이 파서에서 수용됨 (romance_self·sexualized_age_gap)', () => {
    const r = parseHaikuQualityDecision(
      '{"decision":"REJECT","confidence":0.9,"speakerRole":"unknown","risks":["sexualized_age_gap","romance_self"],"reason":"x"}',
    )
    expect(r?.risks).toEqual(['sexualized_age_gap', 'romance_self'])
  })

  it('본문 2000자 절단', () => {
    const long = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'a'.repeat(5000), boardType: 'STORY' })
    expect(long.length).toBeLessThan(7600) // 2026-07-16 보정 3축으로 고정부 증가 — 본문 절단(2000자) 검증이 목적
  })
})

describe('PR-3 enforcement — shouldBlockPublish (고신뢰 REJECT만 차단)', () => {
  const ok = (over: Record<string, unknown>) => ({
    haikuStatus: 'OK' as const, wouldReject: true, decision: 'REJECT' as const,
    confidence: 0.95, speakerRole: 'parenting_current' as const,
    risks: ['parenting_current' as const], reason: 'x', ...over,
  })
  it('REJECT + conf>=0.9 + 차단 축 risk → 차단 (mode=enforce에서만)', () => {
    expect(shouldBlockPublish(ok({}) as never, 'enforce')).toBe(true)
    expect(shouldBlockPublish(ok({}) as never, 'dryrun')).toBe(false)
    expect(shouldBlockPublish(ok({}) as never, 'off')).toBe(false)
  })
  it('차단 축 전체 — young/romance/sexualized/male/early_marriage/newlywed/cafe_context', () => {
    for (const r of ['young_self', 'romance_self', 'sexualized_age_gap', 'male_self', 'early_marriage_tone', 'newlywed', 'original_cafe_context']) {
      expect(shouldBlockPublish(ok({ risks: [r] }) as never, 'enforce')).toBe(true)
    }
  })
  it('thin/board_mismatch 단독은 REJECT 0.95여도 차단 금지', () => {
    expect(shouldBlockPublish(ok({ risks: ['thin_or_contextless'] }) as never, 'enforce')).toBe(false)
    expect(shouldBlockPublish(ok({ risks: ['board_mismatch'] }) as never, 'enforce')).toBe(false)
    expect(shouldBlockPublish(ok({ risks: ['thin_or_contextless', 'board_mismatch'] }) as never, 'enforce')).toBe(false)
  })
  it('NEEDS_REVIEW는 고위험 risk여도 차단 금지 (전면 차단 아님)', () => {
    expect(shouldBlockPublish(ok({ decision: 'NEEDS_REVIEW' }) as never, 'enforce')).toBe(false)
  })
  it('confidence < 0.9는 차단 금지', () => {
    expect(shouldBlockPublish(ok({ confidence: 0.85 }) as never, 'enforce')).toBe(false)
  })
  it('실패/timeout(ERROR)은 발행 지속 — 차단 금지', () => {
    expect(shouldBlockPublish({ haikuStatus: 'ERROR', error: 'timeout' }, 'enforce')).toBe(false)
  })
  it('정상 글(PASS)은 당연히 차단 금지', () => {
    expect(shouldBlockPublish(ok({ decision: 'PASS', risks: [] }) as never, 'enforce')).toBe(false)
  })
})

describe('resolveHaikuGateMode — 안전 기본값', () => {
  it('enforce/off는 명시 시에만, 미설정·오타는 전부 dryrun(현행 유지)', () => {
    expect(resolveHaikuGateMode('enforce')).toBe('enforce')
    expect(resolveHaikuGateMode(' Enforce ')).toBe('enforce')
    expect(resolveHaikuGateMode('off')).toBe('off')
    expect(resolveHaikuGateMode(undefined)).toBe('dryrun')
    expect(resolveHaikuGateMode('')).toBe('dryrun')
    expect(resolveHaikuGateMode('enforcee')).toBe('dryrun')
    expect(resolveHaikuGateMode('true')).toBe('dryrun')
  })
})
