# 우리 나이가 어때서 — 마스터 TODO (Refined v1.2)

> 2026-03-16 작성 | v1.2: 디자인 시스템·Figma 워크플로우 추가, 네비게이션 재설계 반영
> 모든 트랙을 세부 기획 → 디벨롭 → 실제 개발 순서로 정리
> 각 항목마다 [결정사항], [세부 태스크], [의존성], [5060 고려사항] 포함

---

## 실행 순서 요약 (Critical Path)

```
A0(디자인시스템·Figma) ──┐
A10(컨벤션) ─────────────┤→ A1(회원) → A8(DB) → A9(API) → A7(공통UX) → A4(에디터) → A3(알림) → A2(마이페이지)
                          │→ A5(검색) → A6(페이지별UI) → A11(에이전트)
                          │
                          │→ B(환경세팅 + Figma MCP)
                          │   → C0(공통 + 디자인시스템 컴포넌트) → C1(인증) → C2(홈) → C3(일자리)
                          │     → C4(소통마당) → C5(매거진) → C6(베스트) → C7(검색) → C8(정적페이지)
                          │       → C9(어드민) → C10(인프라)
                          │         → D(QA + 시니어UI검증) → E(에이전트시스템)
```

> **A0(디자인)과 A10(컨벤션)은 병렬 진행 가능** — 둘 다 개발 시작 전 기반 작업

---

# TRACK A — 기획/설계 문서

## A0. 디자인 시스템 & Figma 워크플로우 `docs/design/DESIGN_WORKFLOW.md`

> **디자인은 코딩만큼 중요하다.** 처음부터 디자인 시스템을 잘 잡아야 일관된 시니어 친화 UI가 나온다.
> 상세 가이드: `docs/design/DESIGN_WORKFLOW.md` 참조

### 전략: 하이브리드 (Code-First + Figma 병행)

| 단계 | 작업 | 도구 | 의존성 |
|:---:|:---|:---|:---|
| 1 | 디자인 토큰 정의 | 코드 (CSS Variables) | PRD A1 (✅ 완료) |
| 2 | Figma 프로젝트 세팅 | Figma | 없음 |
| 3 | 핵심 화면 와이어프레임 (Lo-Fi) | Figma | PRD A3~A5 (✅ 완료) |
| 4 | IA(정보 구조도) | Figma | PRD A2 (✅ 완료) |
| 5 | Figma MCP 연동 | Claude Code + Figma MCP | B0에서 설치 |
| 6 | 컴포넌트 라이브러리 구현 | 코드 (React + CSS Modules) | C0에서 구현 |
| 7 | 페이지 개발 시 와이어프레임 참조 | Figma MCP로 읽기 | C1~C10 |
| 8 | 시니어 UI 검증 | Playwright + axe-core | D에서 검증 |

### A0-1. Figma 프로젝트 세팅

```
[ ] Figma 팀/프로젝트 생성 (우나어)
[ ] 4개 파일 구조:
    ├── 0. Design System (Colors, Typography, Components)
    ├── 1. IA (Sitemap, Navigation Flow, User Flow)
    ├── 2. Wireframes (Mobile + Desktop, 7개 핵심 화면)
    └── 3. Hi-Fi Mockup (Phase 2)
[ ] Figma Variables 등록 (PRD A1 컬러/타이포 토큰 전체)
[ ] 기본 컴포넌트 10종 생성 (Button, Card, Modal, Toast, Badge, Avatar, Input, Chip, FAB, Skeleton)
```

### A0-2. 핵심 와이어프레임 (Lo-Fi, 7개 화면)

> PRD A3~A5에 텍스트 와이어프레임은 있으나, Figma에서 시각화해야 실제 비율/배치 검증 가능.

```
[ ] 모바일 홈 — 상단바 + 아이콘 메뉴 + 히어로 + 섹션들
[ ] 모바일 내 일 찾기 (목록 + 상세) — Quick Tags + 카드 + 필터
[ ] 모바일 사는 이야기 (목록 + 상세 + 글쓰기) — FAB + 카드 + 댓글
[ ] 모바일 매거진 (목록 + 상세) — 2열 그리드 + CPS 슬롯
[ ] 모바일 검색 (오버레이 + 결과) — 탭 필터 + 카드
[ ] 모바일 마이페이지 — 프로필 + 메뉴 목록
[ ] 모바일 로그인/온보딩 — 카카오 로그인 + 4단계
[ ] 데스크탑 홈 — GNB 1행 + 3열 레이아웃
[ ] 데스크탑 소통 마당 — 사이드바 + 2열 카드
```

### A0-3. IA(정보 구조도)

```
[ ] Sitemap 시각화 (PRD A2 기반, 트리 다이어그램)
[ ] Navigation Flow 시각화:
    ├── 모바일: 상단바(로고+🔍+👤) → 아이콘 메뉴(5종) → FAB(글쓰기)
    └── 데스크탑: GNB 1행 → 콘텐츠 → 사이드바
[ ] User Flow 3개:
    ├── 가입 플로우: 카카오 로그인 → 약관 → 닉네임 → 추가정보 → 환영
    ├── 글쓰기 플로우: FAB → 로그인 체크 → 에디터 → 등록 → 상세
    └── 일자리 조회 플로우: 아이콘 메뉴 → 목록 → 필터 → 상세 → 지원
```

### A0-4. 디자인 ↔ 코드 동기화 규칙

| 원본 (Source of Truth) | 동기화 방향 | 방법 |
|:---|:---|:---|
| **코드 (tokens.css)** | 코드 → Figma | Figma Variables 수동 동기화 or MCP 검증 |
| **Figma (와이어프레임)** | Figma → 코드 | 개발 시 Figma MCP로 참조, 코드 구현 |
| **PRD (스펙)** | PRD → 둘 다 | PRD 변경 시 코드와 Figma 모두 반영 |

> **코드가 항상 최종 원본이다.** Figma는 시각적 참조/검증 도구.
> 불일치 발견 시 코드 기준으로 Figma 업데이트.

---

## A1. 회원 시스템 완전 정의 `docs/spec/AUTH_SPEC.md`

### 카카오 OAuth 수집 정보 설계

**카카오에서 가져올 수 있는 정보:**

| 항목 | 심사 필요 | 우리 서비스 수집 | 필수/선택 | 용도 |
|:---|:---:|:---:|:---:|:---|
| 회원번호 (providerId) | X | ✅ | 자동 | 계정 식별자 |
| 카카오 닉네임 | X | ✅ | 자동 | 초기 닉네임 제안용 (서비스 닉네임은 별도 설정) |
| 프로필 이미지 | X | ✅ | 자동 | 기본 프로필 이미지 |
| **이메일** | ✅ 심사 | ✅ | **선택** | 계정 복구, 알림 |
| **성별** | ✅ 심사 | ✅ | **선택** | 콘텐츠 개인화, 통계 |
| **출생연도** | ✅ 심사 | ✅ | **선택** | 연령대 파악, 콘텐츠 개인화 |
| **생일** | ✅ 심사 | ❌ | — | 불필요 |
| 이름(실명) | ✅ 심사 | ❌ | — | 수집 안 함 (닉네임 서비스) |
| 전화번호 | ✅ 심사 | ❌ | — | 수집 안 함 (개인정보 최소 수집) |

> **원칙**: 필수 수집은 최소한으로 (providerId + 닉네임 + 프로필이미지만).
> 나머지는 선택으로 가져가서 회원가입 허들을 낮춘다. 5060 사용자는 "왜 이것까지 물어봐?" 하면 이탈함.

