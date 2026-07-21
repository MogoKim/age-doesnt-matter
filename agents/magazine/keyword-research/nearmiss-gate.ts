/**
 * near-miss 타깃 게이트 — 우나어 SEO 화이트 검색어 기준표 v2 (순수 함수, 외부 import 없음)
 *
 * 별도 파일인 이유: gsc-nearmiss.ts는 googleapis·google-api.ts를 import하는데,
 * src/__tests__가 그쪽을 import하면 tsconfig exclude('agents')에도 불구하고 타입 그래프에
 * 끌려 들어가 google-api.ts의 googleapis 버전 스큐 에러가 CI typecheck를 깨뜨린다(2026-07-21 실측).
 * 게이트는 순수 로직이므로 의존성 없는 이 파일에 두고, 테스트는 이 파일만 import한다.
 */

// ─────────────────────────────────────────────────────────────────────────────
// [타깃 게이트 2026-07-21] 우나어 SEO 화이트 검색어 기준표 v2
//  도메인 속성 전환 후 near-miss에 연예/이슈/잡탕 쿼리가 86% 섞여(실측 70개 중 60개)
//  keyword queue 후보 오염 위험 → 화이트리스트(고유 주제어) + 연령 결합 방식으로 게이트.
//  실측 검증: near-miss 70(타깃 9 통과·비타깃 0) / universe 1,188(차단 8.9%=행정·잡음뿐).
// ─────────────────────────────────────────────────────────────────────────────

export type NearMissGate = 'pass' | 'pass_conditional' | 'blocked' | 'needs_review'

/** 연령어 — 40~60대·중년 맥락 */
const GATE_AGE = /(40대|50대|60대|중년|중장년|장년|시니어|[456]0살|[456]0세)/
/** 고유 주제어 — 연령어 없이도 통과 (여성건강 확장분 포함, 창업자 확정) */
const GATE_CORE = new RegExp(
  [
    '갱년기', '폐경', '완경', '생리불순', '생리끝', '안면홍조', '얼굴열', '열감', '식은땀',
    '불면', '수면장애', '질건조', '여성호르몬', '호르몬치료', '호르몬제', '골밀도', '골다공',
    '관절통', '손발저림', '방광염', '요실금', '오십견', '무릎', '허리통증',
    '건강검진', '대장내시경', '유방검진', '유방암검진', '갑상선',
    // 탈모는 중년·여성 결합형만 (단독이면 "빈살만 탈모" 같은 인명 쿼리가 뚫림 — 실측)
    '여성탈모', '갱년기탈모', '중년탈모', '40대탈모', '50대탈모', '60대탈모',
    '남편', '부부', '시댁', '며느리', '사위', '손주', '빈둥지', '황혼',
    '퇴직', '은퇴', '노후', '연금', '퇴직금', 'irp', 'isa', '인생2막',
    '재취업', '경력단절', '경단녀', '요양보호사', '간병', '요양원',
    '노안', '임플란트', '틀니',
  ].join('|'),
)
/** 범용어 — 연령어와 결합할 때만 통과 */
const GATE_GENERIC =
  /(다이어트|여행|패션|알바|커뮤니티|커뮤|모임|친구|외로움|취미|취업|염색|흰머리|주름|요리|살빼|건강|외모|일자리|보험|질환)/
/** 젊은층/학생 — 차단 (탈모+20대 결합도 여기서 차단) */
const GATE_YOUNG = /(20대|30대|10대|대학생|수능|취준생|신입|청년)/
/** 법률 세부 — 차단 (황혼이혼 자체는 CORE '황혼'으로 허용, 소송·재산분할 결합만 차단) */
const GATE_LEGAL = /(소송|재산분할|양육권|고소|위자료|법률상담|변호사)/
/** 의약품·성분류 — 차단. '염색약'은 의약품 아님(오탐 금지).
 *  '처방'은 "대처 방법"→"대처방법" 부분문자열 오탐이 실측돼 처방전/처방약/처방받로 한정.
 *  '영양제 추천'은 타깃 쿼리(기발행 주제)라 차단하지 않음 — '부작용' 결합만 차단. */
const GATE_MEDS = /(멜라토닌|불소|처방전|처방약|처방받|부작용|직구|파스|통증약|의약품|항암|보톡스)/
/** 연령어와 결합해도 차단되는 함정어 — 연예 리스트·시험·성적 소재 */
const GATE_AGE_TRAP = /(배우|가수|아이돌|정력|연예인|출연료|드라마추천)/
/** 수동 검토(drop + needsReview 로그) — 고등 학부모·남성 심리 */
const GATE_REVIEW = /(고[123][^0-9]|고딩|고등학생|수험생|학원|라이딩|남자심리|남성심리)/
const GATE_BRAND = /(우리나이|어때서|우나어|agedoesn)/

/**
 * near-miss 쿼리 타깃 게이트 (순수 함수 — 화이트 검색어 기준표 v2).
 * 전처리: 소문자화 + 공백 제거 ("50 대"→"50대", "국민 연금"→"국민연금").
 * 우선순위: 브랜드/법률/의약품/젊은층/함정어 차단 → 수동검토 → 고유주제어 → 연령+범용 → 단독은 검토.
 */
export function classifyNearMissQuery(raw: string): NearMissGate {
  const k = (raw ?? '').toLowerCase().replace(/\s+/g, '')
  if (!k) return 'blocked'
  if (GATE_BRAND.test(k)) return 'blocked'
  if (GATE_LEGAL.test(k)) return 'blocked'
  if (GATE_MEDS.test(k) && !/염색약/.test(k)) return 'blocked'
  if (GATE_YOUNG.test(k)) return 'blocked'
  if (GATE_AGE_TRAP.test(k)) return 'blocked'
  if (GATE_REVIEW.test(k)) return 'needs_review'
  if (GATE_CORE.test(k)) return 'pass'
  if (GATE_AGE.test(k) && GATE_GENERIC.test(k)) return 'pass_conditional'
  if (GATE_AGE.test(k) || GATE_GENERIC.test(k)) return 'needs_review'
  return 'blocked'
}

