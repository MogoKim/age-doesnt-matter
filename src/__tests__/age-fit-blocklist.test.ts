import { describe, it, expect } from 'vitest'
import { findAgeFitViolation, findMedicalAdSignal } from '../../agents/core/age-fit-blocklist'

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

describe('TRADE — 지역 거래/홍보/공구/동네 Q&A (2026-07-12 맘카페 온보딩 대비)', () => {
  const blocked: string[] = [
    'SK데이터 2기가 2천원에 삽니다', '안 쓰는 유모차 팝니다', '두돌 남아 플레이메이트 구해요',
    '아기 골든햄스터 분양', '온열매트 공구 진행합니다', '화장품 체험단 모집',
    '세종충남대병원 정신의학과 어때요?', '임플란트 잘하는곳 추천', '파아란 영어 학원 어때요',
    '초산모님들 나이가 어떻게 되세요?', '남아 사춘기 팬티 추천부탁드려요',
  ]
  it.each(blocked)('"%s" → 차단', (t) => {
    expect(findAgeFitViolation(t, '')).not.toBeNull()
  })

  const passed: string[] = [
    '알려진 맛집들은 위치 상관없는거 같아요',        // 맛집 담론 (지역 Q&A 아님)
    '아파트 분양가가 너무 올랐네요',                 // 부동산 분양 (동물 분양 아님 — LIFE2 정보글)
    '남편이 공구 사왔는데 쓸 줄을 몰라요',           // 연장 공구
    '시어머니께서 반찬을 나눔 해주셨어요',           // 이웃 정 (나눔합니다 아님)
    '금 팔려고하는데요 시세가 궁금해요',             // 팝니다 아님
    '갱년기인지 사춘기 소녀처럼 마음이 싱숭생숭해요', // 사춘기 비유 (결합 아님)
  ]
  it.each(passed)('"%s" → 통과', (t) => {
    expect(findAgeFitViolation(t, '')).toBeNull()
  })
})

/**
 * MEDICAL_AD — 병원 홍보/의료광고/단축링크 (2026-08-14, 뷰티 카페 온보딩 대비)
 *
 * 원칙: "시술 단어"가 아니라 "광고 구조"를 본다.
 *   우리가 원하는 것 = 여성의 자기관리 이야기 / 원하지 않는 것 = 병원 광고.
 *   따라서 시술 고민·경험담은 반드시 통과해야 하고, 광고 라벨·안내박스·단축URL·
 *   시술어휘+가격/이벤트/예약 결합만 차단한다.
 */
describe('findMedicalAdSignal — 차단 대상 (카페가 끼워 넣는 홍보 블록)', () => {
  const blocked: string[] = [
    // ① 게시판 안내 박스 (여우야 전 글 자동 삽입 — 2026-08-14 실측)
    '게시판 안내를 확인해 주세요! ★밴스의원 보톡스 900원 https://bit.ly/4fmeSWq',
    '게시판 안내를 확인해주세요',
    // ② *의료광고 배너 라벨 (네이버 법적 표기 — 가장 확실한 신호)
    '*의료광고 양악 윤곽 이벤트',
    '2026 트렌드 얼굴형 양악&윤곽 * 의료광고',
    // ③ 단축 URL = 광고 추적 링크
    '이거 좋대요 https://bit.ly/3QiDQf9',
    '자세한건 han.gl/abcd 참고하세요',
    // ④ 시술 어휘 + 상거래 신호 결합
    '레이저제모 300원부터 이벤트가',
    '보톡스 39,000원 특가 진행합니다',
    '가슴성형 상담 예약 받습니다',
    '리프팅 무료 상담 선착순 마감임박',
    // ⑤ 카페 홍보 게시판 유입
    '병원이벤트 당첨자 발표합니다',
    '제휴 및 체험단 문의 주세요',
  ]
  it.each(blocked)('"%s" → 차단', (t) => {
    expect(findMedicalAdSignal(t, '')).not.toBeNull()
  })
})

describe('findMedicalAdSignal — 통과 대상 (★오탐 방지: 회원의 진짜 이야기)', () => {
  const passed: string[] = [
    '병원 다녀왔는데 갱년기라고 하네요',        // 경험담 — P2 정희씨 핵심 주제
    '피부가 푸석해서 고민이에요',               // 자기관리 고민
    '보톡스 고민 중인데 무서워요',              // 시술 고민 = 우리가 원하는 대화
    '화장품 바꿨는데 괜찮네요',                 // 후기
    '나이 드니까 얼굴살이 빠지는 것 같아요',     // 외모 변화에 대한 마음
    '피부과에서 기미 치료받고 왔어요',          // 시술 경험담 (가격·홍보 없음)
    '리프팅 해보신 분 계세요? 후기 궁금해요',    // 커뮤니티 질문
    '어제 병원에서 검사받았는데 결과가 걱정돼요', // 건강 불안 (P2 핵심)
    '요즘 눈가 주름이 신경쓰이네요',            // 외모 고민
    '어후 배고파요 아침 먹었눈뎅',              // 일반 수다 (여우야 실제 글 2026-08-14)
  ]
  it.each(passed)('"%s" → 통과', (t) => {
    expect(findMedicalAdSignal(t, '')).toBeNull()
  })
})

/**
 * 여우야(shadow) 저장 차단 — crawler.ts savePosts 5.2 게이트가 쓰는 판정.
 * 실제 여우야 글은 회원 본문 앞뒤에 카페가 홍보 블록을 끼워 넣는다(2026-08-14 화면 실측).
 * 본문이 정상이어도 홍보 블록이 섞이면 DB 저장 자체를 막아야 한다.
 */
describe('findMedicalAdSignal — 여우야 실제 글 형태 (본문 + 삽입된 홍보 블록)', () => {
  const GUIDE_BOX = '게시판 안내를 확인해 주세요! ★프랑스에서 온 화상·비감염성 상처 치료제 비아핀 화끈화끈 예민해진 피부▶https://bit.ly/4fmeSWq ★밴스의원♥주름보'
  const AD_BANNER = '일퍼센트성형외과의원 2026 트렌드 얼굴형 양악 윤곽 예뻐지고 싶니? *의료광고'

  it('안내박스가 본문 앞에 붙은 글 → 저장 차단', () => {
    expect(findMedicalAdSignal('어후 배고파요 아침 먹었눈뎅', `${GUIDE_BOX}\n배고프네요 점메추요!~`)).not.toBeNull()
  })

  it('의료광고 배너가 본문 뒤에 붙은 글 → 저장 차단', () => {
    expect(findMedicalAdSignal('애 안입는 옷 정리하다가 반나절 다 감', `옷장 정리 좀 하려고 꺼냈는데\n${AD_BANNER}`)).not.toBeNull()
  })

  it('홍보 블록이 없는 순수 회원 글 → 저장 허용 (★오탐 방지)', () => {
    expect(findMedicalAdSignal('요즘 피부가 예전 같지 않아요', '세수하고 나면 당기는 느낌이 심해졌어요. 다들 어떻게 관리하세요?')).toBeNull()
    expect(findMedicalAdSignal('보톡스 해보신 분', '무섭기도 하고 티날까봐 고민이에요. 해보신 분 어떠셨어요?')).toBeNull()
  })
})
