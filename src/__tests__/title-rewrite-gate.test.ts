import { describe, it, expect } from 'vitest'
import {
  evaluateTitleRewriteCandidate,
  partitionTitleRewriteCandidates,
  TITLE_REWRITE_SOURCES,
  type RewriteGateInput,
} from '../../agents/cafe/title-rewrite-gate'
import { MIN_BODY_LENGTH_FOR_REWRITE } from '../../agents/cafe/title-rewrite-rules'

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
  it('1차 limited 대상은 wgang 단독이다', () => {
    expect(TITLE_REWRITE_SOURCES).toEqual(['wgang'])
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

  const otherSources = ['remonterrace', 'dlxogns01', 'masanmam', 'goondae']
  it.each(otherSources)('%s는 1차 limited 대상 밖', (cafeId) => {
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
