import { describe, it, expect } from 'vitest'
import { resolveBoardFromRef, hasHumorEntitlement } from '../../agents/cafe/curator-shared'

/** 게시판 라우팅 — 창업자 gold label 17건(2026-07-12) + 운영 기준 고정.
 *  픽스처의 own/title/content는 실제 DB 원문(발행 당시 CafePost) 발췌. */

describe('resolveBoardFromRef — gold A: psych 오태깅 LIFE2 → STORY', () => {
  const cases: Array<[string, string, string, string]> = [
    // [own(psych 태깅 실측), title, content 발췌, 기대 board]
    ['MONEY', '텐트 버려도 되겠죠?', '한창 붐일 때 홈쇼핑에서 아주 비싼 돈주고 구입했어요. 몇 번 사용하고 캠핑은 안 맞더라구요. 남편은 당근에 팔아보겠다고 하지만 번거롭기도. 돈주고 버려도 되겠죠?', 'STORY'],
    ['HOUSING', 'TV가 간밤에 조용히 사망 하셨습니다.', 'TV가 시청중 화면과 소리가 안되면서 가끔 파란불만. 삼성 75인치 19년도에 구입. 수리해서 사용해야 할지 새걸로 바꿔야 할지 고민이 되네요.', 'STORY'],
    ['HOUSING', '바퀴벌레 어떡게 하십니까', '딸이 새벽에 바퀴벌레 보고 기절 직전 비명소리. 벽에 붙이는 약 잘 죽나요? 뱀 쥐는 저도 보기만 해도 무섭습니다.', 'STORY'],
  ]
  it.each(cases)('own=%s "%s" → %s', (own, title, content, want) => {
    void content
    expect(resolveBoardFromRef(own, title, cases.find(c => c[1] === title)![2]).boardType).toBe(want)
  })
})

describe('resolveBoardFromRef — gold B: 돈/은퇴 주제의 STORY 잔류 → LIFE2 보정', () => {
  const cases: Array<[string | null, string, string, string]> = [
    ['HOBBY', '우나어님은 은퇴후 사고 싶으신거 있으세요?', '은퇴한 은오님은 몰사셨나요? 전 전기 자전거 사서 전국일주 하고 파요', 'LIFE2'],
    [null, 'today 하이닉스 복기', '오늘 SK하이닉스 흐름을 복기해보겠습니다. 전일 급락 이후 방어에는 성공했지만 아직 추세 재개가 확정된 자리는 아니었습니다. 매수 버튼을 누르는 구간이라기보다', 'LIFE2'],
    ['LEGACY', '아이들 현금증여 얼마나 해주시나요?', '아이들 어릴때 사정이 좋지 못해서 한도 채워서 증여를 못해준게 아쉽네요. 배당주라도 조금 사줄걸 싶어서요.', 'LIFE2'],
    ['HOBBY', '바닷가 근처 170평은 좀 작을까요?', '어제 다녀왔는데 현재는 밭이더군요. 근데 170평은 좀 좁아보이던데 실제 어떨까요? 당장은 캠핑 사이트로 이용하고 조건이 맞으면 작은 집을 지을 생각도 있네요.', 'LIFE2'],
    ['MEANING', '미국으로 치면 한 주도 되지 않는 조그만 나라에 반도체 어디다 지은들~~어떠하리', '미국 50여개 주중에서 남한과 거의 같은 크기가 켄터키 주. 이 조그만 나라에 반도체 공장 어디다 지은들 문제없습니다.', 'LIFE2'],
  ]
  it.each(cases)('own=%s "%s" → %s', (own, title, content, want) => {
    expect(resolveBoardFromRef(own, title, content).boardType).toBe(want)
  })
})

describe('resolveBoardFromRef — gold C: candidate ENTERTAIN 상속 HUMOR → STORY', () => {
  // candidate desire는 이제 입력 자체가 없다 — ref own/text만으로 STORY가 나와야 한다.
  const cases: Array<[string | null, string, string, string]> = [
    ['DIGITAL', '안녕하세요. 쿠팡에서 살 수 있는 노트북 하나 추천해주세요.', '용도는 그냥 간단한 사무입니다. 당근에서 중고로 하나 사려고 했더니 멀쩡한 노트북은 당근에 나올 일이 없을 거 같아서요.', 'STORY'],
    [null, '잠이 깬 김에 형부 얘기 좀…', '최근 형부 행동이 이해가 안 가서요. 지난 주말에 친정집 놀러갔는데 언니가 안아주라고 했는데도 형부가 모른 척 하더라구요.', 'STORY'],
    ['FAMILY', '수학 머리와 과학 머리는 별개인갸요?', '딸인데 과학은 좋아하고 자신있어 하는데 수학은 이에 비해 어려워 하고 자신감도 떨어져요. 수학과 과학 머리는 별개인가요?', 'STORY'],
    ['DIGNITY', '남편 누나가 장어즙을 가져가래요. 우리도 안먹는다 했더니', '자기들도 선물 받은 건데 안먹는다고 동생 먹이래요. 시어머니께서 형님이 생각해서 주면 감사합니다 하고 받는게 예의라네요.', 'STORY'],
    ['FAMILY', '힘들어서 그냥 주저리 써봅니다ㅜ', '아들 최저임금 받으면서 몇개월 계약직 전전합니다. 친구 없어요. 성격 나쁘지는 않지만 소심하고 게으릅니다. 포기는 엄청 빠르고 삶에 대한 애착 없어요.', 'STORY'],
    ['HUMOR', '여보 ~ 바지 세벌과 윗옷 5벌 해줄께 ㅋ', '2층 서재로 올라가서 책을 읽고 있는데 아래층에서 아내의 다급하고 비명에 가까운 목소리가 들려옵니다. 놀래서 급하게 내려갔더니 그저께 남동생 한테서 받은 1억원 가지고 바지 3벌하고 윗도리 5벌을 사주겠다는 것입니다. 황당하지만 웃어 넘겼습니다.', 'STORY'],
  ]
  it.each(cases)('own=%s "%s" → %s', (own, title, content, want) => {
    expect(resolveBoardFromRef(own, title, content).boardType).toBe(want)
  })
})