### 카카오싱크 vs 일반 카카오 로그인

| 방식 | 장점 | 단점 | 결정 |
|:---|:---|:---|:---|
| 카카오싱크 | 서비스 약관 + 카카오 동의 한 화면 처리 | 비즈앱 전환 필요, 심사 | **✅ 권장 — 가입 스텝 최소화** |
| 일반 카카오 로그인 | 간단 | 약관 동의 별도 화면 필요 | 카카오싱크 심사 전 임시 사용 |

### 로그인 → 신규/기존 분기 플로우

```
[카카오 로그인 버튼 클릭]
  → 카카오 OAuth 인증
  → 콜백 수신 (providerId, nickname, profileImage, email?, gender?, birthYear?)
  → DB에서 providerId 조회
  │
  ├── [기존 회원] → 세션 생성 → 홈으로 이동
  │   └── status 확인: ACTIVE → 정상 / SUSPENDED → 정지 안내 / WITHDRAWN → 30일 내면 복구 안내
  │
  └── [신규 회원] → 온보딩 플로우 진입
      │
      ├── Step 1: 약관 동의 (필수)
      │   ├── ☑️ 서비스 이용약관 (필수) [전문보기]
      │   ├── ☑️ 개인정보 처리방침 (필수) [전문보기]
      │   ├── ☐ 마케팅 수신 동의 (선택)
      │   └── [전체 동의] 체크박스
      │   → 필수 2개 체크해야 [다음] 버튼 활성화
      │
      ├── Step 2: 프로필 설정 (필수)
      │   ├── 닉네임 입력 (카카오 닉네임 기본값으로 제안, 수정 가능)
      │   │   └── 실시간 중복 체크 + 규칙 검증 (debounce 300ms)
      │   └── 프로필 사진 (카카오 사진 기본, 변경 가능)
      │   → [다음] 또는 [완료] 버튼
      │
      ├── Step 3: 추가 정보 (선택 — 건너뛰기 가능)
      │   ├── 관심사 선택 (칩 UI, 최대 5개)
      │   │   예: 일자리, 건강, 요리, 여행, 재테크, 손주, 운동, 문화, 봉사, 반려동물
      │   ├── 지역 선택 (시/도 단위)
      │   └── [건너뛰기] [완료]
      │
      └── Step 4: 환영 화면
          ├── "환영합니다, {닉네임}님! 🌱"
          ├── "우나어에서 따뜻한 이야기 나눠요"
          └── [홈으로 가기] [일자리 보기] [소통 마당 가기]
```

### 닉네임 규칙

| 규칙 | 내용 |
|:---|:---|
| 길이 | 2~12자 |
| 허용 문자 | 한글, 영문, 숫자 |
| 금지 문자 | 특수문자, 공백, 이모지 |
| 금지 닉네임 | "운영자", "관리자", "admin", "우나어", 금지어 사전 포함 단어 |
| 중복 | 불가 (실시간 체크, 대소문자 무시) |
| 변경 | 30일에 1회 (마이페이지에서) |

### 약관 동의 항목

| 항목 | 필수/선택 | 저장 필드 |
|:---|:---:|:---|
| 서비스 이용약관 | **필수** | `termsAgreedAt` |
| 개인정보 처리방침 | **필수** | `privacyAgreedAt` |
| 마케팅 수신 동의 | 선택 | `marketingAgreedAt` (null이면 미동의) |

### 탈퇴 플로우

```
[마이페이지] → [계정 관리] → [탈퇴하기]
  → Step 1: 탈퇴 안내
    "탈퇴 시 30일간 데이터가 보관되며, 이후 완전 삭제됩니다."
    "30일 내 재로그인하면 탈퇴가 취소됩니다."
  → Step 2: 탈퇴 사유 (선택)
    ☐ 사용하지 않아요
    ☐ 원하는 콘텐츠가 없어요
    ☐ 다른 서비스를 이용해요
    ☐ 불편한 점이 있어요 → 텍스트 입력
    ☐ 기타
  → Step 3: 최종 확인
    "정말 탈퇴하시겠어요?" [취소] [탈퇴하기]
  → 처리: status=WITHDRAWN, withdrawnAt=now()
  → 30일 후 배치잡: 개인정보 삭제, 글은 "탈퇴한 사용자"로 익명화
```

### 어드민 계정 관리 ⭐ (창업자 요구사항 반영)

**핵심: 창업자가 언제든지 어드민 계정을 생성/관리할 수 있어야 함**

| 방식 | 설명 |
|:---|:---|
| **최초 어드민 (시드)** | `prisma/seed.ts`에서 창업자 카카오 providerId로 role=ADMIN 계정 자동 생성 |
| **추가 어드민 생성** | 어드민 패널 > 회원관리 > "어드민 계정 생성" 기능 |
| **어드민 생성 방식** | 카카오 로그인 기반이 아닌 **이메일+비밀번호 방식 별도 제공** |

**어드민 계정 생성 상세:**

```
[어드민] → [회원 관리] → [어드민 계정 관리]
  │
  ├── 어드민 목록 (닉네임, 이메일, 권한, 생성일, 마지막 로그인)
  │
  ├── [+ 어드민 추가]
  │   ├── 이메일 (로그인 ID로 사용)
  │   ├── 비밀번호 (최소 8자, 영문+숫자+특수문자)
  │   ├── 닉네임 (창업자가 자유롭게 설정)
  │   ├── 권한 레벨:
  │   │   ├── SUPER_ADMIN — 모든 권한 (창업자 전용)
  │   │   ├── ADMIN — 일반 운영 (콘텐츠/회원/모더레이션)
  │   │   └── EDITOR — 매거진/배너만
  │   └── [생성]
  │
  ├── 어드민 수정 (닉네임/비밀번호/권한 변경)
  └── 어드민 비활성화/삭제
```

> **로그인 분기**: /admin 접속 시 → 이메일+비밀번호 로그인 폼 (카카오 로그인과 별도)
> **일반 사용자 웹**: 카카오 로그인만
> **어드민 패널**: 이메일+비밀번호 로그인 (별도 인증 체계)

**DB 변경 필요사항:**
- `AdminUser` 테이블 별도 생성 (User 테이블과 분리)
- 또는 User 테이블에 `loginType: KAKAO | EMAIL` + `passwordHash` 추가
- **권장: AdminUser 별도 테이블** (보안상 분리가 안전)

```prisma
model AdminUser {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  nickname      String
  role          AdminRole @default(ADMIN)
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  createdBy     String    // 생성한 어드민 ID

  @@index([email])
}

enum AdminRole { SUPER_ADMIN ADMIN EDITOR }
```

---

## A2. 마이페이지 UI 스펙 `docs/ui/MY_UI_SPEC.md`

### 고객 정보 노출 정책

| 정보 | 본인에게 | 다른 사용자에게 | 설정 가능 |
|:---|:---:|:---:|:---:|
| 닉네임 | ✅ | ✅ | 변경 가능 (30일/1회) |
| 프로필 사진 | ✅ | ✅ | 변경 가능 |
| 등급 뱃지 | ✅ | ✅ | 고정 |
| 성별 | ✅ | **선택 공개** | ON/OFF 토글 |
| 출생연도 | ✅ | ❌ | 비공개 고정 |
| 이메일 | ✅ | ❌ | 비공개 고정 |
| 지역 | ✅ | **선택 공개** | ON/OFF 토글 |
| 관심사 | ✅ | ✅ | 수정 가능 |
| 가입일 | ✅ | ✅ | 고정 |
| 글/댓글 수 | ✅ | ✅ | 고정 |

