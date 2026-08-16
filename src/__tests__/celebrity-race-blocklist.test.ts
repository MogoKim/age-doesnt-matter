import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  findCelebrityScandalSignal,
  findRacialDegradeSignal,
  findCelebrityOrRaceViolation,
  CONTEXT_WINDOW,
} from '../../agents/core/celebrity-race-blocklist'

/**
 * 큐레이션 원문 품질 gate — 실존 인물 사생활·비방 / 국적·인종 비하 (2026-08-17)
 *
 * ## 이 테스트가 지키는 것
 *
 * 1. **결합일 때만 막는다.** 지칭 단독·비하어 단독은 절대 차단하지 않는다.
 *    실측(최근 14일 발행 1,353건): 단독이면 최대 62건(4.6%) 과차단, 결합이면 5건(0.37%).
 *    과차단도 실패다 — "그 배우 연기 잘하더라", "동남아 여행 후기"는 우리가 원하는 글이다.
 *
 * 2. **'배우자' 오탐을 회수한다.** 실측에서 "외도하는사람은 배우자가 싫은걸까요?"가
 *    걸렸다. 우나어 타깃 정중앙 고민글이므로 반드시 통과해야 한다.
 *
 * 3. **원문(CafePost) 기준으로 쓰인다.** 발행본은 리라이팅·정화로 인물 단서가 지워져
 *    놓친다("강*자님" → "강자님"). content-curator의 후보 필터에서만 호출한다.
 */

const long = (s: string) => s + ' '.repeat(0) + '이런저런 이야기를 조금 더 적어봅니다. 오늘 하루도 그럭저럭 지나갔네요.'

describe('축 A — 실존 인물 사생활·비방 (결합일 때만 차단)', () => {
  it('연예인 지칭 + 불륜 → 차단 (실제 발행글 원문)', () => {
    const r = findCelebrityScandalSignal(
      '김민희는 불륜인데도 대단하네요ㅎㅎ',
      '연예 메인에 기사가 딱~ 아직 이혼안한거죠? 음주,마약,불륜,사기 등등 이슈 있는 연예인들은 좀 안나오면 좋겠어요.',
    )
    expect(r).toContain('CELEBRITY_SCANDAL')
    expect(r).toContain('불륜')
  })

  it('⚠️ 알려진 한계 — 마스킹 없는 실명 단독은 잡지 못한다', () => {
    // "김민희"처럼 마스킹 없는 실명은 일반 한글 이름과 구별할 수 없어 패턴으로 잡을 수 없다.
    // 위 글이 차단되는 건 본문의 "연예인들은" 덕분이다. 지칭어가 하나도 없으면 통과한다.
    // 실명 사전을 두는 방법이 있으나 유지비가 크고 오탐 위험이 커 1차에서는 채택하지 않았다.
    expect(findCelebrityScandalSignal('김민희는 불륜인데도 대단하네요', '기사가 떴네요 요지경 세상이네요')).toBeNull()
  })

  it('★ 마스킹 실명(강*자님) + 외박/불륜 맥락 → 차단', () => {
    // 실제 발행된 글. 원문 기준으로는 "배우님"과 "강*자님"이 모두 살아 있다.
    const r = findCelebrityScandalSignal(
      '저만불쾌한가요? 80대 나이드신 여배우님',
      '강*자님..연기잘하시고 뭐..잘알겠는데요 외박하고 불륜저지른 남편 본인이 용서하고살았다고',
    )
    expect(r).toContain('CELEBRITY_SCANDAL')
  })

  it('인물 지칭 + 비방(역겹) → 차단', () => {
    const r = findCelebrityScandalSignal(
      '어디감히 친일파 자손주제에 티비에 나와 활개를 치죠?',
      '이미 알게된 이상 소식을 듣기도 면상보기도 역겹습니다. 연예인이면 방송에 나오지 마시길',
    )
    expect(r).toContain('CELEBRITY_DEFAME')
  })

  it('인물 지칭 + "그만 좀 나왔으면" → 차단', () => {
    const r = findCelebrityScandalSignal('저 배우 왜 자꾸 나오나요', long('저런 연예인은 그만 좀 나왔으면 좋겠어요'))
    expect(r).toContain('CELEBRITY_DEFAME')
  })
})

describe('★ 축 A 오탐 회수 — 이 글들은 반드시 통과해야 한다', () => {
  it('★ "외도하는사람은 배우자가 싫은걸까요?" → 통과 (배우자 ≠ 배우)', () => {
    // 실측 오탐 1건. 우나어 타깃 정중앙 고민글이다.
    expect(
      findCelebrityScandalSignal(
        '외도하는사람은 배우자가 싫은걸까요? 둘다좋은걸까요?',
        long('외도하는사람은 배우자가 싫은걸까요 아니면 둘다 좋은걸까요 궁금합니다'),
      ),
    ).toBeNull()
  })

  it('남편 외도 사연 → 통과 (인물 지칭 없음 — 본인 이야기)', () => {
    expect(
      findCelebrityScandalSignal('남편 외도 때문에 힘듭니다', long('2년 전 알게 됐는데 아직도 화가 안 풀려요')),
    ).toBeNull()
  })

  it('배우 연기 칭찬 → 통과 (스캔들·비방 결합 없음)', () => {
    expect(
      findCelebrityScandalSignal('어제 드라마 봤어요', long('그 배우 연기 정말 잘하더라구요 몰입해서 봤네요')),
    ).toBeNull()
  })

  it('불륜 드라마 감상평(실존 인물 비방 없음) → 통과', () => {
    expect(
      findCelebrityScandalSignal('요즘 보는 드라마', long('불륜 소재라 답답한데 전개가 빨라서 계속 보게 되네요')),
    ).toBeNull()
  })

  it('가수 콘서트 후기 → 통과', () => {
    expect(findCelebrityScandalSignal('콘서트 다녀왔어요', long('좋아하는 가수 공연이라 눈물이 났어요'))).toBeNull()
  })
})

