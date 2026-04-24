# 08. 인증 (카카오 OAuth/온보딩/세션/등급)

## 개요
카카오 OAuth 2.0 기반 소셜 로그인으로 회원가입/로그인을 처리하고, 신규 사용자에게 닉네임 설정 온보딩을 진행하며, JWT 세션에 사용자 상태·역할·등급을 유지하는 인증 체계.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/login` | 카카오 로그인 버튼 화면. `callbackUrl` 쿼리 파라미터로 로그인 후 리다이렉트 경로를 받음 | 불필요 |
| `/onboarding` | 신규 가입자 닉네임(프로필) 설정 화면 | 필요 (카카오 인증 완료 후) |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/auth/[...nextauth]` | NextAuth.js 표준 핸들러 — OAuth 콜백, 세션 조회, CSRF 토큰 등 처리 | 불필요 |
| POST | `/api/auth/[...nextauth]` | NextAuth.js 표준 핸들러 — 로그인/로그아웃 액션 처리 | 불필요 |

> NextAuth.js 내부에서 처리되는 경로: `/api/auth/signin`, `/api/auth/signout`, `/api/auth/callback/kakao`, `/api/auth/session`, `/api/auth/csrf`

---

## 데이터 모델 (주요 필드)

### User
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `providerId` | String (unique) | 카카오 사용자 ID |
| `nickname` | String (unique) | 사용자 닉네임. 신규 가입 시 `user_{카카오ID 뒤 8자리}` 임시값 부여 |
| `email` | String? | 카카오 계정 이메일 (선택 동의) |
| `profileImage` | String? | 카카오 프로필 이미지 URL |
| `birthYear` | Int? | 카카오 계정 출생연도 (선택 동의) |
| `gender` | String? | 카카오 계정 성별 (선택 동의) |
| `role` | Role (enum) | 권한 (`USER` 기본값) |
| `grade` | Grade (enum) | 등급 (`SPROUT` 기본값) |
| `status` | UserStatus (enum) | 계정 상태 (`ACTIVE` / `SUSPENDED` / `BANNED` / `WITHDRAWN`) |
| `suspendedUntil` | DateTime? | 정지 만료일시 |
| `withdrawnAt` | DateTime? | 탈퇴 처리 일시 |
| `lastLoginAt` | DateTime | 마지막 로그인 일시 |

### Agreement
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `userId` | String | User FK |
| `type` | AgreementType (enum) | 약관 종류 |
| `version` | String | 약관 버전 |
| `agreedAt` | DateTime | 동의 일시 |

> `(userId, type, version)` 복합 유니크 — 동일 버전 중복 동의 방지

---

## 핵심 비즈니스 로직

### 1. 카카오 로그인 흐름 (signIn 콜백)
1. Provider가 `kakao`이고 `profile`이 존재해야만 로그인 허용.
2. `providerId`로 기존 User 조회:
   - **WITHDRAWN(탈퇴 유예)** 상태 → `status: ACTIVE`, `withdrawnAt: null`로 자동 복구 후 로그인 허용.
   - **BANNED(영구 차단)** 상태 → 로그인 거부 (`return false`).
   - **SUSPENDED(정지)** 상태:
     - `suspendedUntil > 현재시각` → 로그인 거부.
     - `suspendedUntil ≤ 현재시각` (기간 만료) → `status: ACTIVE`, `suspendedUntil: null`로 자동 해제 후 로그인 허용.
3. 신규/기존 모두 통과하면 `return true`.

### 2. JWT 토큰 생성·갱신 (jwt 콜백)

#### 신규 가입
- DB에 User가 없으면 임시 닉네임 `user_{providerId 뒤 8자리}`로 User 레코드 생성.
- 카카오 프로필에서 `email`, `profileImage`, `birthYear`, `gender`를 가져와 저장.
- 토큰에 `needsOnboarding: true` 설정 → 미들웨어/클라이언트가 온보딩 리다이렉트 판단에 활용.