### 마이페이지 구조 (모바일)

```
┌────────────────────────────┐
│  ← 마이페이지              │
├────────────────────────────┤
│                            │
│  [프로필 사진]  닉네임      │
│  🌱 새싹 · 가입 30일       │
│  [프로필 수정 →]           │
│                            │
├────────────────────────────┤
│  나의 활동                  │
│  ┌────┐ ┌────┐ ┌────┐    │
│  │내 글│ │댓글 │ │스크랩│   │
│  │ 12 │ │ 34 │ │  8 │    │
│  └────┘ └────┘ └────┘    │
│                            │
├────────────────────────────┤
│  📌 알림                   │
│  새 알림 3건 →             │
│                            │
├────────────────────────────┤
│  ⚙️ 설정                   │
│  글자 크기 설정 →           │
│  알림 설정 →               │
│  차단 목록 →               │
│  정보 공개 설정 →          │
│                            │
├────────────────────────────┤
│  계정                      │
│  계정 정보 →               │
│  로그아웃                   │
│  탈퇴하기                   │
│                            │
└────────────────────────────┘
```

### 글자크기 설정 UX

```
[글자 크기 설정]

미리보기 영역:
┌────────────────────────────┐
│ "오늘 시장에서 옥수수를     │
│  샀는데 정말 맛있더라구요"   │ ← 실시간 미리보기
└────────────────────────────┘

(●) 보통   — 17px (기본)
( ) 크게   — 20px
( ) 아주크게 — 24px

[적용하기]
→ 선택 즉시 미리보기 반영, "적용하기" 누르면 저장
→ CSS Variables로 전역 반영: html[data-font-size="LARGE"]
```

### 프로필 편집 화면

```
[프로필 편집]

[📷 프로필 사진]  ← 탭하면 갤러리/카메라 선택
  "변경" 버튼

닉네임: [________영숙이맘____]  ✅ 사용 가능
  "다음 변경 가능: 2026.04.15"

성별: ( ) 여성 (●) 남성 ( ) 선택안함
  ☐ 다른 사용자에게 공개

출생연도: [1968 ▼]

지역: [서울 ▼] → [강남구 ▼]
  ☐ 다른 사용자에게 공개

관심사: [일자리 ✕] [건강 ✕] [요리 ✕] [+ 추가]
  (최대 5개)

[저장하기]
```

---

## A3. 알림 시스템 스펙 `docs/spec/NOTIFICATION_SPEC.md`

### 트리거 이벤트 전체 목록

| # | 이벤트 | 수신자 | 메시지 예시 | 우선순위 |
|:-:|:---|:---|:---|:---:|
| 1 | 내 글에 댓글 | 글 작성자 | "{닉네임}님이 댓글을 남겼어요" | 높음 |
| 2 | 내 댓글에 대댓글 | 댓글 작성자 | "{닉네임}님이 답글을 남겼어요" | 높음 |
| 3 | 내 글에 공감 | 글 작성자 | "{닉네임}님이 공감했어요 ❤️" | 보통 |
| 4 | 내 댓글에 공감 | 댓글 작성자 | "댓글에 공감을 받았어요 ❤️" | 낮음 |
| 5 | 등급 승급 | 본인 | "축하해요! 🌿단골로 승급했어요" | 높음 |
| 6 | 글 뜨는글 달성 | 글 작성자 | "내 글이 🔥뜨는글에 올랐어요!" | 높음 |
| 7 | 글 명예의전당 달성 | 글 작성자 | "내 글이 👑명예의전당에!" | 높음 |
| 8 | 신고 처리 결과 | 신고 대상자 | "커뮤니티 규칙 안내" | 높음 |
| 9 | 경고 수신 | 대상자 | "운영팀 안내사항이 있어요" | 긴급 |
| 10 | 정지 수신 | 대상자 | "이용이 {N}일간 제한되었어요" | 긴급 |
| 11 | 정지 해제 | 대상자 | "이용 제한이 해제되었어요" | 높음 |
| 12 | 운영자 공지 | 전체 | "[공지] {제목}" | 보통 |

### 실시간 방식 결정

| 방식 | 장점 | 단점 | 비용 |
|:---|:---|:---|:---|
| WebSocket | 즉시 전달 | 상시 연결 유지, 서버 부담 | 높음 |
| SSE (Server-Sent Events) | 단방향, 가벼움 | 연결 유지 필요 | 중간 |
| **Polling 30초** | **가장 단순, 서버 부담 최소** | 최대 30초 지연 | **최저** |

> **결정: Polling 30초** — Phase 1에서는 비용 최소화 우선.
> `GET /api/my/notifications/unread-count` 를 30초마다 호출.
> Phase 2에서 트래픽 증가 시 SSE로 업그레이드 가능.

### 알림 ON/OFF 설정 (마이페이지)

```
[알림 설정]

댓글/대댓글 알림     [ON]
공감 알림           [ON]
등급 변경 알림       [ON]  ← OFF 불가 (강제)
운영자 안내 알림     [ON]  ← OFF 불가 (강제)
```

### 제재 알림 템플릿

| 제재 | 알림 메시지 |
|:---|:---|
| 경고 | "커뮤니티 규칙에 맞지 않는 활동이 감지되었어요. 규칙을 다시 확인해주세요. [커뮤니티 규칙 보기]" |
| 정지 7일 | "커뮤니티 규칙 위반으로 7일간 글쓰기·댓글이 제한되어요. 해제일: {날짜}. [자세히 보기]" |
| 정지 30일 | "커뮤니티 규칙 위반으로 30일간 이용이 제한되어요. 해제일: {날짜}. [자세히 보기]" |
| 영구차단 | "커뮤니티 규칙 중대 위반으로 이용이 영구 제한되었어요. [문의하기]" |

---

## A4. 글쓰기/에디터 스펙 `docs/ui/EDITOR_UI_SPEC.md`

### 에디터 라이브러리 선택

| 라이브러리 | 번들 크기 | 모바일 | 커스텀 | 결정 |
|:---|:---|:---:|:---:|:---:|
| **TipTap** | ~45KB | ✅ 우수 | 매우 유연 | **✅ 채택** |
| Quill | ~43KB | 보통 | 제한적 | ❌ |
| Slate | ~60KB | 보통 | 매우 유연 | ❌ 복잡 |
| Toast UI Editor | ~300KB | 보통 | 보통 | ❌ 무거움 |

> **TipTap 선택 이유**: 모듈식 구조로 필요한 기능만 로드, 모바일 터치 우수, 커스텀 쉬움, React 네이티브 지원

### 5060 친화 에디터 툴바 설계 ⭐

```
[글쓰기 — 모바일]

┌────────────────────────────────┐
│ ← 글쓰기           [임시저장]  │
├────────────────────────────────┤
│ 게시판: [사는 이야기 ▼]       │
│ 말머리: [일상 ▼]              │
├────────────────────────────────┤
│ 제목을 입력해주세요            │
│ ________________________________│
├────────────────────────────────┤
│                                │
│  여기에 내용을 작성해주세요     │
│  (최소 높이 200px)             │
│                                │
│                                │
│                                │
│                                │
├────────────────────────────────┤
│  [📷]  [🎬]  [B]  [I]  [—]   │ ← 하단 고정 툴바
│  사진  동영상  굵게 기울임 구분선│    아이콘 52×52px ⭐
├────────────────────────────────┤
│  [  등록하기  ]                │ ← 52px 높이, Coral CTA
└────────────────────────────────┘
```