describe('축 B — 국적·인종 비하 (결합일 때만 차단)', () => {
  it('★ 외국인 + 쉰내/냄새 → 차단', () => {
    // 실제 발행된 글.
    const r = findRacialDegradeSignal(
      '제가 속물이고 그럴순있는데',
      '고별전행사하는데 외국인분들이 어마어마했거든요 옆에있는데 쉰내진동을 하는데 티를 그리입어보고',
    )
    expect(r).toContain('RACIAL_DEGRADE')
  })

  it('국적 지칭 + "기본이 안 됨" → 차단', () => {
    const r = findRacialDegradeSignal('마트에서 본 일', long('중국인들이 기본이 안 된 행동을 하더라구요'))
    expect(r).toContain('RACIAL_DEGRADE')
  })

  it('국적 지칭 + 민폐 → 차단', () => {
    expect(findRacialDegradeSignal('버스에서', long('동남아 사람들 민폐가 심해서 불편했어요'))).toContain(
      'RACIAL_DEGRADE',
    )
  })
})

describe('★ 축 B 오탐 회수 — 이 글들은 반드시 통과해야 한다', () => {
  it('해외 여행 후기 → 통과 (비하어 없음)', () => {
    expect(
      findRacialDegradeSignal('미국 여행 다녀왔어요', long('외국인들이 친절해서 기분 좋게 다녀왔습니다')),
    ).toBeNull()
  })

  it('★ "미국 살면서 느낀점" 경계 케이스 → 1차에서는 통과', () => {
    // 마스터 결정(2026-08-17): 해외생활·문화·이민 경험까지 과차단하지 않는다.
    // 본문은 이민 1세대의 가부장성 서술로, 인종 비하보다 세대 차이 서술에 가깝다.
    expect(
      findRacialDegradeSignal(
        '미국 살면서 느낀점',
        '미국엔 대략 만3년 살았음 인구구성 인도 60프로 이상 중국 25프로 지역임 대부분 엔지니어 나머지 라티노 약간의 백인 흑인 타국출신',
      ),
    ).toBeNull()
  })

  it('동남아 여행 후기 → 통과', () => {
    expect(findRacialDegradeSignal('동남아 여행 후기', long('물가도 싸고 음식도 맛있었어요 또 가고 싶네요'))).toBeNull()
  })

  it('다문화 가족 이야기 → 통과', () => {
    expect(
      findRacialDegradeSignal('며느리 이야기', long('며느리가 외국인인데 잘 지내요 김치도 같이 담급니다')),
    ).toBeNull()
  })

  it('음식 냄새 이야기 → 통과 (국적 지칭 없음)', () => {
    expect(
      findRacialDegradeSignal('청국장 끓였는데', long('집에 냄새가 배서 환기를 한참 했네요 그래도 맛있었어요')),
    ).toBeNull()
  })

  it('외국인 며느리 + 음식 냄새가 같이 있어도, 비하 맥락이 아니면 판단은 결합 규칙을 따른다', () => {
    // 결합 규칙상 이건 걸린다. 다만 그 사실을 명시적으로 남겨 향후 정밀화 지점을 표시한다.
    const r = findRacialDegradeSignal('며느리와 김장', '외국인 며느리와 김장했는데 청국장 냄새를 힘들어하네요')
    expect(r).not.toBeNull() // 알려진 한계 — 2차에서 맥락 정밀화 대상
  })
})

describe('단독 매칭은 절대 차단하지 않는다 (과차단 방지 계약)', () => {
  it.each([
    ['인물 지칭 단독', '어제 시상식 봤어요', '배우들이 다 멋있더라구요'],
    ['스캔들 단독', '드라마 줄거리가', '불륜이 소재인데 몰입은 되네요'],
    ['국적 지칭 단독', '옆집 이야기', '외국인 가족이 이사 왔어요 인사도 잘 하시네요'],
    ['비하어 단독', '지하철에서', '어떤 사람이 민폐를 부려서 불편했어요'],
  ])('%s → 통과', (_label, title, content) => {
    expect(findCelebrityOrRaceViolation(title, long(content))).toBeNull()
  })
})