describe('resolveBoardFromRef — 진짜 유머/엔터는 HUMOR 유지', () => {
  it('넷플릭스/드라마/노래 잡담은 HUMOR 유지', () => {
    expect(resolveBoardFromRef('ENTERTAIN', '넷플릭스 추천 하나 하고 갈께용', '요즘 본 것 중 제일 재밌었어요').boardType).toBe('HUMOR')
    expect(resolveBoardFromRef('ENTERTAIN', '우리들의 블루스~ 보셨어요?', '드라마 보고 펑펑 울었네요').boardType).toBe('HUMOR')
    expect(resolveBoardFromRef('HUMOR', '오늘 웃긴 일이 있었어요', '빵터진 얘기 하나 할게요 ㅋㅋㅋ').boardType).toBe('HUMOR')
    expect(resolveBoardFromRef('ENTERTAIN', '40대인데... 전 요즘 노래가 옛날노래보다 좋아요', '요즘 노래 들으면 기분이 좋아져요').boardType).toBe('HUMOR')
  })
  it('후보가 무엇이든(입력 없음) ref가 가족/고민이면 STORY', () => {
    expect(resolveBoardFromRef('FAMILY', '동생 남편 맘에 안들어요', '자꾸 언니한테 함부로 해요').boardType).toBe('STORY')
    expect(resolveBoardFromRef(null, '시댁때문에 별일을 다 해봤네요', '미신까지 동원했어요').boardType).toBe('STORY')
  })
})

describe('resolveBoardFromRef — LIFE2 기준 (돈/은퇴/제도) vs 생활글', () => {
  it('은퇴/연금/건강보험/증여/주식/재취업은 LIFE2', () => {
    expect(resolveBoardFromRef(null, '은퇴후 의료보험 지역가입자 문의', '건강보험 지역가입자 전환되면 보험료가 얼마나 나올까요').boardType).toBe('LIFE2')
    expect(resolveBoardFromRef(null, '개인연금 수령 or 연장 고민되네요', '연금 개시 나이를 미룰지 고민입니다').boardType).toBe('LIFE2')
    expect(resolveBoardFromRef('GENERAL', '요양보호사 자격증 고민 중입니다', '재취업에 도움이 될까요').boardType).toBe('LIFE2')
  })
  it('생활 불편/가전/이웃/물건 추천은 STORY', () => {
    expect(resolveBoardFromRef(null, '옆집에 냄새 어떡하죠??ㅠㅠ', '복도에 냄새가 심해서 고민이에요').boardType).toBe('STORY')
    expect(resolveBoardFromRef(null, '아파트 엘리베이터 1대 짜증나죠?', '출근 시간마다 한참 기다려요').boardType).toBe('STORY')
    expect(resolveBoardFromRef(null, '세탁기가 고장났어요', '10년 쓴 세탁기를 바꿔야 할지 고민이에요').boardType).toBe('STORY')
  })
  it('본문에 스친 단어 1개로는 LIFE2로 가지 않는다 (과보정 방지)', () => {
    expect(resolveBoardFromRef(null, '반말이 편하신가요?', '모임에서 반말 얘기가 나왔는데 재취업 얘기도 잠깐 나왔어요').boardType).toBe('STORY')
  })
})

describe('routing 관측 필드', () => {
  it('routingDesire/routingGuard를 반환한다', () => {
    const r = resolveBoardFromRef('MONEY', '텐트 버려도 되겠죠?', '비싼 돈주고 산 텐트 캠핑 안 가서 버리려구요')
    expect(r.routingGuard).toContain('OWN_LIFE2_UNSUPPORTED')
    expect(typeof r.routingDesire).toBe('string')
  })
  it('HUMOR 폴백 시 가드에 HUMOR_GATE가 남는다', () => {
    const r = resolveBoardFromRef('HUMOR', '여보 오늘 있었던 일', '아내가 옷을 사달라고 했어요')
    expect(r.boardType).toBe('STORY')
    expect(r.routingGuard).toContain('HUMOR_GATE')
  })
})

describe('hasHumorEntitlement', () => {
  it('단발 ㅋ/가벼운 말투만으로는 자격이 없다', () => {
    expect(hasHumorEntitlement('여보 바지 세벌 해줄께 ㅋ 1억원 가지고')).toBe(false)
    expect(hasHumorEntitlement('TV가 간밤에 사망하셨습니다')).toBe(false)
  })
  it('명시적 유머/엔터 신호는 자격이 있다', () => {
    expect(hasHumorEntitlement('오늘 진짜 웃긴 일이')).toBe(true)
    expect(hasHumorEntitlement('넷플릭스 드라마 추천')).toBe(true)
  })
})