### 툴바 아이콘 5060 최적화 ⭐

| 기능 | 아이콘 | 크기 | 라벨 | 비고 |
|:---|:---:|:---:|:---|:---|
| 사진 첨부 | 📷 | 52×52px | "사진" 텍스트 | 🌿단골+ (새싹은 비활성+안내) |
| 유튜브 | 🎬 | 52×52px | "동영상" 텍스트 | 🌿단골+ URL 붙여넣기 |
| 굵게 | **B** | 44×44px | — | |
| 기울임 | *I* | 44×44px | — | |
| 구분선 | — | 44×44px | — | |

> **핵심**: 사진/동영상 아이콘은 텍스트 라벨 함께 표시 (아이콘만으로 기능 파악 어려울 수 있음)
> 서식(굵게/기울임)은 선택적 — 시니어가 많이 안 쓰지만 있으면 편함

### 등급별 기능 제한 UX

```
[새싹이 사진 버튼 클릭 시]

┌────────────────────────────┐
│  📷 사진 첨부는              │
│  🌿단골 등급부터 가능해요    │
│                             │
│  글 5개 쓰거나              │
│  댓글 20개 달면 단골이 돼요  │
│                             │
│  [확인]                     │
└────────────────────────────┘
→ 모바일: 하단 시트 / 데스크탑: 툴팁
```

### 유튜브 임베드

```
1. 🌿단골+ 사용자가 "동영상" 버튼 클릭
2. URL 입력 모달 표시
   "유튜브 주소를 붙여넣어주세요"
   [https://youtube.com/watch?v=___________]
   [취소] [삽입]
3. URL 유효성 검증 (youtube.com, youtu.be)
4. 에디터에 유튜브 프리뷰 카드 삽입 (iframe은 저장 시 변환)
5. 저장 시 YouTube oEmbed API로 썸네일+제목 추출 → 카드 형태 저장
6. 상세 페이지에서 클릭 시 유튜브 iframe 로드 (lazy)
```

### 이미지 업로드 플로우

```
[사진 버튼 클릭]
  → 파일 선택 (갤러리/카메라)
  → 클라이언트: 파일 검증 (jpg/png/gif/webp, 5MB 이하)
  → 클라이언트: 큰 이미지는 1200px 리사이즈 (canvas API)
  → POST /api/upload/image → 서버에서 presigned URL 발급
  → 클라이언트: presigned URL로 R2 직접 업로드
  → 업로드 완료 → 에디터에 이미지 삽입 (R2 URL)
  → 업로드 중 프로그레스 바 표시
```

### 임시저장

| 항목 | 결정 |
|:---|:---|
| 제공 여부 | **✅ 제공** (5060은 글 작성 시간이 길 수 있음) |
| 자동 저장 | 30초마다 localStorage에 자동 저장 |
| 수동 저장 | [임시저장] 버튼 → 서버 저장 (status=DRAFT) |
| 임시저장 목록 | 글쓰기 진입 시 "임시저장된 글이 있어요. 이어서 쓸까요?" |
| 최대 개수 | 5개 |

### 댓글/대댓글 에디터 (글쓰기와 별도)

```
[댓글 입력 — 하단 고정]
┌────────────────────────────────┐
│ [📷] 댓글을 입력해주세요... [등록]│ ← 한 줄 입력 기본
└────────────────────────────────┘

→ 입력 시작하면 3줄로 확장
→ 📷 사진: 🌿단골+ (1장만)
→ 대댓글: "@ {닉네임}" 자동 표시, 같은 UI
→ 등록 후 댓글 목록 최하단으로 스크롤
```

### 글 등록 후 UX

```
글 등록 완료 → 글 상세 페이지로 이동 + 상단 토스트 "글이 등록되었어요 ✅"
```

---

## A5. 검색 페이지 스펙 `docs/ui/SEARCH_UI_SPEC.md`

### 검색 진입

```
[상단 GNB의 🔍 클릭]
  → 모바일: 전체 화면 검색 오버레이
  → 데스크탑: 상단 검색바 확장 (인라인)
```

### 검색 초기 상태 (모바일)

```
┌────────────────────────────┐
│ ← 🔍 [검색어를 입력하세요__]│
├────────────────────────────┤
│                            │
│  최근 검색                  │
│  옥수수   ✕               │
│  무릎 운동  ✕              │
│  경비원 채용  ✕            │
│  [전체 삭제]               │
│                            │
│  ────────────────────      │
│                            │
│  추천 검색어                │
│  기초연금  건강검진  서울    │
│  요리      손주 선물        │
│                            │
└────────────────────────────┘
```

### 검색 결과

```
┌────────────────────────────┐
│ ← 🔍 [옥수수____________]  │
├────────────────────────────┤
│ [전체] [일자리] [글] [매거진]│ ← 탭
├────────────────────────────┤
│                            │
│  📝 글 3건                  │
│  "시장에서 옥수수 사왔어요"  │
│  사는이야기 · 2시간 전      │
│                            │
│  "옥수수 삶는 꿀팁"         │
│  사는이야기 · 1일 전        │
│                            │
│  💼 일자리 1건              │
│  "옥수수 수확 보조"          │
│  충남 논산 · 일당 10만원    │
│                            │
│  📖 매거진 1건              │
│  "제철 옥수수 고르는 법"     │
│                            │
│  [더보기]                   │
└────────────────────────────┘
```

### 검색 결과 없음

```
┌────────────────────────────┐
│                            │
│  😢 검색 결과가 없어요      │
│                            │
│  "{검색어}"에 대한          │
│  결과를 찾지 못했어요        │
│                            │
│  이런 검색어는 어때요?       │
│  [기초연금] [건강검진]       │
│                            │
└────────────────────────────┘
→ 검색어 EventLog에 기록 (search_empty 이벤트 → CDO 분석용)
```

### 검색 기술 스펙

| 항목 | 결정 |
|:---|:---|
| 검색 엔진 | PostgreSQL Full-Text Search (Phase 1) |
| 한국어 | `to_tsvector('simple', ...)` + 형태소 제거 |
| 디바운스 | 입력 후 500ms 대기 후 검색 실행 |
| 최근 검색어 | localStorage, 최대 5개 |
| 추천 검색어 | 어드민에서 수동 설정 (설정 > 검색) |
| Phase 2 | Supabase pg_trgm 또는 외부 검색 (Meilisearch) |

---

## A6. 나머지 페이지 UI 스펙

### A6-1. `docs/ui/JOBS_UI_SPEC.md` — 내 일 찾기

**목록 화면:**
- 필터바: 기본 접힘, 탭하면 펼침 (지역/직종/근무형태/급여)
- Quick Tags: 가로 스크롤 칩 ("나이무관", "초보환영", "오전만", "주말가능" 등)
- 카드: 1열, 회사명 + 직종 + 지역 + 급여 + Quick Tags 2~3개
- 정렬: 최신순(기본) / 급여순
- 페이지네이션: **"일자리 더보기" 버튼** (10개씩)

