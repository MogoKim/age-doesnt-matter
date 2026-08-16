import { describe, it, expect } from 'vitest'
import {
  evaluateTitleRewriteCandidate,
  partitionTitleRewriteCandidates,
  TITLE_REWRITE_SOURCES,
  type RewriteGateInput,
} from '../../agents/cafe/title-rewrite-gate'
import { MIN_BODY_LENGTH_FOR_REWRITE } from '../../agents/cafe/title-rewrite-rules'
import { PUBLISHABLE_CAFE_IDS, SHADOW_CAFE_IDS } from '../../agents/cafe/config'

/**
 * 제목 리라이팅 후보 gate — Sonnet 호출 **전** 필터.
 *
 * ⚠️ 이건 발행 차단 gate가 아니다. 여기서 제외돼도 글은 정상 발행되고 제목만 원문 그대로 나간다.
 *   실측(2026-08-14 발행 652건): 33%가 리라이팅 대상이 아니고 28%는 본문 80자 미만이었다.
 *
 * 이 테스트가 지키는 것
 *   · 좋은 관계글·연예수다·노후글을 잃지 않는다 (과차단이 North Star에 더 해롭다)
 *   · 광고·뉴스·학령기 육아·타깃 이탈 글에 Sonnet 비용을 쓰지 않는다
 */

/**
 * 판정 신호가 하나도 없는 중립 꼬리말.
 * 픽스처 본문을 80자 기준 위로 안전하게 올리기 위한 것 — 관계·우리나이·연예·광고·뉴스·육아
 * 어느 축에도 걸리지 않는 문장만 쓴다(꼬리말이 판정을 바꾸면 테스트가 무의미해진다).
 */
const NEUTRAL_TAIL =
  ' 별다른 뜻은 없고 그냥 이런저런 생각이 들어서 몇 자 적어봤습니다. 다들 좋은 하루 보내시길 바랄게요.'

/** 본문을 80자 기준 위로 확실히 올린다 */
const pad = (body: string): string => body + NEUTRAL_TAIL

const base = (over: Partial<RewriteGateInput> = {}): RewriteGateInput => ({
  cafeId: 'wgang',
  title: '오늘 하루',
  content: pad('오늘 하루가 참 길게 느껴지네요. 별일은 없었는데 마음이 좀 그렇습니다.'),
  author: '동네주민',
  isUsable: true,
  commentCrawled: true,
  commentCount: 7,
  ...over,
})

