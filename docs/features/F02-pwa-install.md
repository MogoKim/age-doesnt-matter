# PWA 설치 유도 운영 기획서 (F02)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

앱 스토어 등록 없이 홈 화면 추가(PWA) 설치를 유도해 재방문율을 높인다.
4단계 트리거로 사용자 여정 단계에 맞는 시점에 자연스럽게 제안한다.

---

## 배경

- iOS/Android 네이티브 앱 없음 → PWA로 앱 수준 경험 제공
- 홈 화면 추가 = 재방문 진입점 확보 → DAU/MAU 지표 직결
- 강제 팝업 금지 — 사용자가 서비스 가치를 경험한 시점에만 제안

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

### localStorage 키 목록

| 키 | 용도 |
|----|------|
| `pwa_shown_count` | 총 노출 횟수 |
| `pwa_decline_count` | 거절 횟수 |
| `pwa_last_shown` | 마지막 노출 타임스탬프 |
| `pwa_page_views_after_signup` | Phase 2 카운터 |
| `signup_completed_at` | 온보딩 완료 시각 |

---

## 관련 링크

- 코드: `src/components/common/AddToHomeScreen.tsx`
- 렌더 위치: `src/app/layout.tsx` (RootLayout 전역 등록)
- 온보딩 연결: `src/components/features/onboarding/OnboardingForm.tsx`
- 스펙 문서: `docs/prd/pwa-install-spec.md`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | `@pwa-phase3` E2E 테스트 CI 미실행 | CI는 `@smoke`만 실행 | 로컬에서만 수동 검증 필요 |