**상세 화면:**
- 상단: 회사명 + 직종 + 지역 + 급여
- 📌 픽포인트 (3~5개 핵심 조건 카드) — "이런 점이 좋아요"
- 상세 정보 (근무시간, 근무일, 복리후생 등)
- ❓ 이런 게 궁금하시죠? (QnA 3~5개 아코디언)
- [지원하기] CTA → 외부 사이트 이동 (이벤트 트래킹)
- 하단: 비슷한 일자리 추천 3개

### A6-2. `docs/ui/COMMUNITY_UI_SPEC.md` — 소통 마당

**목록 화면:**
- 탭: 사는이야기 / 활력충전소 / 이번주수다방 (스와이프 전환)
- 각 탭 내 말머리 필터 (가로 스크롤 칩)
- 정렬: 최신순(기본) / 공감순
- 글쓰기 FAB: 우하단 Coral 원형 ✏️
- 카드: 제목 + 내용 1줄 + 닉네임 + 등급뱃지 + ❤️N + 💬N + 시간

**상세 화면:**
- 상단: 닉네임 + 등급뱃지 + 작성시간
- 본문 (TipTap 렌더링)
- 액션 바: [❤️ 공감 N] [📌 스크랩] [🔗 공유] [🚨 신고]
- 댓글 영역 (등록순/공감순 토글)
- 하단 고정: 댓글 입력창

### A6-3. `docs/ui/MAGAZINE_UI_SPEC.md` — 매거진

**목록:**
- 카테고리 필터 (건강/재테크/생활/문화/요리)
- 카드: 썸네일 + 제목 + 요약 1줄 + 카테고리 뱃지
- 2열 그리드 (모바일) / 4열 (데스크탑)

**상세:**
- 운영자 작성 콘텐츠 (WYSIWYG 렌더링)
- 하단: CPS 상품 슬롯 (쿠팡 추천 상품 카드)
- 공유 버튼 (카카오톡 + 링크복사)

### A6-4. `docs/ui/BEST_UI_SPEC.md` — 베스트

- 탭: 🔥 뜨는글 / 👑 명예의전당
- 뜨는글: 공감 10+ 글 목록 (최근 7일)
- 명예의전당: 공감 50+ 글 목록 (전체 기간)
- 카드: 순위(1~) + 제목 + 게시판뱃지 + ❤️N + 💬N

### A6-5. `docs/ui/ADMIN_UI_SPEC.md` — 어드민

PRD Part B 기반으로 각 화면 와이어프레임:
- 대시보드 (B2 기반)
- 콘텐츠 관리 (테이블 + 필터 + 일괄 액션)
- 봇 관리 (상태 카드 + 검수 큐)
- 모더레이션 (신고 워크플로우 + 제재 + 금지어)
- 회원 관리 (목록 + 상세 사이드패널)
- 매거진 에디터 (TipTap WYSIWYG + AI초안 + CPS삽입)
- 배너·광고 (슬롯별 탭 + CRUD + 통계)
- 데이터 분석 (6탭 대시보드)
- AI 에이전트 패널 (현황/미팅/승인/진화/로그)
- 설정 전체
- 1:1 문의 관리
- **어드민 계정 관리 ⭐** (A1에서 정의한 내용)

---

## A7. 공통 UX 패턴 정의 `docs/ux/COMMON_UX_SPEC.md`

### 5060 UX 핵심 원칙 ⭐

| # | 원칙 | 구현 | 참고 사례 |
|:-:|:---|:---|:---|
| 1 | **큰 터치 영역** | 최소 52×52px, 간격 8px | Apple HIG 시니어 가이드라인 |
| 2 | **명확한 텍스트** | 17px 최소, 아이콘+텍스트 병행 | 카카오톡 큰글씨 모드 |
| 3 | **단순한 네비게이션** | 상단 아이콘 메뉴 5개, 깊이 최대 3뎁스 | 아임웹 우나어 참조 |
| 4 | **예측 가능한 동작** | 한 번에 한 가지 동작, 뒤로가기 항상 가능 | |
| 5 | **명시적 피드백** | 모든 액션에 시각적 피드백 (토스트, 색상변화) | |
| 6 | **실수 복구 쉽게** | 삭제 전 확인, 되돌리기 제공 | |
| 7 | **더보기 > 무한스크롤** | 시니어는 "어디까지 봤지?" 혼란, 더보기가 안전 | |
| 8 | **높은 대비** | 텍스트 대비율 4.5:1 이상 (WCAG AA) | |
| 9 | **여유로운 줄간격** | line-height: 1.75, word-break: keep-all | |
| 10 | **친절한 빈 상태** | "아직 글이 없어요. 첫 번째 글을 써보세요!" | |

### 공유 방식

```
[공유 버튼 클릭]

모바일 → 하단 시트:
┌────────────────────────────┐
│  공유하기                    │
│                             │
│  [💬 카카오톡]  [🔗 링크복사] │
│                             │
│  [닫기]                     │
└────────────────────────────┘

→ 카카오톡: 카카오 JS SDK shareDefault (OG 이미지 + 제목 + 설명)
→ 링크 복사: clipboard API → 토스트 "링크가 복사되었어요"
```

### 로딩 스켈레톤 적용 범위

| 적용 | 미적용 |
|:---|:---|
| 홈 각 섹션 | 정적 페이지 (about/terms) |
| 글 목록 | 에러 페이지 |
| 글 상세 | 모달 내부 (스피너 사용) |
| 일자리 목록/상세 | |
| 매거진 목록 | |
| 마이페이지 목록들 | |
| 검색 결과 | |

### 에러 상태 UI

| 에러 | 화면 |
|:---|:---|
| 404 | "앗, 페이지를 찾지 못했어요 😅" + [홈으로 가기] |
| 500 | "잠시 문제가 생겼어요. 곧 해결할게요!" + [다시 시도] + [홈으로] |
| 오프라인 | 상단 배너: "인터넷 연결을 확인해주세요 📶" (노랑 배경) |
| 빈 결과 | 각 상황별 친절한 메시지 + 대안 제안 |

### 토스트 vs 모달

| 사용처 | 방식 | 이유 |
|:---|:---:|:---|
| 성공 피드백 (등록/수정/삭제) | **토스트** | 흐름 끊지 않음 |
| 복사 완료 | **토스트** | |
| 삭제 확인 | **모달** | 되돌리기 불가 |
| 신고 사유 입력 | **모달** | 입력 필요 |
| 등급별 기능 제한 안내 | **하단 시트** | 정보 전달 |
| 등급 승급 축하 | **모달** | 특별한 순간 강조 |
| 로그인 필요 | **하단 시트** | CTA 포함 |

### 등급 승급 축하 UX

```
[승급 감지 — 활동 후 API 응답에서]

→ 축하 모달 (중앙, 약간의 파티클 효과):
┌────────────────────────────┐
│     🎉                     │
│                            │
│  축하합니다!                │
│  🌿 단골이 되었어요         │
│                            │
│  이제 사진과 동영상을        │
│  올릴 수 있어요!            │
│                            │
│  [확인]                    │
└────────────────────────────┘
```

### 이미지 fallback

```
이미지 로드 실패 시:
- 프로필 이미지: 기본 아바타 (그레이 원형 + 사람 아이콘)
- 글 썸네일: 기본 플레이스홀더 (연한 배경 + 우나어 로고)
- 일자리 카드: 업종별 기본 아이콘
- 매거진 썸네일: 카테고리별 기본 이미지
```

---

## A8. DB 스키마 완전판 `docs/spec/DB_SCHEMA_FULL.md`

### PRD C3 기존 4개 + 추가 필요 테이블

