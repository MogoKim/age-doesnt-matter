import { describe, it, expect } from 'vitest'
import { BLOCKING_RISKS, buildHaikuQualityPrompt, parseHaikuQualityDecision, resolveHaikuGateMode, shouldBlockPublish } from '../../agents/cafe/haiku-quality-prompt'

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
  // ── [2026-08-14] parenting_current 오탐 완화 — 차단 로그 90일 감사 결과 ──
  // 감사 사실: 차단 1,929건 중 parenting_current 68건(7일 표본)은 71%가 정탐이었다.
  // 명확한 오탐은 "고2 아이 여행 보내도 될까요"류 — 프롬프트에 이미 고등 예외가 있는데도 REJECT됐다.
  // 그래서 규칙을 뒤집지 않고 **경계만** 명확히 한다. BLOCKING_RISKS·차단 구조는 그대로다.
  it('[관계 보호 2026-08-14] 타인의 자녀·조카·손주는 화자 본인 양육이 아니다', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('적용 주체 한정')
    expect(prompt).toContain('화자 본인이 양육 중일 때만')
    expect(prompt).toContain('타인의 자녀·조카·손주')
    expect(prompt).toContain('parenting_current를 붙이지 마라')
    // 시누·올케·동서는 관계축 — 50대 여성 커뮤니티 핵심 콘텐츠다
    expect(prompt).toContain('시누·올케·동서')
    expect(prompt).toContain('관계글로 PASS 후보')
    // 단, 본인 자녀 신호가 별도로 있으면 기존 원칙 유지 (정탐 71%를 흔들지 않는다)
    expect(prompt).toContain('화자 본인의 영유아~중등 자녀 신호가 별도로 있으면')
  })
  it('[고등 예외 경계 2026-08-14] 외출·독립 고민은 PASS, 입시·학원 관리는 REJECT 유지', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('예외의 경계 명확화')
    // 살리는 쪽 — 정답 표본("여고딩끼리 가평 빠지")과 같은 유형
    expect(prompt).toContain('외출·여행·친구관계·독립·간섭 고민')
    expect(prompt).toContain('고2 아이 1박2일 여행')
    // 계속 막는 쪽 — 교육 관리 주체
    expect(prompt).toContain('입시·학원·과외·성적 관리 현재형')
    expect(prompt).toContain('parenting_current REJECT 유지')
    // 애매하면 차단이 아니라 보류 — 좋은 관계글 손실이 더 크다
    expect(prompt).toContain('REJECT가 아니라 NEEDS_REVIEW로 두어라')
  })
  it('[구조 불변 2026-08-14] BLOCKING_RISKS에 parenting_current 유지 · thin_or_contextless 미포함', () => {
    // 이번 보정은 프롬프트 문구만 건드린다. 차단 구조는 그대로여야 한다.
    expect(BLOCKING_RISKS).toContain('parenting_current')
    expect(BLOCKING_RISKS).not.toContain('thin_or_contextless')
    expect(BLOCKING_RISKS).not.toContain('board_mismatch')
  })
  it('[구조 불변 2026-08-14] 학령기 육아는 계속 차단된다 (고신뢰 + 차단축)', () => {
    const kid = parseHaikuQualityDecision(
      '{"decision":"REJECT","confidence":0.95,"speakerRole":"parenting_current","risks":["parenting_current"],"reason":"초2 자녀 현재 양육"}',
    )!
    expect(shouldBlockPublish({ haikuStatus: 'OK', wouldReject: true, ...kid }, 'enforce')).toBe(true)
  })
  it('[구조 불변 2026-08-14] 관계글이 PASS면 차단되지 않는다', () => {
    const rel = parseHaikuQualityDecision(
      '{"decision":"PASS","confidence":0.9,"speakerRole":"target_woman_45_60","risks":[],"reason":"시누 관계 갈등"}',
    )!
    expect(shouldBlockPublish({ haikuStatus: 'OK', wouldReject: false, ...rel }, 'enforce')).toBe(false)
  })
  it('[구조 불변 2026-08-14] NEEDS_REVIEW는 차단하지 않는다 (경계 사례 보호)', () => {
    const amb = parseHaikuQualityDecision(
      '{"decision":"NEEDS_REVIEW","confidence":0.95,"speakerRole":"unknown","risks":["parenting_current"],"reason":"경계"}',
    )!
    expect(shouldBlockPublish({ haikuStatus: 'OK', wouldReject: false, ...amb }, 'enforce')).toBe(false)
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
  it('[v5 2026-07-19] 고등 자녀 예외 — 고딩 학부모 시점은 타깃, 학생 본인·3040·초중등 병행은 예외 아님', () => {
    const prompt = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'c', boardType: 'STORY' })
    expect(prompt).toContain('고등 자녀 예외')
    expect(prompt).toContain('차단 범위는 영유아~중등까지다')
    expect(prompt).toContain('여고딩끼리 가평')
    expect(prompt).toContain('학생 본인 1인칭 발화')
    expect(prompt).toContain('초등~중등 형제 병행 양육 동반')
  })
  it('신규 risk enum이 파서에서 수용됨 (romance_self·sexualized_age_gap)', () => {
    const r = parseHaikuQualityDecision(
      '{"decision":"REJECT","confidence":0.9,"speakerRole":"unknown","risks":["sexualized_age_gap","romance_self"],"reason":"x"}',
    )
    expect(r?.risks).toEqual(['sexualized_age_gap', 'romance_self'])
  })

  it('본문 2000자 절단', () => {
    const long = buildHaikuQualityPrompt({ cafePostId: 'x', title: 't', content: 'a'.repeat(5000), boardType: 'STORY' })
    expect(long.length).toBeLessThan(8600) // 2026-07-16 보정 3축으로 고정부 증가 — 본문 절단(2000자) 검증이 목적
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
