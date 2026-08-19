/**
 * 82cook 자유게시판 gate v3.2.2 — **순수 함수**
 *
 * 제약 (설계상 절대):
 *   - AI API 호출 없음 (비용 0원)
 *   - 네트워크 요청 없음
 *   - DB/Sheet write 없음
 *   - 전역 상태 없음 — 같은 입력이면 항상 같은 출력
 *
 * v3.2 대비 변경 (M2-7 J절 잔여 정책 2건):
 *   [P1] 작품어 단독 연예 글: 작품명·인물·시청/회상 표현·댓글수 4신호 중 2개 이상이면 E4로 인식
 *   [P2] 기업 비하 / 주식 선동: 자동 PASS 금지. 기본 REVIEW, 강하면 REJECT
 *
 * v3.2.1 대비 변경 (M2-8 첫 실험에서 발견된 누출 2건 → v3.2.2):
 *   [P3] 국적·인종 비하 + 실존 인물 비방: agents/core/celebrity-race-blocklist.ts를 **재사용**한다.
 *        새 사전을 만들지 않는다 — 같은 금지 정책이 두 벌로 갈라지면 반드시 어긋난다.
 *        (누출 사례: "중국인들 민폐로 또 세금낭비"가 PASS로 통과했다)
 *   [P4] 정치 사전에 정치인 실명·당원 용어 보강
 *        (누출 사례: "정청래한테 화환보낸 리박세작 B시민 권리당원"이 REVIEW에 남았다)
 *
 * 연예 정책 (창업자 결정, 후퇴 금지):
 *   - hard reject 폐기. 신체·성형형(E3)도 통과 대상
 *   - 실명 범죄·의혹(E5)·정치연계(E6)만 차단
 *   - 연예 글 보드는 웃음방(HUMOR) 기본
 */

// [P3] 국적·인종 비하 / 실존 인물 비방은 기존 SSoT를 재사용한다.
// 이 모듈은 "지칭어 단독으로는 절대 차단하지 않고, 비하어와 결합될 때만 차단한다"는
// 실측 기반 설계를 이미 갖고 있다(발행 1,353건 기준 과차단 4.58% → 0.37%).
import { findCelebrityScandalSignal, findRacialDegradeSignal } from '../core/celebrity-race-blocklist.js'
import type { EntertainmentType, GateResult, SuggestedBoard } from './types.js'

export const GATE_VERSION = 'v3.2.2'

// ── [1] 정치 ────────────────────────────────────────────────
const POLITICS = [
  '정치', '정치적', '정치인', '레임덕', '지지자', '반명', '친명', '친문', '청와대', '형소법',
  '민주당', '국힘', '국민의힘', '정성호', '김민석', '이재명', '윤석열', '한동훈', '조국',
  '대통령', '국회의원', '여당', '야당', '총선', '대선', '탄핵', '사드', '청문회',
  '좌파', '우파', '정권', '친일', '의원님', '정당',
  // [P4] v3.2.2 보강 — M2-8 실험에서 REVIEW로 새어나간 사례 반영
  '정청래', '추미애', '박지원', '홍준표', '이준석', '김어준', '문재인', '박근혜',
  '권리당원', '당원', '최고위', '당대표', '당권', '개딸', '수박', '태극기',
  '리박스쿨', '세작', '공작', '국짐', '개혁신당', '조국혁신당', '진보당',
]

// ── [2] 연예 — 명단 + 패턴 ──────────────────────────────────
const CELEB_NAMES = [
  '황정민', '장동건', '고지용', '장기하', '윤가이', '카리나', '송하윤', '장윤정', '이서진',
  '손예진', '현빈', '서인영', '공효진', '김종민', '박보검', '소지섭', '정형돈', '김동현',
  '엄정화', '김희애', '고현정', '나영석', '허남준', '한혜진', '박정아', '신지', '하영',
  '전원주', '김금순', '장미희', '이종원',
]
const CELEB_ROLE = ['배우', '가수', '탤런트', '개그맨', '아이돌', '연예인', '방송인', 'MC', '성우', '모델']
const SHOW_WORDS = ['드라마', '영화', '예능', '방송', '프로그램', '오디션', '시트콤', '넷플', '시즌', '출연', '데뷔', '작품']
const WATCH = ['보니', '봤', '보는데', '시청', '다시보', '재방', '기억하시', '챙겨보']
const NAME_SUFFIX = /[가-힣]{2,4}(?:씨|님)(?:가|는|은|를|의|도|와|랑)?\s/
const PAREN_NAME = /\([가-힣]{2,4}\)/

