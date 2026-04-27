# 회원가입 유도 배너 운영 기획서 (F01)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

로그인 없이 콘텐츠를 탐색하는 비회원에게 자연스럽게 회원가입을 유도한다.
강제 팝업이 아닌 체류 + 스크롤 조건을 충족한 사용자에게만 노출해 거부감을 최소화한다.

---

## 배경

- 우나어는 50~60대 커뮤니티 — 회원가입 허들을 낮추는 것이 핵심
- 카카오 로그인 1버튼 가입 구조 → 진입 장벽 최소화
- 비회원도 콘텐츠를 충분히 탐색한 뒤 가입 의향이 생겼을 때 제안 → 전환율 ↑
- 인앱 브라우저 → 외부 브라우저 유도 시 `?signup=1` 파라미터로 자동 트리거

---

## 세부 기획

### 노출 조건 (AND 조건)

| 조건 | 값 |
|------|-----|
| 비로그인 상태 | - |
| 체류 시간 | 20초 이상 |
| 스크롤 | 50% 이상 |
| 세션 표시 제한 | `MAX_SHOWS=4` (localStorage: `signup_banner_count`) |
| 활성 경로 | `/community/`, `/magazine/`, `/jobs/`, `/best` |
| 제외 경로 | `/`, `/login`, `/signup`, `/onboarding`, `/admin` |

**예외**: `?signup=1` 파라미터 → 5초 카운트다운 후 자동 노출 (인앱→외부브라우저 유도용)

### A/B/C 변형 (랜덤 배정, localStorage `signup_variant` 고정)

| 변형 | 핵심 카피 |
|------|---------|
| A | "우리 또래끼리 모인 공간이에요" |
| B | "50·60대만 아는 정보, 여기 다 있어요" |
| C | "가입하면 더 많은 이야기가 펼쳐져요" |

### GTM 이벤트 추적

| 이벤트 | 발생 시점 |
|--------|---------|
| `gtmSignupBannerEligible` | 노출 조건 충족 시 |
| `gtmSignupBannerShown` | 배너 실제 표시 시 |
| `gtmSignupBannerClicked` | CTA 버튼 클릭 시 |
| `gtmSignupBannerDismissed` | X 닫기 클릭 시 |

---

## 관련 링크

- 코드: `src/components/common/SignupPromptBanner.tsx`
- 렌더 위치: `src/app/(main)/layout.tsx:38`
- 온보딩 완료: `src/components/features/onboarding/OnboardingForm.tsx` (signup_completed_at 설정)
- PRD: `docs/prd/PRD_Final_A_서비스_고객웹.md`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | - | - | - |
