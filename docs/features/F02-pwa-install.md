# PWA 설치 유도 운영 기획서 (F02)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-08-06

---

## 목표

앱 스토어 등록 없이 홈 화면 추가(PWA) 설치를 유도해 재방문율을 높인다.
4단계 트리거로 사용자 여정 단계에 맞는 시점에 자연스럽게 제안한다.

---

## 배경

- (작성 시점 배경) iOS/Android 네이티브 앱 없음 → PWA로 앱 수준 경험 제공
  - ⚠️ 이후 상황 변경: Android는 **Play스토어 TWA 앱 출시 완료**(`com.agenotmatter.app`), Capacitor 네이티브 shell도 존재. 따라서 **Android는 PWA가 아니라 Play스토어로 유도**한다(2026-06-05 분기). PWA 경로가 남아 있는 건 **iOS뿐**이다.
- 홈 화면 추가 = 재방문 진입점 확보 → North Star(주간 재방문 참여 유저 수)의 선행 레버
- 강제 팝업 금지 — 사용자가 서비스 가치를 경험한 시점에만 제안

---

## ⚠️ 현재 운영 상태 (읽기 전 필수)

| 구분 | 내용 |
|------|------|
| **코드 기준** | `AddToHomeScreen`(팝업·하단배너·인앱 유도배너 3종) · `PwaInlineBanner`의 useEffect는 전부 `NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true'` 가드로 **즉시 return** 한다. 즉 플래그가 `'true'`가 아니면 이 문서의 4단계 트리거는 **하나도 동작하지 않는다.** |
| **운영 플래그 확인 필요** | 실제 프로덕션 값은 **Vercel 환경변수 콘솔에서 직접 확인**해야 한다. 로컬 `.env.local`에는 이 키가 없다(=OFF). 문서·메모리가 아니라 콘솔이 진실의 원천이다. |
| **플래그와 무관하게 항상 동작** | ① 홈 FAQ 앱 설치 안내(`AppInstallFaqAnswer` — 안드=Play스토어 / 아이폰=홈 화면 추가 3단계) ② `/go/[src]` 외부 유입 앱 분기(`GoRedirect`) ③ 글 상세 회원 설치 CTA(`PostCTA`) 중 **안드로이드 Play스토어 경로** |
| **플래그 OFF일 때 감춰지는 것** | `PostCTA`의 **iOS(비-안드로이드) 설치 CTA**. iOS 경로는 `pwa-prompt` 이벤트에 의존하는데 그 리스너를 `AddToHomeScreen`이 등록하지 않으므로, 눌러도 반응 없는 헛버튼이 된다 → 2026-08-06부터 CTA 자체를 숨긴다. 플래그를 켜면 자동 복귀. |

> 재활성화 전 주의: OFF 기간에도 과거 사용자의 브라우저에는 `pwa_shown_count`·`pwa_declined_count` 값이 남아 있다. 그대로 켜면 `weekly` 트리거 조건(`shownCount >= 2`)을 이미 충족한 사용자에게 즉시 팝업이 뜬다. 켜기 전 잔존 카운터 처리 방안을 먼저 정할 것.

---

## 세부 기획

### 4단계 트리거

| 단계 | 트리거 이름 | 조건 | 노출 시점 |
|------|-----------|------|---------|
| Phase 1 | `first_15s` | `shownCount === 0` (첫 방문) | 13초 후 |
| Phase 2 | `signup` | `shownCount < 2` + `signup_completed_at` 설정 후 3페이지 탐색 | 3페이지 도달 시 |
| Phase 3 | `engagement` | `shownCount < 3` + 글/댓글 작성 후 | 작성 직후 |
| Phase 4 | `weekly` | `declineCount < 3` + `shownCount >= 2` + 7일 경과 | 주기적 재노출 |

### Phase 2 상세 (signup 트리거)

```
온보딩 3단계 완료 → signup_completed_at 로컬스토리지 저장
→ 이후 페이지 뷰마다 KEY_PAGE_VIEWS_AFTER_SIGNUP 카운터 증가
→ PAGE_VIEW_TRIGGER_THRESHOLD(=3) 도달 시 PWA 팝업 표시
```

### 제외 경로 (팝업 미표시)

`/login`, `/signup`, `/onboarding`

### storage 키 목록 (코드 기준 — `AddToHomeScreen.tsx` 상수와 1:1)

**localStorage**

