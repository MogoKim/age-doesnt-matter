/**
 * A/B 실험 중앙 레지스트리 — 단일 진실의 원천(SSOT)
 *
 * 새 실험 추가 표준 절차:
 *  1) 이 파일에 ExperimentDef 추가 (목적·배경·가설·확인방법 자연어 필수 — 다음 사람이 이해하게)
 *  2) 컴포넌트에서 getExperimentVariant(id) 호출 (직접 해시 만들지 말 것 — assign.ts만 사용)
 *  3) trackEvent(exposureEvent, { [variantProperty]: variant }) 로 노출 기록
 *  4) 배포 → 어드민 /admin/ab-tests 에서 상태 ACTIVE + 담당·시작일 입력
 *  5) 신뢰 배지가 "유의미(95%)" 뜨면 어드민에 결론 작성 + 종료
 *
 * variant.key 는 EventLog properties 에 그대로 저장되므로 한 번 정하면 변경 금지.
 */

export interface ExperimentVariant {
  /** EventLog properties 에 저장되는 값 (변경 금지) */
  key: string
  /** 어드민 표시명 (짧게) */
  label: string
  /** 어드민 상세 설명 — 이 variant가 실제로 무엇인지(문구 전문·동작) */
  description: string
  /** 배정 가중치 (정수, 합으로 분배) */
  weight: number
}

export interface ExperimentDef {
  id: string
  name: string
  /** 목적 — 왜 하나 */
  purpose: string
  /** 배경 — 어떤 문제/맥락에서 */
  background: string
  /** 가설 */
  hypothesis: string
  /** 확인방법 — 어떤 이벤트로 어떻게 측정하나 */
  howToVerify: string
  owner: string
  variants: ExperimentVariant[]
  /** 노출 이벤트명 (EventLog eventName) */
  exposureEvent: string
  /** 전환 이벤트명 (같은 sessionId join 으로 전환 판정) */
  conversionEvent: string
  /** 이벤트 properties 에서 이 실험의 variant 를 담는 키 */
  variantProperty: string
  /** 기존 하드코딩 배정과의 호환: localStorage 키 (없으면 exp_{id}) */
  legacyStorageKey?: string
  /** 기존 해시 분기 호환: 해시에 더하는 오프셋 (예: 타이밍 실험은 +7 로 콘텐츠와 직교) */
  hashOffset?: number
}

export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'f01_signup_content',
    name: '가입 배너 문구 A/B/C',
    purpose: '가입 유도 배너의 헤드라인·문구를 바꾸면 가입 전환이 오르는지 본다.',
    background:
      '비회원에게 뜨는 가입 배너(SignupPromptBanner)의 메시지 프레임이 클릭·가입에 영향을 주는지 검증 필요.',
    hypothesis: '혜택/재미/공감 중 어떤 메시지 프레임이 50·60대 비회원의 가입 전환을 높인다.',
    howToVerify:
      'signup_banner_shown(노출, content_variant) → 같은 sessionId 의 sign_up(가입)으로 variant별 전환율 비교. 봇·창업자 제외.',
    owner: '영석',
    variants: [
      { key: 'A', label: 'A · 혜택형', description: '제목 "가입하면 더 많이 즐길 수 있어요" / 부제 "소중한 내 일상과 생각들을 간직해봐요" / 버튼 "카카오로 바로 시작하기"', weight: 1 },
      { key: 'B', label: 'B · 재미형', description: '제목 "가입하고 더 재미있게 놀다 가세요" / 부제 "혼자 읽기 아까운 글, 함께 나눠봐요" / 버튼 "3초만에 카카오로 시작"', weight: 1 },
      { key: 'C', label: 'C · 공감형', description: '제목 "나만 이런 게 아니었네?" / 부제 "우리끼리 편하게 수다 떨어봐요" / 버튼 "카카오 한 번 클릭으로 가입"', weight: 1 },
    ],
    exposureEvent: 'signup_banner_shown',
    conversionEvent: 'sign_up',
    variantProperty: 'content_variant',
    legacyStorageKey: 'signup_variant',
  },
  {
    id: 'f01_signup_timing',
    name: '가입 배너 노출 타이밍 A/B',
    purpose: '가입 배너를 정독 도중이 아니라 거의 다 읽었을 때 띄우면 가입이 오르는지 본다.',
    background:
      '정독자 재방문 100% vs 미정독 14%. 기존 배너는 20초/50% 스크롤로 정독을 끊어 정독을 방해.',
    hypothesis: '글을 거의 다 읽은(85%) 시점에 유도하면 정독을 안 끊고 마음 동한 순간 포착 → 가입↑.',
    howToVerify:
      'signup_banner_shown(노출, trigger_variant) → 같은 sessionId 의 sign_up 으로 variant별 전환율 비교.',
    owner: '영석',
    variants: [
      { key: 'read_complete', label: '정독 완료 후(85%)', description: '글을 85%까지 읽으면 배너 표시. 안 읽고 떠나면 60초 후 표시(백스톱). 정독을 끊지 않는 방식.', weight: 1 },
      { key: 'early', label: '현행(20초/50%)', description: '20초 머물거나 페이지 50% 스크롤 중 먼저 충족되면 배너 표시. 읽는 도중에도 뜰 수 있음.', weight: 1 },
    ],
    exposureEvent: 'signup_banner_shown',
    conversionEvent: 'sign_up',
    variantProperty: 'trigger_variant',
    hashOffset: 7,
  },
  {
    id: 'twa01_entry_gate',
    name: 'TWA 첫 진입 가입 게이트',
    purpose: '앱(TWA) 설치자에게 가입 허들을 앞에 두면(게이트) 진짜 회원이 늘고 재방문이 오르는지 본다.',
    background:
      '앱 설치자는 재방문 10%로 동기 높은데 가입은 4%로 낮음. 웹은 "정독 후 가입"(허들 뒤)이지만, 앱 설치자는 "가입 먼저"(허들 앞)가 나을 수 있다는 반대 가설.',
    hypothesis: '동기 높은 앱 설치자는 게이트를 통과해 진성 가입 → 회원 경험으로 재방문↑. 단 함정=가입률(강제라 당연 높음), 정답=가입 후 재방문.',
    howToVerify:
      'twa_gate_view(노출, twa_gate_variant) → 같은 sessionId/userId 의 sign_up + 가입 후 TWA 재방문(D1/D7)으로 variant별 비교. A(현행)가 baseline. 봇 제외. 대상=신규 TWA만.',
    owner: '영석',
    variants: [
      { key: 'A', label: 'A · 현행(대조군)', description: '게이트 없음. 앱 열면 홈이 바로 보이고 자유롭게 둘러봄(현재와 동일). baseline.', weight: 34 },
      { key: 'B', label: 'B · soft 게이트', description: '둘러볼 수 있되 세션 내 글 2~3개 열람 시점에 "계속 보려면 카카오로 시작" 부드럽게 등장.', weight: 33 },
      { key: 'C', label: 'C · hard 게이트', description: '첫 화면이 가입/로그인("우리 또래 이야기, 카카오로 1초" + 작게 "먼저 둘러볼게요" 탈출구).', weight: 33 },
    ],
    exposureEvent: 'twa_gate_view',
    conversionEvent: 'sign_up',
    variantProperty: 'twa_gate_variant',
    hashOffset: 11,
  },
]

export function getExperiment(id: string): ExperimentDef | undefined {
  return EXPERIMENTS.find((e) => e.id === id)
}