describe('title-rewrite-gate — 기본 계약', () => {
  it('gate가 허용하는 source는 발행 가능 카페(PUBLISHABLE_CAFE_IDS)다', () => {
    // 2026-08-16 확대: 여기에 ['wgang']이 하드코딩돼 있어 vars로 source를 늘려도
    // gate가 NOT_TARGET_SOURCE로 다시 막았다. 범위 조절은 vars, 안전선은 gate로 나눴다.
    expect(TITLE_REWRITE_SOURCES).toEqual(PUBLISHABLE_CAFE_IDS)
    expect(TITLE_REWRITE_SOURCES.length).toBeGreaterThan(0)
  })

  it('★ shadow는 gate 허용 목록에 절대 들어가지 않는다', () => {
    const overlap = SHADOW_CAFE_IDS.filter(id => TITLE_REWRITE_SOURCES.includes(id))
    expect(overlap).toEqual([])
  })

  it('본문 최소 길이는 80자 (발행 차단선이 아니라 리라이팅 후보 기준)', () => {
    expect(MIN_BODY_LENGTH_FOR_REWRITE).toBe(80)
  })

  it('제외되어도 발행 차단이 아님을 detail이 밝힌다', () => {
    const r = evaluateTitleRewriteCandidate(base({ content: '짧아요' }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('BODY_TOO_SHORT')
    expect(r.detail).toContain('발행은 그대로 된다')
  })
})

describe('★ source 확대 — 5개 publishable source가 source 단계를 통과한다 (2026-08-16)', () => {
  /**
   * 확대 전에는 wgang 외 전부 NOT_TARGET_SOURCE였다. 그 결과 vars를 5개로 늘려도
   * 실제로는 한 건도 리라이팅되지 않았다(21:50 회차 실측: GATE_REJECTED 3건).
   * 여기서 고정하는 것은 "source 단계를 통과한다"까지다 — 본문·광고·나이·의료 게이트는 그대로 적용된다.
   */
  it.each(['wgang', 'dlxogns01', 'remonterrace', 'goondae', 'masanmam'])(
    '%s는 source 때문에 막히지 않는다',
    (cafeId) => {
      const r = evaluateTitleRewriteCandidate(base({ cafeId }))
      expect(r.reason).not.toBe('NOT_TARGET_SOURCE')
      expect(r.reason).not.toBe('SHADOW_SOURCE')
    },
  )

  it('5개 source 전부 PUBLISHABLE_CAFE_IDS에 실제로 등록돼 있다', () => {
    for (const id of ['wgang', 'dlxogns01', 'remonterrace', 'goondae', 'masanmam']) {
      expect(PUBLISHABLE_CAFE_IDS).toContain(id)
    }
  })

  it('★ source를 통과해도 다른 gate 조건은 그대로 적용된다', () => {
    // 확대가 "무조건 통과"가 되면 안 된다 — 본문 길이·광고 등은 여전히 막아야 한다.
    const short = evaluateTitleRewriteCandidate(base({ cafeId: 'remonterrace', content: '짧은 글' }))
    expect(short.eligible).toBe(false)
    expect(short.reason).toBe('BODY_TOO_SHORT')

    const ad = evaluateTitleRewriteCandidate(base({ cafeId: 'dlxogns01', author: '아너스티성형외과' }))
    expect(ad.eligible).toBe(false)
  })
})

describe('title-rewrite-gate — ✅ PASS (Sonnet 비용을 쓸 가치가 있는 글)', () => {
  const passCases: [string, RewriteGateInput][] = [
    ['관계 갈등 — 시누', base({
      title: '유럽여행 같이 가자는 시누',
      content: pad('시누가 자기도 같이 가자네요. 저는 여행이 더 힘들어질 것 같아 걱정인데 남편 눈치가 보여서 거절을 못 하겠어요. 다들 이런 경우 어떻게 하셨나요.'),
    })],
    ['관계 갈등 — 남편', base({
      title: '인정하지 못하는 남편',
      content: pad('결혼 25년째인데 남편은 자기가 틀렸다는 말을 한 번도 안 해요. 서운한 마음이 쌓이니까 이제는 대화도 하기 싫어지네요. 다들 어떻게 지내시는지요.'),
    })],
    ['몸의 변화 — 폐경·요실금', base({
      title: '요실금 증상이 심해지는 거 같아요 ㅠㅠ',
      content: pad('폐경 진단 받고 나서부터 여기저기 아프기 시작하네요. 요즘 들어 요실금 증상이 점점 심해지는 것 같아 병원을 가봐야 하나 고민입니다.'),
    })],
    ['건강 — 검진 고민', base({
      title: '국가검진 우울증',
      content: pad('국가검진 우울증 체크리스트를 보니 몇 가지 해당되는 것 같은데 남편이랑 같이 받아서 다 아니라고 체크했어요. 정확히 검사받고 싶은데 어디로 가야 할까요.'),
    })],
    ['연예·방송 수다', base({
      title: '어제 그 드라마 보셨어요?',
      content: pad('어제 방송한 드라마 마지막 장면에서 배우 표정이 너무 좋더라고요. 다들 보셨는지 궁금해서요. 요즘 이만한 작품이 없는 것 같아요. 예능도 재밌게 보고 있어요.'),
    })],
    ['노후 준비 — "노년" 단어 포함해도 PASS', base({
      title: '노년에 어디서 사시겠습니까?(24평신축 VS 34평구축)',
      content: pad('15년 넘은 구축이지만 34평이고 소유한 집이라 취득세가 안 듭니다. 신축 24평은 역세권인데 취득세가 발생하고요. 노후를 어디서 보낼지 고민이 깊습니다.'),
    })],
    ['분노 섞인 생활글', base({
      title: '살다보니 별의별 일이 다 있습니다',
      content: pad('모임에서 어떤 사람이 저를 모함해서 일이 꼬였습니다. 기가 막히고 어이가 없었는데 결국 변호를 알아보고 있어요. 정말 화가 나서 잠이 안 옵니다.'),
    })],
    ['뷰티 후기', base({
      title: '피부 좋아지려면..',
      content: pad('매일 팩을 합니다. 유튜브에서는 주 두세 번이 적당하다는데 저는 매일 해요. 그런데도 나이가 드니 자꾸 잡티가 올라오네요. 다들 어떻게 관리하시는지 궁금합니다.'),
    })],
    ['부모 돌봄', base({
      title: '어제 친정 엄마랑 밥 먹는데',
      content: pad('친정 엄마랑 식사를 했는데 동네 가게 사장님이 엄마를 아시더라고요. 연세가 많으신데도 계속 일을 하시는 걸 보니 마음이 좀 그랬습니다. 여러 생각이 들더라고요.'),
    })],
  ]
  it.each(passCases)('%s → 후보 통과', (_label, input) => {
    const r = evaluateTitleRewriteCandidate(input)
    expect(r.reason).toBeNull()
    expect(r.eligible).toBe(true)
  })

  it('통과 시 보호 신호를 함께 돌려준다 (검수 참고용)', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '요실금 때문에 병원 가봐야 할까요',
      content: pad('폐경 이후로 계속 신경이 쓰이네요. 남편한테는 말도 못 하고 혼자 끙끙 앓고 있습니다. 비슷한 경험 있으신 분 조언 좀 부탁드려요.'),
      desireCategory: 'HEALTH',
      emotionTags: ['ANXIOUS'],
      commentCount: 12,
    }))
    expect(r.eligible).toBe(true)
    expect(r.signals).toContain('우리나이주제')
    expect(r.signals).toContain('성인관계')
    expect(r.signals).toContain('desire:HEALTH')
    expect(r.signals.some(s => s.startsWith('댓글'))).toBe(true)
  })
})

