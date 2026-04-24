# 07. 설정 (닉네임/폰트/차단/탈퇴/동의)

## 개요
로그인 사용자가 닉네임 변경, 글자 크기, 정보 공개, 차단 관리, 회원 탈퇴를 한 페이지에서 관리하는 설정 허브 기능.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/my/settings` | 설정 메인 페이지 (닉네임/폰트/정보공개/차단/탈퇴 섹션 통합) | ✅ (미인증 시 `/login` 리다이렉트) |

> **참고:** 설정 하위 기능은 별도 라우트 없이 `/my/settings` 단일 페이지 내 섹션으로 구성됨.

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET/POST | `/api/auth/[...nextauth]` | NextAuth 인증 핸들러 (세션 관리) | - |

> ⚠️ 설정 기능 전용 API 엔드포인트 코드가 제공되지 않음. 닉네임 변경, 폰트 변경, 정보공개 토글, 차단 관리, 탈퇴 처리 각각의 API Route가 존재할 것으로 추정되나 **현재 제공된 코드만으로는 확인 불가**.

---

## 데이터 모델 (주요 필드)

### User (설정 관련 핵심 필드)

| 필드 | 타입 | 설명 |
|------|------|------|
| `nickname` | `String` (unique) | 표시 닉네임 |
| `nicknameChangedAt` | `DateTime?` | 닉네임 마지막 변경 시각 (변경 가능 여부 판단에 사용) |
| `fontSize` | `FontSize` | 글자 크기 설정 (enum: NORMAL 기본값) |
| `isGenderPublic` | `Boolean` | 성별 공개 여부 (기본 false) |
| `isRegionPublic` | `Boolean` | 지역 공개 여부 (기본 false) |
| `status` | `UserStatus` | 계정 상태 (ACTIVE / 정지 / 탈퇴 등) |
| `withdrawnAt` | `DateTime?` | 탈퇴 처리 시각 |
| `marketingOptIn` | `Boolean` | 마케팅 수신 동의 (기본 false) |
| `blocksInitiated` | `UserBlock[]` | 내가 차단한 사용자 목록 |
| `blocksReceived` | `UserBlock[]` | 나를 차단한 사용자 목록 |

### Agreement (약관 동의)

| 필드 | 타입 | 설명 |
|------|------|------|
| `userId` | `String` | 대상 사용자 |
| `type` | `AgreementType` | 약관 종류 (enum) |
| `version` | `String` | 약관 버전 |
| `agreedAt` | `DateTime` | 동의 시각 |

- `[userId, type, version]` 복합 unique → 동일 버전 중복 동의 방지

### `getMySettings` 반환 구조 (쿼리 기반 추정)

| 항목 | 출처 |
|------|------|
| `nickname` | `User.nickname` |
| `nicknameChangedAt` | `User.nicknameChangedAt` |
| `canChangeNickname` | 비즈니스 로직 계산값 (아래 참조) |
| `fontSize` | `User.fontSize` |
| `isGenderPublic` | `User.isGenderPublic` |
| `isRegionPublic` | `User.isRegionPublic` |

---

## 핵심 비즈니스 로직

### 1. 닉네임 변경 가능 여부 (`canChangeNickname`)
- `getMySettings` 쿼리에서 `canChange` 값을 계산하여 `NicknameSettings`에 props로 전달
- `nicknameChangedAt` 기반으로 일정 기간 내 재변경을 제한하는 쿨다운 로직이 존재함을 확인 (정확한 기간은 제공된 코드로 미확인)
- `NicknameSettings`는 `canChange: boolean`, `lastChangedAt: DateTime?` 두 값을 수신

### 2. 정보 공개 설정
- `isGenderPublic`, `isRegionPublic` 각각 독립적으로 토글 가능
- `PrivacySettings` 컴포넌트가 현재 상태값을 props로 수신하여 초기 렌더링

### 3. 인증/접근 제어
- 페이지 서버 컴포넌트에서 `auth()` 세션 확인
- `session?.user?.id` 없거나 `getMySettings` 결과 없으면 `/login` 리다이렉트
- 미인증 사용자의 설정 페이지 직접 접근 차단

### 4. 차단 관리
- `BlockedUserList` 컴포넌트가 차단 목록 표시 담당
- `UserBlock` 양방향 관계(`blocker` / `blocked`)로 모델링됨

### 5. 회원 탈퇴
- `WithdrawSection` 컴포넌트가 탈퇴 처리 담당
- `withdrawnAt` 필드에 탈퇴 시각 기록 (소프트 딜리트 방식 추정)
- `Agreement`는 `onDelete: Cascade` → 탈퇴 시 동의 기록 연쇄 삭제

---

## UI 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|----------|------|------|
| `MySettingsPage` | `src/app/(main)/my/settings/page.tsx` | 설정 페이지 서버 컴포넌트. 세션 확인, 설정 데이터 fetch, 각 섹션 조립 |
| `NicknameSettings` | `components/features/my/NicknameSettings` | 닉네임 변경 UI. 현재 닉네임, 변경 가능 여부, 마지막 변경일 표시 |
| `FontSizeSettings` | `components/features/my/FontSizeSettings` | 글자 크기 선택 UI. `FontSize` enum 값 기반 옵션 제공 |
| `PrivacySettings` | `components/features/my/PrivacySettings` | 성별/지역 공개 여부 토글 UI |
| `BlockedUserList` | `components/features/my/BlockedUserList` | 차단한 사용자 목록 조회 및 차단 해제 UI |
| `WithdrawSection` | `components/features/my/WithdrawSection` | 회원 탈퇴 안내 및 탈퇴 실행 UI |

### 페이지 레이아웃
- 최대 너비 `720px`, 중앙 정렬
- 상단 `← 마이페이지` 백네비게이션 링크 (`/my`)
- 각 기능은 `bg-card rounded-2xl border` 카드 섹션으로 분리

---

## 미완성/TODO 항목

| 구분 | 내용 | 근거 |
|------|------|------|
| ⚠️ 코드 미제공 | `NicknameSettings` 컴포넌트 내부 구현 미확인 | 파일 미포함 — 닉네임 유효성 검사 규칙, API 호출 방식 불명 |
| ⚠️ 코드 미제공 | `FontSizeSettings` 내부 구현 미확인 | `FontSize` enum 실제 옵션값(예: SMALL/NORMAL/LARGE) 미확인 |
| ⚠️ 코드 미제공 | `BlockedUserList` 내부 구현 미확인 | 차단 목록 API 경로, 차단 해제 로직 미확인 |
| ⚠️ 코드 미제공 | `WithdrawSection` 내부 구현 미확인 | 탈퇴 확인 플로우(모달/확인 문구 등), 탈퇴 API 경로 미확인 |
| ⚠️ 코드 미제공 | `PrivacySettings` 내부 구현 미확인 | 토글 API 호출 방식, 낙관적 업데이트 여부 미확인 |
| ⚠️ 코드 미제공 | `getMySettings` 쿼리 구현 미확인 | `canChangeNickname` 계산 로직(쿨다운 기간) 미확인 |
| ⚠️ 코드 미제공 | 설정 변경 전용 API Route 미제공 | PATCH/PUT 엔드포인트 경로 및 검증 로직 미확인 |
| ⚠️ 미노출 | `Agreement`(약관 동의) UI 섹션 없음 | DB 모델은 존재하나 설정 페이지에 약관 동의 관련 섹션이 렌더링되지 않음 — 온보딩 전용 기능이거나 미구현 가능성 |
| ⚠️ 미노출 | `marketingOptIn` 토글 UI 없음 | DB 필드는 존재하나 설정 페이지에 마케팅 수신 동의 변경 UI 미포함 |