**기존 (PRD C3에 정의됨):**
1. User
2. Post (+ JobDetail)
3. Comment
4. EventLog

**추가 필요 테이블:**

| # | 테이블 | 용도 |
|:-:|:---|:---|
| 5 | **AdminUser** | 어드민 계정 (User와 분리) ⭐ |
| 6 | Like | 공감 (글/댓글 공통) |
| 7 | Scrap | 스크랩 |
| 8 | Report | 신고 |
| 9 | Notification | 알림 |
| 10 | UserBlock | 사용자 차단 |
| 11 | Banner | 히어로 배너 |
| 12 | AdSlot | 광고 슬롯별 광고 |
| 13 | CpsLink | 쿠팡 CPS 트래킹 링크 |
| 14 | BotLog | 봇 실행 이력 |
| 15 | AgentMeeting | PDCA 사이클 기록 |
| 16 | AdminQueue | 에이전트 승인 요청 |
| 17 | AgentCost | 비용 추적 |
| 18 | Setting | 어드민 설정 (키-값) |
| 19 | SearchKeyword | 검색어 통계 |
| 20 | DraftPost | 임시저장 글 |

### User 테이블 수정사항

```diff
model User {
  ...기존 필드...
+ email          String?   // 카카오에서 선택 수집 → nullable
+ termsAgreedAt      DateTime
+ privacyAgreedAt    DateTime
+ marketingAgreedAt  DateTime?
+ nicknameChangedAt  DateTime?    // 닉네임 마지막 변경일
+ withdrawnAt        DateTime?    // 탈퇴 요청일
+ withdrawReason     String?
+ isGenderPublic     Boolean  @default(false)
+ isRegionPublic     Boolean  @default(false)
+ notifyComment      Boolean  @default(true)
+ notifyLike         Boolean  @default(true)
}
```

### ERD 관계도 (텍스트)

```
User ──1:N──> Post
User ──1:N──> Comment
User ──1:N──> Like
User ──1:N──> Scrap
User ──1:N──> Report (신고자)
User ──1:N──> Notification
User ──1:N──> UserBlock (차단한 사람)
User ──1:N──> DraftPost

Post ──1:N──> Comment
Post ──1:1──> JobDetail (JOB 타입만)
Post ──1:N──> Like (targetType=POST)
Post ──1:N──> Scrap
Post ──1:N──> Report (targetType=POST)

Comment ──1:N──> Comment (대댓글, 1단계)
Comment ──1:N──> Like (targetType=COMMENT)
Comment ──1:N──> Report (targetType=COMMENT)

AdminUser (독립 — User와 관계 없음)

Banner (독립)
AdSlot (독립)
CpsLink (독립)
Setting (독립)

BotLog (독립)
AgentMeeting (독립)
AdminQueue (독립)
AgentCost (독립)
```

---

## A9. API 계약 정의 `docs/spec/API_CONTRACT.md`

### 공통 응답 형식

```typescript
// 성공
{
  success: true,
  data: T,
  meta?: {
    page: number,      // 현재 페이지 (1부터)
    limit: number,     // 페이지당 개수
    total: number,     // 전체 개수
    hasMore: boolean   // 다음 페이지 존재 여부
  }
}

// 에러
{
  success: false,
  error: {
    code: string,      // "AUTH_REQUIRED", "FORBIDDEN" 등
    message: string,   // 사용자 표시용 메시지
    details?: unknown  // 개발용 상세 정보 (prod에서는 생략)
  }
}
```

### 페이지네이션 결정

| 방식 | 장점 | 단점 | 결정 |
|:---|:---|:---|:---|
| 오프셋 기반 | 구현 단순, "N페이지" 가능 | 데이터 변경 시 중복/누락 | |
| **커서 기반** | **데이터 정합성, 성능 우수** | 총 페이지 수 모름 | **✅ 채택** |

> "더보기" 버튼 UX에는 커서 기반이 더 적합. `cursor` + `limit` 파라미터.
> 어드민 테이블은 오프셋 기반 (페이지 번호 필요).

```typescript
// 커서 기반 요청
GET /api/posts?boardType=STORY&limit=10&cursor=abc123

// 응답 meta
{
  meta: {
    limit: 10,
    nextCursor: "def456",  // null이면 마지막
    hasMore: true
  }
}
```

### 에러 코드 목록

| 코드 | HTTP | 설명 |
|:---|:---:|:---|
| AUTH_REQUIRED | 401 | 로그인 필요 |
| FORBIDDEN | 403 | 권한 없음 |
| GRADE_REQUIRED | 403 | 등급 부족 (grade 정보 포함) |
| NOT_FOUND | 404 | 리소스 없음 |
| VALIDATION_ERROR | 400 | 입력값 오류 |
| DUPLICATE | 409 | 중복 (닉네임, 좋아요 등) |
| RATE_LIMITED | 429 | 요청 횟수 초과 |
| SUSPENDED | 403 | 계정 정지 상태 |
| SERVER_ERROR | 500 | 서버 오류 |

---

## A10. 개발 컨벤션 `docs/dev/CONVENTION.md`

### 폴더 구조

```
src/
├── app/                          # Next.js App Router
│   ├── (public)/                 # 공개 라우트 그룹
│   │   ├── page.tsx              # 홈 /
│   │   ├── jobs/
│   │   ├── community/
│   │   ├── magazine/
│   │   ├── best/
│   │   ├── search/
│   │   ├── login/
│   │   └── about/ terms/ privacy/ rules/ faq/ contact/
│   ├── (auth)/                   # 로그인 필수 라우트 그룹
│   │   └── my/
│   ├── (admin)/                  # 어드민 라우트 그룹
│   │   └── admin/
│   ├── api/                      # API Routes
│   ├── layout.tsx
│   ├── not-found.tsx
│   ├── error.tsx
│   └── globals.css               # CSS Variables 정의
│
├── components/
│   ├── ui/                       # 디자인 시스템 (Button, Card, Modal, Toast 등)
│   ├── features/                 # 기능별 컴포넌트 (PostCard, CommentList 등)
│   └── layouts/                  # 레이아웃 (Header, IconMenu, FAB, Footer, AdminSidebar)
│
├── lib/
│   ├── prisma.ts                 # Prisma 클라이언트 싱글턴
│   ├── auth.ts                   # NextAuth 설정
│   ├── api-response.ts           # API 응답 유틸 (success/error)
│   ├── errors.ts                 # AppError, NotFoundError, ForbiddenError
│   ├── validations.ts            # Zod 스키마 (입력 검증)
│   ├── utils.ts                  # 공통 유틸
│   └── constants.ts              # 상수 (등급 조건, 페이지 크기 등)
│
├── hooks/                        # 커스텀 훅
│   ├── use-auth.ts
│   ├── use-notifications.ts
│   └── use-font-size.ts
│
├── types/                        # 전역 타입 정의
│   ├── index.ts
│   ├── api.ts
│   └── prisma.ts                 # Prisma 타입 확장
│
├── styles/
│   └── tokens.css                # 디자인 토큰 (컬러/타이포/spacing)
│
└── middleware.ts                  # 인증/어드민 접근 제어
```

### 네이밍 규칙