describe('title-rewrite-gate — ❌ REJECT (모델 호출 전 제외)', () => {
  it('yeowooya는 shadow 관찰 중이라 제외', () => {
    const r = evaluateTitleRewriteCandidate(base({ cafeId: 'yeowooya' }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('SHADOW_SOURCE')
  })

  it('★ yeowooya는 gate 허용 목록에도 없어 이중으로 막힌다', () => {
    // SHADOW_CAFE_IDS 체크를 지우더라도 PUBLISHABLE 미포함으로 NOT_TARGET_SOURCE가 된다.
    expect(SHADOW_CAFE_IDS).toContain('yeowooya')
    expect(TITLE_REWRITE_SOURCES).not.toContain('yeowooya')
  })

  it.each(['unknown-cafe', 'not-registered', ''])('config 미등록 cafeId(%s)는 NOT_TARGET_SOURCE', (cafeId) => {
    // allowlist 방식이라 "명시적으로 허용될 때까지 차단"이 기본값이다.
    const r = evaluateTitleRewriteCandidate(base({ cafeId }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('NOT_TARGET_SOURCE')
  })

  it('본문 80자 미만 제외', () => {
    const r = evaluateTitleRewriteCandidate(base({ content: '오늘 날씨가 좋네요. 다들 뭐 하세요?' }))
    expect(r.reason).toBe('BODY_TOO_SHORT')
  })

  it('isUsable=false 제외', () => {
    expect(evaluateTitleRewriteCandidate(base({ isUsable: false })).reason).toBe('NOT_USABLE')
  })

  const rejectCases: [string, string, RewriteGateInput][] = [
    ['체험단 모집', 'AD_OR_EVENT', base({
      title: '신제품 체험단 모집합니다',
      content: pad('이번에 새로 나온 제품 체험단을 모집합니다. 신청서를 작성해 주시면 추첨을 통해 선정해 드립니다. 많은 참여 부탁드려요.'),
    })],
    ['댓글 이벤트 공지', 'AD_OR_EVENT', base({
      title: '🔍장보기 귀찮을 때 꺼내 먹는 비상식량 알려주세요!! 💬댓글 이벤트💬',
      content: pad('여러분의 댓글이 모이면 상품을 받아가실 수 있습니다. 매일 업로드되는 키워드에 맞춰 댓글을 달아주세요. 참여해 주시면 감사하겠습니다.'),
    })],
    ['업체 홍보 — 변호사', 'AD_OR_EVENT', base({
      title: '남양주형사전문변호사 선임, 법률 상담 비교는',
      content: pad('갑작스러운 형사 사건에 연루되었을 때 느끼는 중압감은 이루 말할 수 없습니다. 형사 절차에서는 초기 대응이 매우 중요합니다.'),
    })],
    ['병원 계정 홍보', 'MEDICAL_AD', base({
      title: '💜 상담 당일 가슴성형은 유앤유성형외과 💜',
      author: '유앤유성형외과',
      content: pad('가슴 전문 원장님만 네 분이 계시고 듀얼 상담 시스템을 운영합니다. 전신마취 검사부터 한 곳에서 가능합니다. 24시간 응급콜도 운영합니다.'),
    })],
    ['뉴스 스크랩 표기', 'NEWS_SCRAP', base({
      title: '[공유] "지방에 전세 못 얻어…이직할 것" 국책은행 직원들의 고민',
      content: pad('지방 이전을 앞둔 국책은행 직원들이 전세를 구하지 못해 이직을 고민하고 있다는 내용입니다. 기사 내용을 공유해 봅니다. 다들 어떻게 보시나요.'),
    })],
    ['언론사+기사표기', 'NEWS_SCRAP', base({
      title: '2년 뒤 전세계 기업 절반이 중국 AI 쓴다',
      content: pad('연합뉴스 기자가 보도한 내용입니다. https://example.co.kr 2년 안에 전 세계 기업 절반이 중국 인공지능 모델을 채택할 것이라는 전망이 나왔습니다.'),
    })],
    ['학령기 육아 — 초등', 'PARENTING_CURRENT', base({
      title: '초등학생 아이 학원비가 너무 부담돼요',
      content: pad('초등학생 아이 둘을 키우는데 학원비만 매달 백만 원이 넘게 나갑니다. 줄이자니 뒤처질까 걱정되고 계속하자니 부담이 큽니다. 다들 어떻게 하시나요.'),
    })],
    ['학령기 육아 — 수능', 'PARENTING_CURRENT', base({
      title: '수능 앞두고 아이 관리 어떻게 하세요',
      content: pad('수능이 얼마 안 남았는데 아이가 자꾸 흔들리네요. 학원 숙제도 밀리고 성적도 떨어지고 있어서 걱정이 많습니다. 경험 있으신 분 조언 부탁드려요.'),
    })],
    ['20~30대 화자 — 신혼', 'YOUNG_SELF', base({
      title: '신혼인데 시댁 방문이 너무 부담돼요',
      content: pad('결혼한 지 얼마 안 됐는데 시댁에서 매주 오라고 하십니다. 아직 어색하기도 하고 주말마다 가려니 힘드네요. 결혼 초기에는 다들 이러신가요.'),
    })],
    ['남성 화자', 'MALE_SELF', base({
      title: '와이프한테 한소리 들었네요',
      content: pad('제 아내가 요즘 부쩍 예민해진 것 같습니다. 뭘 해도 마음에 안 들어 하는데 어떻게 해야 할지 모르겠어요. 조언 좀 부탁드립니다. 남자입니다.'),
    })],
  ]
  it.each(rejectCases)('%s → %s', (_label, expected, input) => {
    const r = evaluateTitleRewriteCandidate(input)
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe(expected)
  })
})

describe('title-rewrite-gate — ★ 경계 케이스 (과차단 방지)', () => {
  it('"노년" 단어만으로 제외하지 않는다 — 노후 준비는 좋은 후보다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '노년 준비 어떻게들 하고 계세요',
      content: pad('연금만으로는 부족할 것 같아서 요즘 노후 준비를 다시 들여다보고 있습니다. 보험도 정리하고 지출도 줄여보려는데 쉽지가 않네요. 조언 부탁드려요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('시누·조카 자녀가 언급돼도 화자 본인 양육이 아니면 살린다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '시조카 돌잔치 꼭 가야 할까요',
      content: pad('시누가 돌잔치를 한다고 연락이 왔는데 왕복 세 시간 거리입니다. 남편은 당연히 가야 한다고 하는데 저는 솔직히 부담스러워요. 다들 어떻게 하시나요.'),
    }))
    // '돌잔치'는 학령기 강신호지만 제목이 아닌 본문이고, 성인 관계축(시누·남편)이 있으므로 살린다
    expect(r.eligible).toBe(true)
    expect(r.signals).toContain('성인관계')
  })

  it('고등 자녀의 독립·여행 고민은 육아로 단정하지 않는다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '아이 1박2일 여행 보내도 될까요',
      content: pad('딸이 친구들끼리 1박2일 여행을 간다는데 걱정이 됩니다. 스무 살 되면 다 놓아준다고 했는데 막상 닥치니 마음이 복잡하네요. 제가 오바하는 걸까요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('제목에 학령기 표현이 직접 있으면 관계축이 있어도 육아로 본다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '초등학생 딸 학원비 때문에 남편이랑 싸웠어요',
      content: pad('남편은 학원을 줄이자고 하고 저는 지금 그만두면 뒤처질까 걱정입니다. 매달 나가는 돈이 만만치 않아서 계속 다투게 되네요. 다들 어떻게 하시는지요.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('PARENTING_CURRENT')
  })

  it('회원이 쓴 "이벤트" 언급은 참여 맥락이 없으면 살린다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '동네 마트 이벤트 갔다 왔어요',
      content: pad('집 앞 마트에서 하는 행사에 다녀왔는데 사람이 정말 많더라고요. 필요한 것만 사려고 했는데 결국 이것저것 담아왔습니다. 다들 장은 어디서 보시나요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('정치·분노 표현을 이 gate가 새로 차단하지 않는다', () => {
    // 발행 gate의 역할이지 리라이팅 후보 gate의 역할이 아니다
    const r = evaluateTitleRewriteCandidate(base({
      title: '요즘 뉴스 보면 너무 화가 나요',
      content: pad('뉴스를 볼 때마다 답답하고 화가 치밀어 오릅니다. 세상이 왜 이런가 싶어서 혼자 씩씩대고 있어요. 다들 어떻게 마음을 다스리시는지 궁금합니다.'),
    }))
    expect(r.eligible).toBe(true)
  })
})

describe('partitionTitleRewriteCandidates — 일괄 분류', () => {
  it('통과/제외를 사유와 함께 나눈다', () => {
    const rows = [
      base({ title: '남편이랑 다퉜어요', content: pad('별것도 아닌 일로 크게 다퉜습니다. 며칠째 말도 안 하고 지내는데 먼저 말을 걸기도 뭐하고 답답하네요. 다들 이럴 때 어떻게 푸시나요.') }),
      base({ cafeId: 'yeowooya' }),
      base({ content: '짧음' }),
    ]
    const { eligible, excluded } = partitionTitleRewriteCandidates(rows)
    expect(eligible).toHaveLength(1)
    expect(excluded.map(e => e.result.reason)).toEqual(['SHADOW_SOURCE', 'BODY_TOO_SHORT'])
  })
})

// ─────────────────────────────────────────────────────────────
// PR-E (2026-08-14) — 화자 귀속 조정 회귀
//
// M3 wgang 실측에서 오탐 21건이 나왔고, 전부 "그 표현이 누구의 것인가"를
// 구분하지 못한 결과였다. 아래는 그 실제 사례들을 픽스처로 고정한 것이다.
// 정규식을 다시 넓히면 여기서 깨진다.
// ─────────────────────────────────────────────────────────────

describe('PR-E — YOUNG_SELF는 화자 본인일 때만 (오탐 11/11 회수)', () => {
  it('4050 재취업 글에서 "2030세대보다"는 비교 대상이다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '4050 경력단절 후 재취업 하신분들 무슨일 하시나요?',
      content: pad('재취업도 쉽지 않고 좋은 자리는 들어가기 더 어렵고 4050맘들은 진짜 힘든거 같아요. 일자리만 생기면 2030세대보다 더 화이팅 넘치게 일하기도 하는 나이 같아요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('화자가 60대이고 30대 초반은 30년 전 회상이다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '한때 절친이였던 시절인연 결혼식 참석 어떻게 생각하세요',
      content: pad('저는 지금 60대인데 그녀를 처음만난건 30대 초반, 딱 30년이 지났어요. 입주한 아파트에서 그녀를 처음 만났어요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('"제 나이가 50줄"이면 20대 언급이 있어도 화자는 중년이다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '직장에 고추아가씨였던 선배언니',
      content: pad('제 나이가 50줄인데도 여전히 선배들이 있습니다. 그중에 젊은 시절 20대에 고추아가씨에 뽑혔던 언니가 한분 계셔요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('대학생 딸을 둔 엄마 글 — 20대는 딸의 나이다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '요샌 대학생들 사귀면 잠자리는 기본인가요?',
      content: pad('첫연애고 제 눈엔 아직 아기같은데 사귀고 한달도 안되어 같이 놀러를 가더라구요. 20대 초반이고 아직 제 눈에는 아이 같은데 좀 더 꽁냥꽁냥 사겨도 될거 같은데요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('딸의 남친 이야기는 화자의 연애가 아니다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '부모가 맘에 안들면 어쩌죠?',
      content: pad('딸이 사귀는 남친 직업 나이 학벌 이런건 그냥 대단한게 아니지만 또 내 딸도 마찬가지라서 그냥 내년 하반기에 결혼식 올리려고했는데 갑자기 복병이 생겼어요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('"제가 남자친구라면"은 가정법이라 화자의 연애가 아니다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '뼈말라 문화',
      content: pad('제가 남자친구라면 그렇게까지 뼈 말라가는 여자친구가 창피할 것 같아요. 이제 나이를 먹어가며 생각이 달라지네요. 요즘 유행이라는 몸매가 이해되지 않습니다.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('며느리가 임신중인 것은 화자의 임신이 아니다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '내 삶속 스며든 죽음의 이야기',
      content: pad('며느리가 임신중인데 장례식장 바깥에서 사돈 내외 보고 온다고 하는데 가지말라고도 못하고 남편 눈치만 보고 있습니다. 인생이 참 허무하다는 생각이 들어요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('★ 화자가 본인을 30대라고 밝히면 여전히 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '요즘 너무 지치네요',
      content: pad('저는 30대 초반인데 회사 생활이 너무 힘들어요. 매일 야근에 주말에도 나가야 하고 이렇게 사는 게 맞나 싶습니다. 다들 어떻게 버티시는지 궁금해요.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('YOUNG_SELF')
  })

  it('★ 본인의 신혼 이야기는 여전히 제외한다 (과거 회상 표지 없을 때)', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '집들이 어떻게 하셨어요',
      content: pad('신혼 살림 차린 지 얼마 안 됐는데 양가 부모님 모시고 집들이를 해야 할 것 같아서요. 뭘 준비해야 할지 막막합니다. 조언 부탁드려요.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('YOUNG_SELF')
  })

  it('★ 본인 소유 남친은 여전히 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '이런 사람 어떤가요',
      content: pad('제 남자친구가 요즘 연락이 뜸해졌어요. 바쁘다고는 하는데 마음이 식은 건 아닌지 걱정됩니다. 이럴 때 어떻게 하는 게 좋을까요. 조언 부탁드려요.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('YOUNG_SELF')
  })
})

describe('PR-E — MEDICAL_AD는 author·홍보구조만 (오탐 3/3 회수)', () => {
  it('회원의 한의원 치료 문의는 광고가 아니다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '한의원에서 우울증치료',
      content: pad('뇌 전문으로 하는 한의원으로 뇌파검사 자율신경 소변 간검사 등 검사비가 10만원 설명까지 2시간 소요된다는데요. 우울증약 복용한지 일년 넘었어요. 한방으로 치료해보신분 계실까요?'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('연금 상담글의 "병원비" 언급은 의료광고가 아니다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '개인연금',
      content: pad('연금 개시가 다음달인데 한달에 세후 70을 15년 받는게 좋을까요 아니면 92만원을 10년 받는게 좋을까요. 80즈음 병원비 많이 들 것같다하네요. 뭐가 맞을까요?'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('회원 본인의 시술 고민은 살린다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '얼굴 리프팅 고민되네요',
      content: pad('처진 볼살 때문에 리프팅 시술을 알아보고 있는데 1회 18만원이라고 하네요. 효과가 얼마나 갈지 모르겠고 아까워서 망설여집니다. 해보신 분 계실까요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('★ 병원 계정 author는 여전히 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      author: '강남OO성형외과',
      title: '가을맞이 안내드립니다',
      content: pad('저희 병원에서 이번 달 특별한 소식을 전해드립니다. 자세한 내용은 아래를 확인해 주시기 바랍니다. 많은 관심 부탁드립니다. 감사합니다.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('MEDICAL_AD')
  })

  it('★ 시술+예약 유도 구조는 여전히 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '리프팅 이벤트 소식',
      content: pad('리프팅 시술 이벤트가 진행 중입니다. 지금 예약 문의 주시면 첫 방문 할인도 함께 적용해 드립니다. 카톡 문의 주세요. 많은 관심 부탁드립니다.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('MEDICAL_AD')
  })
})

describe('PR-E — 전문직 명칭은 상업 맥락 결합 시에만 (오탐 2/2 회수)', () => {
  it('본인이 변호사를 선임한 사연은 광고가 아니다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '살다보니 별의별 일 다 있습니다',
      content: pad('밴드 모임에서 어떤 친구 하나가 저를 모함해서 일이 꼬였습니다. 기가 막히고 어이가 없었는데 지금 저는 변호사를 선임해 해결하려고 합니다. 참 세상 별일이 다 있네요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('남편 빚 때문에 법률 상담을 고민하는 글은 살린다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '남의 일인줄로만 알았습니다',
      content: pad('저는 결혼 21년차입니다. 남편 사업이 코로나로 큰 빚만 남기고 서로 죽게 싸우고 많이 힘들었습니다. 법률 상담이라도 받아봐야 하나 고민입니다. 법원도 다녀왔었구요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('★ 전문직+무료상담 유치는 여전히 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '고민 있으신 분들 보세요',
      content: pad('이혼 문제로 힘드신 분들께 도움을 드리고자 합니다. 변호사가 직접 무료 상담 진행해 드리니 편하게 문의 주세요. 연락 주시면 빠르게 안내드리겠습니다.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('AD_OR_EVENT')
  })
})

describe('PR-E — 학령기는 중·고 축약형 보강, 성인 자녀는 살린다 (미탐 3/3 차단)', () => {
  it('★ 중3 진학 고민은 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '마이스터고 진학에 대한 의견 궁금해요',
      content: pad('중3남아입니다. 지필고사 보면 한두개 틀릴 정도입니다. 근데 공부하기 싫다고 마이스터고 가고 싶어해요. 진학해도 괜찮을지 고민이네요.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('PARENTING_CURRENT')
  })

  it('★ 고2 학원비 고민은 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '성적 안 나오는 고2 아들 학원비가 아까워요',
      content: pad('공부 내려놓고 노는 애가 아니라 그치만 집 분위기는 안좋겠죠. 학교 학원 독서실 방학땐 아침부터 저녁까지 다니는데 시험치면 성적이 안 나오니 현타 오네요.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('PARENTING_CURRENT')
  })

  it('★ 학교 일과(등교·특강)는 성인 관계축이 있어도 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '집공부만 하는 아들래미',
      content: pad('여름 방학동안은 절반 이상은 학교 특강 간다고 7시에 등교해서 5시 마치니 그나마 저녁에만 벌 섰는데. 남편도 일찍 오고 저 아들 단속하기도 힘드네요.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('PARENTING_CURRENT')
  })

  it('고3 자녀와의 관계 고민은 살린다 (입시 맥락 없음)', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '아들래미 두달만에 처음 한말',
      content: pad('고3이가 말을 안한다고 글 올린적이 있어요. 거진 두달 되가는데요. 오늘은 갑자기 아침에 방에서 나오더니 병원 가야겠다고 말했어요. 반가우면서도 마음이 아프네요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('고등학생 자녀의 건강·수술 고민은 살린다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '고등학생 부비동염수술',
      content: pad('아이 코에 물혹이 생겨서 다니던 이빈후과에서 수술 권유하시네요. 수술후 회복과정이 너무 힘들다고 하던데 감당할수 있을지 모르겠어요. 혹시 해보신분 계실까요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('군 복무 중인 성인 자녀 자랑글은 살린다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '제대 한 달 앞둔 아들, 오늘 한국사시험 1급 땄대요',
      content: pad('소소한 자랑입니다. 군대에서 틈틈이 공부하더니 87점으로 1급 합격했다고 하네요. 얼마 전에는 투자자산운용사 자격증도 취득했거든요. 한 걸음씩 준비하다보면 좋은 결과 있겠죠.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('"아이들 다 키우고 나니" 빈 둥지 글은 살린다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '여행이나 훌쩍 떠나고 싶네요',
      content: pad('세상만사 다 짜증나고 혼자만의 시간이나 보내볼까 싶다가도 통 자신이 없네요. 아이들을 다 키우고 나니 이젠 영 부질없어요. 몸이 심심해서 더 헛헛한가봐요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('학년 표기가 과거 회상이면 살린다 (대학생 자녀)', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '대학생 딸래미 편입? 힘드네요',
      content: pad('대2 딸래미 때문에 힘드네요. 자기가 우겨서 간 학과가 안맞는다고 편입한다고 해서 인강 결제해줬어요. 대학가면 끝인줄 알았는데 고3때보다 더 힘들어요.'),
    }))
    expect(r.eligible).toBe(true)
  })
})

describe('PR-E — MALE_SELF는 1인칭 남성일 때만 (부분매칭 오탐 회수)', () => {
  it('"아직도 내 남편입니다"는 여성 화자의 표현이다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '줸장 제기랄',
      content: pad('출근부터 스트레스 받을 일이 생기네요. 내 사랑은 남편이 처음이었고 아직도 내 남편입니다. 그래도 결론은 못견디겠습니다. 그럼에도 식욕은 어디 안가네요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('"우리 남편입니다"도 여성 화자다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '사진 한 장 올려요',
      content: pad('옆에 서 있는 사람이 우리 남편입니다. 결혼한 지 삼십 년이 다 되어가는데 아직도 사진 찍을 때는 어색해하네요. 다들 부부 사진 자주 찍으시나요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('"남편이 그랬어요"는 제외 사유가 아니다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '이런 말 들으면 서운하시죠',
      content: pad('남편이 그랬어요. 요즘 왜 이렇게 예민하냐고. 저는 그냥 몸이 힘들어서 그런 건데 그 말 한마디가 계속 마음에 걸리네요. 다들 이럴 때 어떻게 넘기시나요.'),
    }))
    expect(r.eligible).toBe(true)
  })

  it('★ 남성 화자 1인칭은 여전히 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '조언 구합니다',
      content: pad('저는 남자입니다. 이 카페에 글 올려도 되는지 모르겠지만 아내와의 문제로 조언을 구하고 싶어서 용기내어 적어봅니다. 잘 부탁드립니다.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('MALE_SELF')
  })

  it('★ 아내를 언급하는 화자는 여전히 제외한다', () => {
    const r = evaluateTitleRewriteCandidate(base({
      title: '요즘 고민이 많습니다',
      content: pad('제 아내가 요즘 부쩍 힘들어하는 것 같아서 걱정입니다. 갱년기라 그런 건지 제가 뭘 해줘야 할지 모르겠네요. 조언 부탁드립니다. 감사합니다.'),
    }))
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('MALE_SELF')
  })
})