describe('★ 근접성 규칙 — 멀리 떨어진 단어끼리 우연히 결합하지 않는다', () => {
  it(`CONTEXT_WINDOW는 ${CONTEXT_WINDOW}자다 (실측으로 정한 값)`, () => {
    expect(CONTEXT_WINDOW).toBe(60)
  })

  it('지칭어와 비하어가 윈도우 안이면 차단', () => {
    expect(findRacialDegradeSignal('마트에서', '외국인들이 옆에 있는데 쉰내가 진동을 하더라구요')).not.toBeNull()
  })

  it('★ 지칭어와 비하어가 멀리 떨어져 있으면 통과', () => {
    // "미국 살면서 느낀점"의 실제 구조 — 인구 구성 설명(백인/필리핀)과
    // 이민 1세대 서술(미개)이 90자 넘게 떨어져 있어 같은 대상이 아니다.
    const far = `인구구성 인도 60프로 이상 중국 25프로 지역임 대부분 엔지니어 나머지 라티노 약간의 백인 흑인 타국출신 ${'그 밖에 이런저런 이야기가 이어집니다. '.repeat(4)}1세대는 잘나고 못나고를 떠나 솔직히 좀 미개함`
    expect(findRacialDegradeSignal('미국 살면서 느낀점', far)).toBeNull()
  })

  it('★ 제목에 지칭어가 있으면 본문 어디에 있어도 같은 맥락으로 본다', () => {
    // 제목이 대상을 선언한 글이다. 실측 사례("여배우님" 제목 + 본문 '불륜' 80자 거리).
    const body = `강*자님..연기잘하시고 뭐..잘알겠는데요 훌륭하시고요 시대가 변하고있고 그변화에 맞게 나이드신분들도 인식의변화가 있어야죠 외박하고 불륜저지른 남편 본인이 용서하고살았다고`
    expect(findCelebrityScandalSignal('저만불쾌한가요? 80대 나이드신 여배우님', body)).toContain('CELEBRITY_SCANDAL')
  })

  it('제목에 지칭어가 없으면 본문 근접성만 본다', () => {
    // 배우(앞) ↔ 불륜(뒤)이 CONTEXT_WINDOW보다 멀리 떨어져 있어 같은 맥락이 아니다.
    const body = `그 배우는 참 연기를 잘하네요 ${'평범한 문장이 계속 이어집니다. '.repeat(6)}불륜 소재라 답답하네요`
    expect(findCelebrityScandalSignal('드라마 후기', body)).toBeNull()
  })

  it('⚠️ 알려진 한계 — 지칭과 비방이 멀리 떨어진 비방글은 놓친다', () => {
    // 실측: "어디감히 친일파 자손주제에 티비에 나와 활개를 치죠?"
    // 제목에 인물 지칭어가 없고 본문의 '연예인'과 '역겹'이 60자 넘게 떨어져 통과한다.
    // 근접성을 넓히면 "미국 살면서 느낀점"이 다시 걸리는 트레이드오프라 1차에서는 감수한다.
    const body = `연예인이면 방송에 나오는 게 일이지요 ${'그리고 이런저런 이야기가 이어집니다. '.repeat(5)}소식을 듣기도 역겹습니다`
    expect(findCelebrityScandalSignal('어디감히 친일파 자손주제에 티비에 나와 활개를 치죠?', body)).toBeNull()
  })
})

describe('구조 계약 — 원문(CafePost) 후보 필터에서만 호출된다', () => {
  const CURATOR = readFileSync(resolve(__dirname, '../../agents/cafe/content-curator.ts'), 'utf8')

  it('content-curator가 findCelebrityOrRaceViolation을 import한다', () => {
    expect(CURATOR).toMatch(/import \{[^}]*findCelebrityOrRaceViolation[^}]*\} from '\.\.\/core\/celebrity-race-blocklist\.js'/)
  })

  it('★ getReferencePosts 후보 필터(원문 기준) 안에서 호출된다', () => {
    const start = CURATOR.indexOf('async function getReferencePosts')
    const end = CURATOR.indexOf('\nfunction applySensitiveBoardOverride')
    expect(start).toBeGreaterThan(-1)
    const block = CURATOR.slice(start, end > start ? end : undefined)
    expect(block).toContain('findCelebrityOrRaceViolation(p.title, p.content)')
  })

  it('★ 발행 생성물(curated) 기준이 아니라 원문(p.title/p.content) 기준이다', () => {
    // 생성물 기준으로 검사하면 리라이팅·정화로 인물 단서가 지워져 놓친다.
    expect(CURATOR).not.toContain('findCelebrityOrRaceViolation(curated.title')
    expect(CURATOR).toContain('findCelebrityOrRaceViolation(p.title, p.content)')
  })

  it('호출부는 한 곳뿐이다', () => {
    expect((CURATOR.match(/findCelebrityOrRaceViolation\(/g) ?? []).length).toBe(1)
  })

  it('★ title-rewrite-gate에서는 호출하지 않는다', () => {
    const GATE = readFileSync(resolve(__dirname, '../../agents/cafe/title-rewrite-gate.ts'), 'utf8')
    expect(GATE).not.toContain('celebrity-race-blocklist')
    expect(GATE).not.toContain('findCelebrityOrRaceViolation')
  })
})