const has = (t: string, words: readonly string[]): boolean => words.some((w) => t.includes(w))

/**
 * [P1] 작품어 단독 연예 글 인식.
 * 작품명 / 등장인물(괄호 이름) / 시청·회상 표현 / 댓글 활성 — 4신호 중 2개 이상이면 연예로 본다.
 * 1개만으로 인정하면 "드라마 같은 인생" 류 비유까지 걸리므로 2개를 요구한다.
 */
function worksSignalCount(title: string, commentCount: number): number {
  let n = 0
  if (has(title, SHOW_WORDS)) n += 1
  if (PAREN_NAME.test(title) || NAME_SUFFIX.test(title)) n += 1
  if (has(title, WATCH)) n += 1
  if (commentCount >= 6) n += 1
  return n
}

export function isCeleb(title: string, commentCount = 0): boolean {
  if (has(title, CELEB_NAMES)) return true
  if (has(title, CELEB_ROLE)) return true
  if (has(title, SHOW_WORDS) && (has(title, WATCH) || has(title, CELEB_ROLE))) return true
  if (PAREN_NAME.test(title) && has(title, [...SHOW_WORDS, ...WATCH])) return true
  if (NAME_SUFFIX.test(title) && has(title, [...SHOW_WORDS, '데뷔'])) return true
  // [P1] v3.2.1 신설
  if (worksSignalCount(title, commentCount) >= 2) return true
  return false
}

// ── [3] 불쾌·노출 — 맥락 예외 없이 REJECT ───────────────────
const INDECENT = ['생식기', '바바리', '음란', '몰카', '불법촬영', '변태', '노출증', '성기', '자위', '노출 할배', '알몸']

// ── [4] 뉴스 기사 전재 ──────────────────────────────────────
const CORP = ['삼성전자', '삼성', 'LG', '현대차', '현대', 'SK', '롯데', '포스코', '한화', 'CJ', '네이버', '카카오', '쿠팡', '이랜드', '신세계']
const NEWS_VERB = ['짓는다', '밝혔다', '발표', '유치', '전망', '추진', '착공', '증설', '생산거점', '수주', '체결', '출시한다', '인수', '상장']
const FIRST = ['제 ', '저 ', '저는', '제가', '내 ', '우리 ', '저희', '제게', '저한테', '내가']
const CONSULT = [
  '당했', '당한거', '인가요', '일까요', '불리한가요', '어떡', '어떻게', '조언', '여쭙', '도와',
  '하나요', '될까요', '계신가요', '괜찮을까요', '맞나요', '받을 수', '신고해야', '예방', '좋을까요',
  '어떤가요', '있으세요', '구합니다',
]
const MONEY = /\d+\s*(억|조|만원)/

function isNews(title: string): boolean {
  // 본인 상황 질문·상담은 기사 전재가 아니다
  if (has(title, FIRST) || has(title, CONSULT)) return false
  const corp = has(title, CORP)
  const verb = has(title, NEWS_VERB)
  const money = MONEY.test(title)
  return (corp && verb) || (corp && money) || (verb && money)
}

// ── [P2] 기업 비하 / 주식 선동 (v3.2.1 신설) ────────────────
const CORP_SLUR = ['싸구려', '쓰레기 회사', '망해라', '불매', '개판', '양아치']
const STOCK_HYPE = ['개미꼬시기', '떡상', '가즈아', '풀매수', '몰빵', '지금 사야', '단타', '세력', '작전주']