| 대상 | 규칙 | 예시 |
|:---|:---|:---|
| 컴포넌트 | PascalCase | `PostCard.tsx`, `CommentList.tsx` |
| 파일 | kebab-case | `post-card.tsx`, `comment-list.tsx` |
| CSS Module | camelCase | `styles.cardTitle`, `styles.actionBar` |
| 타입/인터페이스 | PascalCase + `interface` 우선 | `interface PostCardProps` |
| 상수 | UPPER_SNAKE_CASE | `MAX_NICKNAME_LENGTH` |
| 훅 | camelCase + `use` 접두사 | `useAuth`, `useFontSize` |
| API Route | kebab-case | `/api/my/notifications` |

### 서버/클라이언트 컴포넌트 판단 기준

| 서버 컴포넌트 (기본) | 클라이언트 ('use client') |
|:---|:---|
| 데이터 페칭 | useState, useEffect 사용 |
| DB 직접 접근 | 이벤트 핸들러 (onClick 등) |
| 민감한 데이터 접근 (env) | 브라우저 API (localStorage 등) |
| 메타데이터 생성 | 실시간 인터랙션 (폼, 토글) |
| 정적 콘텐츠 렌더링 | 서드파티 클라이언트 라이브러리 |

### 공통 컴포넌트 우선 목록

| 순서 | 컴포넌트 | 용도 | 5060 고려 |
|:-:|:---|:---|:---|
| 1 | **Button** | Primary/Secondary/Ghost | 52px 높이, 18px 폰트 |
| 2 | **Card** | 글/일자리/매거진 카드 | 12px radius, 넉넉한 패딩 |
| 3 | **Modal** | 확인/입력/공유 | 모바일=하단시트, 데스크탑=중앙 |
| 4 | **Toast** | 성공/에러 피드백 | 큰 텍스트, 충분한 표시 시간(3초) |
| 5 | **Skeleton** | 로딩 플레이스홀더 | |
| 6 | **Badge** | 등급/카테고리/태그 | |
| 7 | **Avatar** | 프로필 이미지 + fallback | |
| 8 | **IconMenu** | 상단 아이콘 메뉴 행 + FAB | 52px 터치 영역, sticky |
| 9 | **Input** | 텍스트 입력 | 48px 높이, 17px 폰트 |
| 10 | **Chip** | 필터/태그/관심사 | 44px 높이, 터치 친화 |

---

## A11. 에이전트 명세

> Phase 1 이후 진행. 현재는 문서만 작성, 개발은 TRACK E에서.

- `docs/agents/CEO_SPEC.md` — 모닝 사이클 단계별 + System Prompt
- `docs/agents/C_LEVEL_SPECS.md` — 6개 C레벨 역할/입출력/Cron
- `docs/agents/PDCA_PROTOCOL.md` — AgentMeeting 기록 형식
- `docs/agents/MCP_PERMISSION_MAP.md` — 에이전트별 MCP 권한
- `docs/agents/COST_TRACKING.md` — $50 한도 추적 방식

---

# TRACK B — 개발 환경 세팅

### 순서 및 의존성

```
B0. MCP 서버 설치 (개발 도구 — docs/spec/MCP_SERVERS.md 참조)
  └── Context7 (최신 문서 자동 참조 — 코드 퀄리티 핵심)
  └── Sequential Thinking (복잡한 결정 시 추론 보조)
  └── GitHub MCP (PR/Issue 관리)
  └── Filesystem MCP (파일 관리)
  └── **Figma MCP (디자인 시스템 — Remote 권장)** ⭐ NEW
      └── `claude mcp add --transport http figma https://mcp.figma.com/mcp`
      └── 디자인 토큰 추출, 와이어프레임 → 코드 변환, 컴포넌트 검증
  → B3에서: Supabase MCP, Prisma MCP 추가
  → B5에서: Cloudflare MCP 추가
  → B7에서: Playwright MCP 추가
  → 운영 시: Telegram MCP, Sentry MCP 추가

B1. 프로젝트 초기화
  └── create-next-app (TS + App Router + src/)
  └── ESLint + Prettier 설정
  └── tsconfig.json strict 모드
  └── .gitignore 설정 (.env*, node_modules/, .next/ 등)
  └── GitHub Private Repo 생성 + 2FA 필수
  └── git init + 최초 커밋

B2. 디자인 시스템 기반 ⭐ (docs/design/DESIGN_WORKFLOW.md 참조)
  └── CSS Variables 전역 설정 (PRD A1 전체)
      └── tokens.css: 컬러 13종 + 타이포 8종 + 스페이싱 6종 + 라디우스 4종
  └── Noto Sans KR 폰트 (next/font/google)
  └── globals.css + tokens.css 작성
  └── 글자크기 3단계 CSS 변수 분리 (html[data-font-size])
  └── **Figma Variables 동기화 검증** (Figma MCP로 토큰 대조)
  └── **Figma 와이어프레임 → 컴포넌트 스펙 추출** (C0 준비)

B3. DB 환경
  └── docker-compose.yml (PostgreSQL 15)
  └── Supabase 프로젝트 생성 (prod + preview)
  └── .env.local 환경변수 세팅 (13개+)
  └── Prisma 초기화 + schema.prisma (A8 기반)
  └── prisma migrate dev + prisma generate
  └── prisma/seed.ts (최초 어드민 계정 + 설정 초기값)

B4. 인증
  └── NextAuth v5 설치 + 카카오 provider 설정
  └── 어드민 이메일+비밀번호 인증 (Credentials provider)
  └── middleware.ts (라우트별 접근 제어)
  └── 세션 타입 확장 (role, grade 포함)

B5. 스토리지
  └── Cloudflare R2 버킷 생성
  └── CORS 설정 (age-doesnt-matter.com)
  └── presigned URL 유틸 함수