#### 기존 사용자 재로그인
- `lastLoginAt`을 현재 시각으로 갱신.
- 닉네임이 `user_`로 시작하면 `needsOnboarding: true`, 아니면 `false`.

#### 세션 갱신 (trigger: 'update')
- 클라이언트가 `unstable_update`를 호출할 때 `session.user` 또는 `session`에 포함된 `needsOnboarding`, `nickname`, `grade` 값을 토큰에 반영 (온보딩 완료 후 세션 즉시 반영에 활용).

#### 기존 세션 유지 (재접속)
- DB에서 User를 재조회해 최신 `role`, `grade`, `nickname`, `profileImage` 반영.
- DB에 User가 없으면 토큰의 사용자 관련 필드를 모두 `undefined`로 초기화 → 클라이언트 재로그인 유도.

### 3. JWT 토큰에 포함되는 커스텀 필드
| 필드 | 설명 |
|------|------|
| `userId` | User.id |
| `role` | User.role (권한) |
| `grade` | User.grade (등급) |
| `nickname` | 닉네임 |
| `profileImage` | 프로필 이미지 URL |
| `needsOnboarding` | 온보딩 미완료 여부 |

### 4. 온보딩 판별 기준
- 닉네임이 `user_` 접두사로 시작하는 경우 온보딩 미완료로 판단.

---

## UI 컴포넌트

| 컴포넌트 | 경로 | 역할 |
|---------|------|------|
| `LoginForm` | `src/components/features/login/LoginForm.tsx` | 로그인 페이지의 카카오 로그인 UI. `callbackUrl` prop을 받아 로그인 후 리다이렉트 처리 |
| `OnboardingForm` | `src/components/features/onboarding/OnboardingForm.tsx` | 닉네임 설정 온보딩 폼. 온보딩 완료 후 `unstable_update`로 세션의 `needsOnboarding: false` 갱신 |
| `LoginPromptModal` | `src/components/features/auth/LoginPromptModal.tsx` | 비로그인 사용자가 인증 필요 액션 시도 시 표시되는 모달. ESC 키·오버레이 클릭으로 닫기. 모바일은 하단 시트, 데스크탑은 중앙 팝업으로 반응형 렌더링. 카카오 로그인 버튼으로 `/login` 이동 |

---

## 미완성/TODO 항목

| 위치 | 내용 | 비고 |
|------|------|------|
| `src/lib/auth.ts` — `unstable_update` export | NextAuth v5의 `unstable_update` API 사용 — 정식 안정 API가 아님. 추후 안정화 버전으로 교체 필요 | `unstable_` 접두사 명시 |
| `LoginForm` 컴포넌트 | 코드 파일 미제공 — 실제 카카오 로그인 버튼 구현 및 에러 처리 방식 확인 불가 | 파일 분석 대상 외 |
| `OnboardingForm` 컴포넌트 | 코드 파일 미제공 — 닉네임 유효성 검증 규칙, Agreement(약관 동의) 연동 여부, 세션 업데이트 방식 확인 불가 | 파일 분석 대상 외 |
| `auth.config.ts` | 파일 미제공 — 미들웨어용 경량 설정(pages, providers, 기본 callbacks 등) 내용 확인 불가 | 파일 분석 대상 외 |
| `Agreement` 모델 연동 | DB 스키마에 `Agreement` 모델이 정의되어 있으나, 분석된 코드 범위 내에서 약관 동의 저장·검증 로직이 발견되지 않음 | 온보딩 플로우에서 처리될 가능성 있음 |
| `regions`, `interests` 필드 | User 모델에 존재하나 인증/온보딩 코드에서 설정 로직이 확인되지 않음 | 온보딩 또는 프로필 편집에서 처리될 가능성 있음 |
| WITHDRAWN 상태 복구 순서 | `signIn` 콜백에서 WITHDRAWN → ACTIVE 복구 처리 후 `jwt` 콜백에서 동일 `providerId`로 재조회 시 상태가 이미 변경된 상태이므로 복구 로직이 두 콜백에 걸쳐 암