/** 강도 판정: 실명 기업 + 비하어가 함께면 강함(REJECT), 그 외는 REVIEW */
function corpSlurLevel(title: string): 'none' | 'soft' | 'hard' {
  const slur = has(title, CORP_SLUR)
  if (!slur) return 'none'
  return has(title, CORP) ? 'hard' : 'soft'
}

function stockHypeLevel(title: string): 'none' | 'soft' | 'hard' {
  if (!has(title, STOCK_HYPE)) return 'none'
  // 수익 보장형 단정까지 겹치면 강함
  return has(title, ['보장', '무조건', '확실']) ? 'hard' : 'soft'
}

// ── [5] 범죄·낙인 ───────────────────────────────────────────
const CRIME = [
  '사기', '학폭', '고소', '소송', '의혹', '불송치', '절연', '횡령', '마약', '성추행', '폭행',
  '논란', '도박', '탈세', '재판', '구속', '보이스피싱', '범죄', '피싱', '절도', '고발',
]
const STIGMA = ['마약', '출소', '복역', '전과', '성범죄', '중독자']
const THIRD_PARTY = ['그알', '그것이 알고싶다', '뉴스', '기사', '보도', '유튜버', '인플루언서', '회장', '원장']
const KIN_OF_NAMED = ['첫째아들', '둘째아들', '친모', '친부', '장남', '차남', '며느리가', '사위가']
const FAMILY = ['남편', '아내', '아들', '딸', '엄마', '아빠', '부모', '시어머니', '시댁', '친정', '며느리', '사위', '손주', '형님', '동서']

type CrimeVerdict = { verdict: 'REJECT' | 'REVIEW' | 'OK'; why: string }

function crimeClass(title: string, commentCount: number): CrimeVerdict {
  const named = isCeleb(title, commentCount) || has(title, THIRD_PARTY) || has(title, KIN_OF_NAMED)
  const first = has(title, FIRST) || has(title, CONSULT)
  if (named && !first) return { verdict: 'REJECT', why: '제3자 특정+범죄 유포' }
  if (has(title, STIGMA) && !first) return { verdict: 'REJECT', why: '낙인 소재' }
  if (first) return { verdict: 'OK', why: '본인·가족 피해/법률 상담' }
  if (has(title, FAMILY)) return { verdict: 'REVIEW', why: '가족 소재 범죄·중독' }
  return { verdict: 'REVIEW', why: '사회 일반 범죄 소재' }
}

// ── [6] 기타 hard reject ────────────────────────────────────
const ILLEGAL = ['포르노', '원나잇', '섹파', '성매매', '아동']
const HARD_OTHER: Record<string, string[]> = {
  광고체험단: ['체험단', '협찬', '공구합니다', '할인코드', '구매처', '이벤트 참여', 'PPL'],
  공격저격: ['저격', '신고할까', '맘충', '박제'],
  의료단정: ['완치됩니다', '특효약', '부작용 없', '무조건 나아', '처방받으세요'],
  금융단정: ['수익률 보장', '떡상', '추천주', '무조건 오른', '원금 보장'],
}

// ── [7] 연예 유형 분류 ──────────────────────────────────────
const E_AGE = ['나이', '몇살', '연세', '생일', '띠', '데뷔']
const E_MARRY = ['결혼', '이혼', '열애', '재혼', '부부', '연애', '근황', '사업']
const E_BODY = ['성형', '가슴', '몸매', '얼굴', '외모', '옷발', '비주얼', '시술', '울쎄라', '예뻐', '잘생', '스타일']

function celebType(title: string): EntertainmentType {
  if (has(title, CRIME)) return 'E5_범죄·의혹'
  if (has(title, POLITICS)) return 'E6_정치연계'
  if (has(title, E_BODY)) return 'E3_외모·성형·신체'
  if (has(title, [...SHOW_WORDS, ...WATCH])) return 'E4_작품·방송'
  if (has(title, E_MARRY)) return 'E2_결혼·이혼·근황'
  if (has(title, E_AGE)) return 'E1_나이·신상'
  return 'E7_기타언급'
}