B6. CI/CD
  └── .github/workflows/ci.yml (lint → typecheck → test → build)
  └── Vercel 프로젝트 연결 + 환경변수
  └── Preview 배포 설정 (PR 자동)
  └── robots.txt (/admin/* disallow)

B7. 테스트 환경
  └── Vitest 설치 + 설정 (vitest.config.ts)
  └── Playwright 설치 + 초기 설정 (playwright.config.ts)
  └── 테스트 유틸 (mock Prisma, mock session)

B8. 공통 코드
  └── 디자인 시스템 컴포넌트 뼈대 (A10 목록 기반)
  └── API 응답 유틸 (A9 기반)
  └── 에러 클래스 (AppError 등)
  └── Zod 검증 스키마 기본
  └── 레이아웃 컴포넌트 (Header, IconMenu, FAB, Footer, AdminSidebar)
```

---

# TRACK C — 개발

### 의존성 기반 순서

```
C0 공통 ─────────────────────────┐
                                 │
C1 인증/온보딩 ──────────────────┤
                                 │
C2 홈 ──────────────────────────┤
                                 │
C3 내 일 찾기 ──┐               │
C4 소통 마당 ──┤ (병렬 가능)    │
C5 매거진 ─────┘               │
                                 │
C6 베스트 ──────────────────────┤ (C3,C4 이후)
C7 검색 ────────────────────────┤ (C3,C4,C5 이후)
C8 정적 페이지 ────────────────┤ (독립)
                                 │
C9 어드민 ──────────────────────┤ (C1~C8 이후 권장)
C10 인프라/보안 ────────────────┘ (마지막)
```

### C0. 공통 세부

1. 디자인 시스템 컴포넌트 10종 구현 (Button, Card, Modal, Toast, Skeleton, Badge, Avatar, IconMenu, Input, Chip)
2. AppError / NotFoundError / ForbiddenError 클래스
3. API 응답 유틸 (successResponse, errorResponse)
4. 미들웨어 (인증 체크, 등급 체크, 어드민 접근 제한, rate limit)
5. 404 / 500 / error 페이지
6. 레이아웃 완성 (Header + IconMenu + FAB + Footer) — 하단 탭바 X, 상단 아이콘 메뉴 + 플로팅 글쓰기
7. 오프라인 감지 배너

### C1. 인증/온보딩 세부

1. 카카오 OAuth 연동 (NextAuth v5)
2. 로그인 → 신규/기존 분기 로직
3. 온보딩 4단계 (약관→닉네임→추가정보→환영)
4. 닉네임 실시간 중복 체크 API
5. 마이페이지 전체 구현 (A2 기반)
   - 프로필 보기/수정
   - 글자크기 설정
   - 내 글/댓글/스크랩 목록
   - 알림 목록 + 읽음 처리
   - 알림 설정
   - 차단 목록
   - 정보 공개 설정
   - 탈퇴
6. 알림 시스템 (A3 기반)
   - Notification 테이블 CRUD
   - 알림 생성 트리거 (댓글/공감/승급/제재)
   - Polling 30초
   - 알림 카운트 뱃지 (상단바)

### C2. 홈 세부

1. 홈 레이아웃 (HOME_UI_SPEC 기반)
2. 히어로 배너 (슬라이드 최대 3장, 자동 전환)
3. 추천 일자리 가로 스크롤
4. 뜨는 이야기 리스트
5. 에디터스 픽 카드
6. 매거진 카드 2열
7. 소통 마당 최신 리스트
8. 광고 슬롯 (HOME-INLINE)
9. ISR 60초 revalidate

### C3~C10 (이전 TODO 기반, 동일하므로 생략 — 각 스펙 문서 참조)

---

# TRACK D — QA

### 테스트 우선순위

```
1순위 (개발 중 작성):
  - Unit: 등급 계산, 포텐 판정, AI 필터, 광고 우선순위 로직
  - Integration: 인증 API, 게시글 CRUD API, 댓글 API

2순위 (기능 완료 후):
  - E2E 5대 시나리오 (Playwright)
  - 시니어 UI 체크리스트 (52px/17px/keep-all/1.75)

3순위 (배포 전):
  - Visual regression (5페이지 + 어드민)
  - Lighthouse 접근성 90+
  - axe-core 스캔
  - 보안 감사 (XSS/CSRF)
  - 성능 (LCP/FID/CLS)
  - 실기기 테스트 (iPhone SE, 갤럭시 A)
```

---

# TRACK E — 에이전트 시스템

> Phase 1 (사이트 + 어드민) 완료 후 진행
> A11 문서 기반으로 개발

1. BaseAgent 클래스 + MCP 클라이언트
2. CEO 모닝 사이클
3. C레벨 6종
4. 알바생 봇 5종
5. GitHub Actions Cron
6. MCP 서버 4종 연결
7. 비용 추적 + $50 차단
8. automation_status: ACTIVE 전환

---

# 핵심 결정사항 요약

| # | 결정 | 선택 | 이유 |
|:-:|:---|:---|:---|
| 1 | 어드민 인증 | 이메일+비밀번호 (User와 분리) | 창업자가 자유롭게 생성 가능 |
| 2 | 카카오 수집 정보 | 필수 최소화 + 선택 많이 | 가입 허들 최소화 |
| 3 | 카카오싱크 | 채택 (심사 전 일반 로그인 대비) | 가입 스텝 최소화 |
| 4 | 에디터 | TipTap | 가볍고 모바일 친화, 커스텀 유연 |
| 5 | 알림 | Polling 30초 | 비용 최소, Phase 2에서 SSE |
| 6 | 페이지네이션 | 커서 기반 (어드민은 오프셋) | 데이터 정합성 + 더보기 UX |
| 7 | 검색 | PostgreSQL FTS (Phase 1) | 별도 인프라 불필요 |
| 8 | 임시저장 | 자동(localStorage) + 수동(서버) | 5060은 글 작성 시간 길 수 있음 |
| 9 | DB 어드민 | AdminUser 별도 테이블 | 보안상 분리 안전 |
| 10 | 유튜브 | URL 붙여넣기 → 프리뷰 카드 | 단골+ 등급 제한 |
| 11 | 운영 알림 | **텔레그램** (카카오 알림톡 X) | 무료, 봇 API 편리, 마크다운 지원 |
| 12 | MCP 서버 | 6종 필수 + 4종 추천 + 5종 선택 | docs/spec/MCP_SERVERS.md 참조 |
| 13 | 디자인 워크플로우 | **하이브리드 (Code-First + Figma 병행)** | 코드가 원본, Figma는 참조/검증. docs/design/DESIGN_WORKFLOW.md |
| 14 | Figma MCP | **공식 Remote MCP (기본)** + claude-talk-to-figma (쓰기 필요 시) | 디자인 토큰 추출, 와이어프레임 참조, 컴포넌트 검증 |
| 15 | 디자인 토큰 원본 | **코드 (tokens.css)** | Figma Variables는 동기화 대상, 원본 아님 |
| 16 | 네비게이션 | **상단 아이콘 메뉴 (하단 탭바 X)** + 플로팅 글쓰기 FAB | PRD A3 참조 |

---

# 보안 & 크레덴셜 관리 체계

### 비밀 저장 3계층

| 환경 | 저장소 | 접근 |
|:---|:---|:---|
| **로컬 개발** | `.env.local` (gitignore) | 내 컴퓨터에만 존재 |
| **CI/CD** | GitHub Secrets | GitHub Actions에서만 접근, 웹에서 값 확인 불가 |
| **프로덕션** | Vercel Environment Variables | Vercel 빌드 시 주입 |

### GitHub 보안 설정

- ✅ **Private Repository** (외부 접근 완전 차단)
- ✅ **2FA (2단계 인증)** 필수
- ✅ **Branch Protection** (main 직접 push 금지, PR 필수)
- ✅ **.gitignore** 철저 관리 (.env*, node_modules/, .next/, .DS_Store)
- ✅ **Dependabot** 활성화 (취약 패키지 자동 알림)
- ✅ **Secret Scanning** 활성화 (실수로 API 키 커밋 시 자동 감지)

### 크레덴셜 제공 시점

| 단계 | 필요한 크레덴셜 |
|:---|:---|
| B1 (프로젝트 초기화) | GitHub 계정 (Private Repo 생성) |
| B3 (DB 환경) | Supabase Project URL + Keys |
| B4 (인증) | 카카오 개발자 앱 Client ID + Secret |
| B5 (스토리지) | Cloudflare R2 Access Key + Secret |
| B6 (CI/CD) | Vercel 계정, GitHub Personal Access Token |
| 알림 설정 | 텔레그램 봇 토큰 + 채팅 ID |
| 에이전트 (Phase 2) | Anthropic API Key |
| 모니터링 | Sentry DSN (선택) |

### .env.local 템플릿 (실제 값은 절대 커밋 X)

```env
# .env.local.example (이 파일만 커밋, 실제 값은 X)

# DB
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=your-secret-here
NEXTAUTH_URL=http://localhost:3000
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=

# Storage
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_URL=
R2_BUCKET_NAME=

# AI (Phase 2)
ANTHROPIC_API_KEY=
CLAUDE_MODEL_HEAVY=claude-sonnet-4-6
CLAUDE_MODEL_LIGHT=claude-haiku-4-5

# Notifications
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Bot API
BOT_API_KEY=
```