| 키 | 용도 |
|----|------|
| `pwa_shown_triggers` | 이미 소진한 트리거 목록 (JSON 배열) |
| `pwa_shown_count` | 총 노출 횟수 |
| `pwa_declined_count` | 거절 횟수 (`MAX_DECLINES=3` 도달 시 weekly 정지) |
| `pwa_last_prompted_at` | 마지막 노출 타임스탬프 (ISO, weekly 7일 계산용) |
| `pwa_session_count` | 방문 세션 누적 횟수 |
| `pwa_installed` | 설치 완료 플래그 (`'1'`) |
| `pwa_page_views_after_signup` | Phase 2 카운터 |
| `pwa_kakao_guide_at` / `pwa_naver_guide_at` / `pwa_instagram_guide_at` | 인앱 유도 배너 3일 쿨다운 |
| `signup_completed_at` | 온보딩 완료 시각 (F01 `OnboardingForm`이 기록) |

**sessionStorage**

| 키 | 용도 |
|----|------|
| `pwa_visited_this_session` | 세션 카운트 중복 방지 |
| `pwa_shown_this_session` | 세션 내 팝업 1회 제한 — `PushPermissionToast`가 이 키를 읽어 양보한다 |
| `pwa_banner_shown_this_session` | 세션 내 하단 배너 1회 제한 |
| `pwa_inline_shown` | `PwaInlineBanner` 세션 1회 제한 |
| `signup_prompt_shown_this_session` | **F01 소유 키** — 세팅돼 있으면 PWA 팝업·인라인 배너가 양보한다 |

---

## 관련 링크

- 코드: `src/components/common/AddToHomeScreen.tsx`
- 렌더 위치: `src/app/layout.tsx` (RootLayout 전역 등록)
- 온보딩 연결: `src/components/features/onboarding/OnboardingForm.tsx`
- 진입점 분기: `src/lib/app-links.ts` (`triggerAppInstall` — 안드=Play스토어 / 그 외=`pwa-prompt` 이벤트)
- 플래그와 무관한 설치 진입점: `src/components/features/home/AppInstallFaqAnswer.tsx`, `src/app/go/GoRedirect.tsx`
- 스펙 문서: `docs/prd/pwa-install-spec.md` — ⚠️ `FooterPwaButton` 렌더를 전제로 쓰여 있으나 그 컴포넌트는 2026-08-06 삭제됨(아래 히스토리). 스펙 문서 정정은 별건.

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 | Feature Lifecycle 도입 |
| 2026-05-13 | AddToHomeScreen·PwaInlineBanner·FooterPwaButton useEffect에 `NEXT_PUBLIC_PWA_INSTALL_ENABLED !== 'true'` 가드 추가 — 잠정 홀드 처리 | PWA 설치 유도 전략 재검토 결정. env var 하나로 재활성화 가능하도록 코드 보존 |
| 2026-06-05 | 안드=Play스토어 / iOS=PWA 분리. manifest `prefer_related_applications:true` + `related_applications`(com.agenotmatter.app) 추가로 안드 자동 PWA 차단. 설치 진입점(PostCTA/Footer/Inline)은 `triggerAppInstall()`(src/lib/app-links.ts)로 안드→Play, iOS→홈화면추가 분기 | TWA 앱 Play스토어 출시 완료 → 채널 혼란(PWA/Play 동시 유도) 정리 |
| 2026-08-06 | **문서를 코드 기준으로 정정** — ① 상단에 "현재 운영 상태" 표 추가(플래그 OFF 시 4단계 트리거 전부 미동작 / 플래그 무관 진입점 분리 명시) ② storage 키 표를 실제 상수와 1:1로 교정(`pwa_decline_count`→`pwa_declined_count`, `pwa_last_shown`→`pwa_last_prompted_at`, 누락 6키 추가, sessionStorage 표 신설) | 문서가 코드와 달라 재활성화 판단의 근거로 쓸 수 없었음 |
| 2026-08-06 | **`FooterPwaButton.tsx` 삭제** (footer 리디자인으로 렌더 트리에서 빠진 뒤 import 0건 상태로 잔존). 함께 `FooterChannelLinks.tsx`(footer 간소화 v1에서 제거된 SNS·Google Play 블록)도 삭제 | orphan 컴포넌트가 "설치 진입점이 있다"는 오해를 만들고, 재활성화 시 안드 중복 유도 위험 |
| 2026-08-06 | **`PostCTA` iOS 설치 CTA를 플래그 연동으로 변경** — 안드로이드가 아닌 경로는 `NEXT_PUBLIC_PWA_INSTALL_ENABLED === 'true'`일 때만 CTA 노출 | 플래그 OFF 상태에서 iOS 회원에게 "홈 화면에 추가하기" 버튼이 보이지만 `pwa-prompt` 리스너가 없어 눌러도 무반응(헛클릭). 환경이 아닌 플래그로 판정하므로 켜면 자동 복귀 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | `@pwa-phase3` E2E 테스트 CI 미실행 | CI는 `@smoke`만 실행 | 로컬에서만 수동 검증 필요 |