// ── [8] North Star 축 ───────────────────────────────────────
const CORE: Record<string, string[]> = {
  갱년기: ['갱년기', '완경', '폐경', '호르몬', '안면홍조', '열감', '불면', '식은땀', '생리', '월경'],
  가족자녀: ['딸', '아들', '자녀', '자식', '며느리', '사위', '시댁', '시어머니', '시누이', '시이모', '동서', '친정', '엄마', '아빠', '부모', '손주', '고등아이', '고3', '수능'],
  부부남편: ['남편', '부부', '아내', '결혼', '이혼', '재혼', '별거', '각방', '애정', '잠자리', '성욕', '성관계', '주말부부'],
  노후돈일: ['노후', '은퇴', '연금', '퇴직', '재취업', '알바', '일자리', '생활비', '적금', '국민연금', '월급', '창업', '실직', '토익', '자격증', '공시', '경력단절', '이력서', '면접', '취업', '세금', '파트너', '사무보조', '계약직', '퇴근', '근무', '직원', '후기', '직장맘', '정규직', '일하'],
  금융자산: ['etf', 'ETF', '주식', '증권', '계좌', '펀드', '예금', '배당', '투자', '재테크', '코스피'],
  주거부동산: ['아파트', '전세', '월세', '이사', '평수', '몇평', '주거', '매매', '분양', '재건축', '청약', '상가', '건물'],
  보험검진: ['보험', '실비', '건강검진', '검진', '내시경', '초음파', '수치', '도수치료'],
  건강몸: ['운동', '다이어트', '체중', '병원', '약', '영양제', '관절', '혈압', '당뇨', '수면', '위고비', '마운자로', '한약', '증상', '무릎', '어깨', '두통', '기력', '체외충격파'],
  질병: ['파킨슨', '치매', '암', '뇌졸중', '골다공증', '갑상선', '간병', '요양', '노약자'],
  노화체감: ['노안', '흰머리', '기억력', '체력', '주름', '돋보기', '허리'],
  마음정서: ['외로', '우울', '불안', '허전', '공허', '힘들', '서운', '눈물', '절친', '친구', '스트레스', '화병', '공황', '모임', '혼술'],
}
const SOFT = ['장보기', '건조기', '복숭아', '참외', '제철', '요리', '반찬', '김치', '청소', '세탁', '냉장고', '커피', '선풍기', '노트북', '여행']

const AGE_CTX = ['40대', '50대', '60대', '사십', '오십', '육십', '중년', '우리 나이', '나이에도', '고령']
const BODY_CTX = ['갱년기', '폐경', '완경', '호르몬', '부부', '남편', '아내', '결혼', '잠자리', '성욕', '성관계']
const CARE_CTX = ['노부모', '부모님', '아버지', '어머니', '엄마', '아빠', '간병', '요양', '치매', '가족', '아들', '딸', '시부모']
const AGE_NUM = /(4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9])\s*[세살]|5\d초|6\d초/
const AGE_MENTION = /(4\d대|5\d대|6\d대|사십|오십|육십|19\d\d년생|\d\d살|\d\d세|5\d초)/
const QUESTION = /(까요|나요|가요|은가요|인가요|어떠세요|어떤가요|봐주실|하죠|되죠|돼요)\s*[?.]?$/

const isQuestion = (t: string): boolean => t.endsWith('?') || QUESTION.test(t)
const hasSexContext = (t: string, cmt: number): boolean =>
  has(t, [...BODY_CTX, ...AGE_CTX, ...CARE_CTX]) || AGE_NUM.test(t) || isCeleb(t, cmt)

function boardOf(etype: EntertainmentType | null, title: string): SuggestedBoard {
  // 연예 글은 웃음방 기본 (창업자 결정)
  if (etype) return 'HUMOR'
  if (has(title, CORE.갱년기)) return 'MENOPAUSE'
  if (has(title, [...CORE.노후돈일, ...CORE.금융자산, ...CORE.주거부동산])) return 'LIFE2'
  return 'STORY'
}

/**
 * gate 본체. 제목(+댓글수)만으로 판정한다.
 * @param commentCount 댓글 수는 [P1] 작품 신호에만 쓰인다. REJECT를 되돌리는 데는 절대 쓰지 않는다.
 */
export function judge(title: string, commentCount = 0): GateResult {
  const t = title.trim()
  const riskFlags: string[] = []
  let note = ''

  for (const w of ILLEGAL) if (t.includes(w)) riskFlags.push(`불법:${w}`)
  for (const w of INDECENT) {
    if (t.includes(w)) {
      riskFlags.push(`불쾌노출:${w}`)
      break
    }
  }
  for (const w of POLITICS) {
    if (t.includes(w)) {
      riskFlags.push(`정치:${w}`)
      break
    }
  }
  if (isNews(t)) riskFlags.push('뉴스전재')

  // [P3] 국적·인종 비하 / 실존 인물 비방 — 기존 SSoT 재사용.
  // 82cook 후보는 목록 단계라 본문이 없다. 제목만 넘기면 결합 판정이 제목 안에서 이뤄진다.
  const racial = findRacialDegradeSignal(t, '')
  if (racial) riskFlags.push(racial)
  const scandal = findCelebrityScandalSignal(t, '')
  if (scandal) riskFlags.push(scandal)

  const celeb = isCeleb(t, commentCount)
  const entertainmentType = celeb ? celebType(t) : null

  let forcedReview = false
  if (has(t, CRIME)) {
    const { verdict, why } = crimeClass(t, commentCount)
    note = why
    if (verdict === 'REJECT') riskFlags.push(`범죄:${why}`)
    else if (verdict === 'REVIEW') forcedReview = true
  }

  for (const [label, kws] of Object.entries(HARD_OTHER)) {
    for (const w of kws) {
      if (t.includes(w)) {
        riskFlags.push(`${label}:${w}`)
        break
      }
    }
  }

  if (has(t, ['19금', '야동', '성욕', '잠자리', '성관계']) && !hasSexContext(t, commentCount)) {
    riskFlags.push('성적:맥락없음')
  }

  // [P2] 기업 비하 / 주식 선동 — 강하면 REJECT, 약하면 REVIEW 강제
  const slur = corpSlurLevel(t)
  const hype = stockHypeLevel(t)
  if (slur === 'hard') riskFlags.push('기업비하:실명+비하어')
  else if (slur === 'soft') forcedReview = true
  if (hype === 'hard') riskFlags.push('주식선동:수익단정')
  else if (hype === 'soft') forcedReview = true

  const nsScore =
    Object.values(CORE).filter((kws) => has(t, kws)).length + (celeb ? 1 : 0)
  const ffScore =
    (isQuestion(t) ? 2 : 0) +
    (AGE_MENTION.test(t) ? 1 : 0) +
    (/\d/.test(t) ? 1 : 0) +
    (t.length >= 12 && t.length <= 45 ? 1 : 0)

  const suggestedBoard = boardOf(entertainmentType, t)
  const base = { gateVersion: GATE_VERSION, nsScore, ffScore, entertainmentType, suggestedBoard }

  if (riskFlags.length > 0) {
    return { ...base, decision: 'REJECT', gateReason: riskFlags.join(','), riskFlags, nsScore: 0, ffScore: 0 }
  }
  if (forcedReview) {
    const why = slur === 'soft' ? '기업비하-검토' : hype === 'soft' ? '주식선동-검토' : '범죄소재-검토'
    return { ...base, decision: 'REVIEW', gateReason: note || why, riskFlags: [why] }
  }
  if (t.length < 8) {
    return { ...base, decision: 'REVIEW', gateReason: '8자 미만', riskFlags: ['8자 미만'] }
  }
  if (nsScore >= 1 && (ffScore >= 1 || nsScore >= 2)) {
    return { ...base, decision: 'PASS', gateReason: `ns=${nsScore} ff=${ffScore}`, riskFlags: [] }
  }
  const soft = has(t, SOFT) && nsScore === 0
  return {
    ...base,
    decision: 'REVIEW',
    gateReason: soft ? '생활소비만' : `ns=${nsScore} ff=${ffScore}`,
    riskFlags: soft ? ['생활소비만'] : [],
  }
}
