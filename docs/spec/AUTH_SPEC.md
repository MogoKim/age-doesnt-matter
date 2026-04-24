# 회원시스템 스펙 (AUTH_SPEC)

> **기준 문서**: PRD_Final_A v3.2 · PRD_Final_B · PRD_Final_C · NORTH_STAR.md v3.1
> **작성일**: 2026-03-17
> **목적**: 개발자가 이 문서만 보고 회원시스템 전체를 구현할 수 있도록 작성

---

## 0. 핵심 설계 원칙

```
"55세 여성 김영희님이 카카오톡 링크를 타고 처음 왔을 때,
 30초 안에 가입이 완료되어야 하고, 복잡한 입력 없이 바로 커뮤니티에 참여할 수 있어야 한다."
```

### 인증 설계 3원칙

| 원칙 | 설명 |
|:---|:---|
| **최소 마찰** | 카카오 OAuth만 사용. 비밀번호/이메일 인증 없음. 필수 정보만 수집 |
| **시니어 친화** | 큰 버튼(52px), 명확한 안내 문구, 단계별 진행 |
| **보안 기본값** | httpOnly + secure + sameSite 쿠키, JWT, Prisma ORM (SQL Injection 차단) |

---

## 1. 인증 아키텍처

### 1.1 기술 스택

| 항목 | 값 |
|:---|:---|
| **프레임워크** | NextAuth v5 |
| **OAuth Provider** | Kakao OAuth 2.0 (유일한 Provider) |
| **토큰 타입** | JWT |
| **쿠키 설정** | httpOnly + secure + sameSite=lax |
| **세션 유효기간** | 30일 (슬라이딩 윈도우) |
| **API Rate Limit** | 로그인: 5회/5분, API: 60회/분 |

### 1.2 인증 플로우 다이어그램

```
사용자          프론트엔드          NextAuth          카카오 서버
  │                │                  │                  │
  ├─[로그인 클릭]──→│                  │                  │
  │                ├──signIn("kakao")─→│                  │
  │                │                  ├──OAuth Redirect──→│
  │                │                  │                  │
  │←───────── 카카오 로그인 화면 ──────────────────────────┤
  │                │                  │                  │
  ├─[카카오 인증]───→│                  │←──Auth Code──────┤
  │                │                  ├──Token Exchange──→│
  │                │                  │←──Access Token────┤
  │                │                  │                  │
  │                │←──JWT Session────┤                  │
  │                │                  │                  │
  │                ├──신규 회원?───────→│                  │
  │                │  Y → 온보딩       │                  │
  │                │  N → 리다이렉트   │                  │
```

### 1.3 로그인 진입점

| 위치 | 조건 | 동작 |
|:---|:---|:---|
| **Desktop GNB** | 비로그인 시 | "로그인" 텍스트 버튼 → `/login` |
| **Mobile 헤더** | 비로그인 시 | 👤 아이콘 → `/login` |
| **FAB 글쓰기** | 비로그인 시 | 하단 시트: "글을 쓰려면 로그인이 필요해요" + 카카오 버튼 |
| **좋아요/댓글** | 비로그인 시 | 하단 시트: 로그인 유도 |

### 1.4 로그아웃

| 항목 | 값 |
|:---|:---|
| **진입** | `/my` → "🚪 로그아웃" 버튼 |
| **동작** | NextAuth signOut() → httpOnly 쿠키 삭제 |
| **리다이렉트** | `/` (홈) |

---

## 2. 온보딩 플로우

### 2.1 전체 흐름

```
[카카오 OAuth 완료] ─── 신규 회원 ───→ [온보딩 시작]
                   │
                   └── 기존 회원 ───→ [이전 페이지로 복귀]


온보딩 단계:
┌──────────────────────────────────────┐
│  Step 1. 닉네임 설정 (필수)           │
│  ┌──────────────────────────┐        │
│  │ 닉네임을 정해주세요       │        │
│  │ [____________] ← 2~10자  │        │
│  │ ✅ 사용 가능한 닉네임이에요 │        │
│  │ [다음]                   │        │
│  └──────────────────────────┘        │
│                                      │
│  Step 2. 약관 동의 (필수)            │
│  ┌──────────────────────────┐        │
│  │ ☑ [필수] 이용약관 동의    │        │
│  │ ☑ [필수] 개인정보처리방침  │        │
│  │ ☐ [선택] 마케팅 수신 동의  │        │
│  │ [가입 완료]              │        │
│  └──────────────────────────┘        │
│                                      │
│  → 🌱 새싹 등급 자동 부여            │
│  → 진입 전 페이지로 복귀             │
└──────────────────────────────────────┘
```

### 2.2 카카오에서 수집하는 정보

| 항목 | 수집 방식 | 필수 여부 | 용도 |
|:---|:---|:---:|:---|
| **providerId** | 자동 (카카오 User ID) | ✅ | 계정 식별 |
| **nickname** | 자동 (카카오 프로필) | ✅ | 닉네임 초기값 제안 |
| **profileImage** | 자동 (카카오 프로필) | ❌ | 프로필 이미지 초기값 |
| **email** | 선택 동의 | ❌ | 계정 복구용 |
| **gender** | 선택 동의 | ❌ | 통계/추천 |
| **birthYear** | 선택 동의 | ❌ | 통계/추천 |

> **원칙**: 5060 사용자는 정보 요구가 많으면 가입을 포기한다. 필수는 providerId만, 나머지는 모두 선택.

### 2.3 온보딩 UI 스펙

| 요소 | 스펙 |
|:---|:---|
| **화면 타입** | 모바일: 풀스크린 / 데스크탑: 중앙 480px 카드 |
| **닉네임 입력** | Input 52px 높이, 17px 폰트, 실시간 중복 체크 |
| **중복 체크 피드백** | ✅ 초록 "사용 가능" / ❌ 빨강 "이미 사용 중" |
| **약관 체크박스** | 52px 터치 타겟, [필수] 라벨 빨간색 |
| **약관 전문 보기** | 각 항목 옆 "보기" 링크 → 약관 페이지 |
| **가입 완료 버튼** | 343×52px, #FF6F61, "가입 완료" |
| **완료 피드백** | Toast: "🎉 환영합니다! 우나어에 오신 것을 환영해요" |

---

## 3. 닉네임 규칙

### 3.1 유효성 검사

| 규칙 | 값 |
|:---|:---|
| **길이** | 2~10자 |
| **허용 문자** | 한글, 영문, 숫자 |
| **금지 문자** | 특수문자, 공백, 이모지 |
| **금지어 필터** | 욕설, 비속어, "운영자", "관리자", "admin" 등 |
| **중복 체크** | 실시간 (debounce 300ms) |
| **대소문자** | 영문 대소문자 구분 없이 중복 체크 (case-insensitive) |

### 3.2 닉네임 변경

| 항목 | 값 |
|:---|:---|
| **진입** | `/my/settings` → "닉네임 변경" |
| **변경 주기** | 30일에 1회 |
| **검증 규칙** | 최초 설정과 동일 (2~10자, 중복 체크) |
| **변경 후** | 기존 글/댓글의 닉네임도 즉시 반영 |

### 3.3 닉네임 표시 형식

```
게시글/댓글: 🌱 행복한바리스타 · 2시간 전
프로필 헤더: 행복한바리스타 (큰 글씨) + 🌱 새싹 등급 (서브)
GNB (데스크탑): 프로필 아이콘 + 닉네임
```

---

## 4. 등급 시스템

### 4.1 등급 정의

| 등급 | 이모지 | Tier | 승급 조건 | DB Enum |
|:---|:---:|:---:|:---|:---|
| **새싹** | 🌱 | 1 | 가입 즉시 | `SPROUT` |
| **단골** | 🌿 | 2 | 글 5개 OR 댓글 20개 | `REGULAR` |
| **터줏대감** | 💎 | 3 | 글 20개 AND 공감 100+ | `VETERAN` |
| **따뜻한이웃** | ☀️ | 4 | PO 수동 부여만 가능 | `WARM_NEIGHBOR` |

### 4.2 등급별 권한

| 기능 | 비회원 | 🌱 새싹 | 🌿 단골 | 💎 터줏대감 | ☀️ 따뜻한이웃 |
|:---|:---:|:---:|:---:|:---:|:---:|
| 열람/검색 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 좋아요/스크랩/신고 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 댓글 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 글쓰기 | ❌ | ✅ | ✅ | ✅ | ✅ |
| 이미지 첨부 | ❌ | ❌ | ✅ | ✅ | ✅ |
| 유튜브 임베드 | ❌ | ❌ | ✅ | ✅ | ✅ |

### 4.3 자동 승급 로직

```typescript
// 서버 사이드 — 글/댓글 작성 후 트리거
async function checkAndPromote(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (user.grade === 'SPROUT') {
    if (user.postCount >= 5 || user.commentCount >= 20) {
      await prisma.user.update({
        where: { id: userId },
        data: { grade: 'REGULAR' }
      });
      await sendNotification(userId, '축하해요! 🌿 단골 등급이 되었어요');
    }
  }

  if (user.grade === 'REGULAR') {
    if (user.postCount >= 20 && user.receivedLikes >= 100) {
      await prisma.user.update({
        where: { id: userId },
        data: { grade: 'VETERAN' }
      });
      await sendNotification(userId, '축하해요! 💎 터줏대감 등급이 되었어요');
    }
  }
  // WARM_NEIGHBOR는 PO 수동 부여만 가능
}
```

### 4.4 등급 색상 (디자인 토큰)

| 등급 | CSS Variable | 값 |
|:---|:---|:---|
| 새싹 🌱 | `--color-grade-sprout` | `#4CAF50` |
| 단골 🌿 | `--color-grade-regular` | `#8BC34A` |
| 터줏대감 💎 | `--color-grade-veteran` | `#FF9800` |
| 따뜻한이웃 ☀️ | `--color-grade-warm` | `#FF6F61` |

> **참고**: `tokens.css`의 등급 색상 변수명이 PRD와 불일치 (seed/sprout/flower/tree/forest → sprout/regular/veteran/warm). Track B 환경세팅 시 tokens.css 변수명 PRD에 맞춰 수정 필요.

---

## 5. 어드민 계정

### 5.1 어드민 vs 일반 사용자

| 항목 | 일반 사용자 | 어드민 |
|:---|:---|:---|
| **인증 방식** | 카카오 OAuth | 이메일 + 비밀번호 |
| **닉네임** | 2~10자, 자유 설정 | 자유 설정 (제한 없음) |
| **계정 생성** | 카카오 로그인 → 온보딩 | 창업자가 직접 생성 |
| **role** | `USER` | `ADMIN` |
| **접근 범위** | 서비스 전체 | 서비스 + `/admin/*` 대시보드 |

### 5.2 어드민 계정 생성

```
경로: 시스템 시드 OR /admin → 설정 → 계정 관리

[이메일]     admin@age-doesnt-matter.com
[비밀번호]   ●●●●●●●● (8자 이상, 대소문자+숫자+특수문자)
[닉네임]     자유 입력
[역할]       ADMIN

[계정 생성]
```

### 5.3 어드민 권한

| 기능 | 설명 |
|:---|:---|
| 회원 관리 | 목록 조회, 상세 보기, 등급 수동 변경, 제재 (정지/차단) |
| 콘텐츠 관리 | 게시글/댓글 삭제, 숨김 처리, 신고 처리 |
| 등급 수여 | ☀️ 따뜻한이웃 수동 부여/회수 |
| 설정 관리 | 약관/개인정보처리방침 편집, 서비스 설정 |
| 에이전트 관리 | AI 에이전트 모니터링, 활동 로그 조회 |
| 감사 로그 | 모든 어드민 행위는 EventLog에 자동 기록 |

---

## 6. 회원 탈퇴

### 6.1 탈퇴 플로우

```
/my/settings → "회원 탈퇴" 버튼
    ↓
[확인 모달]
┌──────────────────────────────────┐
│  정말 탈퇴하시겠어요?             │
│                                  │
│  탈퇴하면 아래 정보가 삭제돼요:    │
│  · 작성한 글과 댓글               │
│  · 프로필 정보                    │
│  · 활동 내역                     │
│                                  │
│  ⚠️ 탈퇴 후 30일 이내 재로그인    │
│     시 계정을 복구할 수 있어요     │
│                                  │
│  [취소]        [탈퇴하기]         │
└──────────────────────────────────┘
    ↓
status = "WITHDRAWN"
    ↓
30일 유예 기간 (소프트 삭제)
    ↓
30일 후 하드 삭제 (배치 Job)
```

### 6.2 탈퇴 시 데이터 처리

| 단계 | 시점 | 처리 |
|:---|:---|:---|
| **소프트 삭제** | 탈퇴 즉시 | `status = "WITHDRAWN"`, 로그인 차단 |
| **표시 변경** | 탈퇴 즉시 | 작성글/댓글의 닉네임 → "탈퇴한 회원" |
| **복구 가능** | 30일 이내 | 카카오 재로그인 시 계정 복원 |
| **하드 삭제** | 30일 후 | 개인정보 완전 삭제 (GDPR/개인정보보호법) |

### 6.3 계정 상태 Enum

```typescript
type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'WITHDRAWN';

// ACTIVE     — 정상
// SUSPENDED  — 일시 정지 (suspendedUntil까지)
// BANNED     — 영구 차단
// WITHDRAWN  — 탈퇴 (30일 유예 후 삭제)
```

---

## 7. 이용약관 & 개인정보

### 7.1 동의 항목

| 문서 | 필수 여부 | 시점 | 경로 |
|:---|:---:|:---|:---|
| **이용약관** | ✅ 필수 | 온보딩 Step 2 | `/terms` |
| **개인정보 처리방침** | ✅ 필수 | 온보딩 Step 2 | `/privacy` |
| **마케팅 수신 동의** | ❌ 선택 | 온보딩 Step 2 | — |

### 7.2 약관 관리

| 항목 | 값 |
|:---|:---|
| **렌더링** | SSG (빌드 타임) |
| **편집** | `/admin` → 설정 → 페이지 → WYSIWYG 에디터 |
| **접근** | 푸터: "회사소개 · 약관 · 개인정보 · 문의" |
| **관련 라우트** | `/terms`, `/privacy`, `/rules`, `/about`, `/faq`, `/contact` |

### 7.3 약관 변경 시

```
약관 변경 시:
1. 어드민이 새 약관 등록
2. 기존 사용자에게 알림: "약관이 변경되었습니다"
3. 다음 로그인 시 재동의 요청 (필수)
4. 미동의 시 서비스 이용 제한
```

---

## 8. 보안 & Rate Limiting

### 8.1 Rate Limit

| 대상 | 제한 | 초과 시 |
|:---|:---|:---|
| **로그인 시도** | 5회/5분 | 15분 잠금 |
| **API 호출** | 60회/분/IP | 429 응답 |
| **글 작성** | 3회/분/유저 | 429 응답 |
| **댓글 작성** | 10회/분/유저 | 429 응답 |
| **Bot API** | 10회/분/API Key | 429 응답 |

### 8.2 보안 헤더 & 방어

| 공격 유형 | 방어 |
|:---|:---|
| **XSS** | DOMPurify + CSP 헤더 |
| **SQL Injection** | Prisma ORM 파라미터 바인딩 (Raw SQL 금지) |
| **CSRF** | SameSite 쿠키 + CSRF 토큰 |
| **파일 업로드** | jpg/png/gif/webp만, 5MB 이하, 서버 리사이즈 |
| **HTTPS** | Vercel SSL 강제 |

### 8.3 민감 데이터 처리

| 데이터 | 저장 방식 |
|:---|:---|
| **비밀번호 (어드민)** | bcrypt hash (saltRounds=12) |
| **JWT Secret** | 환경변수 (`NEXTAUTH_SECRET`) |
| **카카오 Client Secret** | 환경변수 (`KAKAO_CLIENT_SECRET`) |
| **세션 토큰** | httpOnly 쿠키 (클라이언트 접근 불가) |

---

## 9. DB 스키마 (회원 관련)

### 9.1 User 모델

```prisma
model User {
  id             String    @id @default(cuid())
  email          String?   @unique
  nickname       String    @unique
  profileImage   String?
  providerId     String    @unique  // 카카오 User ID
  role           Role      @default(USER)
  grade          Grade     @default(SPROUT)
  birthYear      Int?
  gender         String?
  regions        String[]
  interests      String[]
  fontSize       FontSize  @default(NORMAL)
  postCount      Int       @default(0)
  commentCount   Int       @default(0)
  receivedLikes  Int       @default(0)
  status         UserStatus @default(ACTIVE)
  suspendedUntil DateTime?
  marketingOptIn Boolean   @default(false)
  nicknameChangedAt DateTime?
  lastLoginAt    DateTime  @default(now())
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  posts          Post[]
  comments       Comment[]
  likes          Like[]
  notifications  Notification[]
  reports        Report[]
}

enum Role {
  USER
  ADMIN
}

enum Grade {
  SPROUT         // 🌱 새싹
  REGULAR        // 🌿 단골
  VETERAN        // 💎 터줏대감
  WARM_NEIGHBOR  // ☀️ 따뜻한이웃
}

enum FontSize {
  NORMAL  // 17px
  LARGE   // 20px
  XLARGE  // 24px
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
  WITHDRAWN
}
```

### 9.2 AdminAccount 모델 (어드민 전용)

```prisma
model AdminAccount {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  nickname     String
  role         Role     @default(ADMIN)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  lastLoginAt  DateTime?

  eventLogs    EventLog[]
}
```

### 9.3 Agreement 모델 (약관 동의 이력)

```prisma
model Agreement {
  id        String   @id @default(cuid())
  userId    String
  type      AgreementType
  version   String   // 약관 버전 (e.g., "2026-03-17-v1")
  agreedAt  DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])

  @@unique([userId, type, version])
}

enum AgreementType {
  TERMS_OF_SERVICE
  PRIVACY_POLICY
  MARKETING
}
```

---

## 10. API 엔드포인트 (회원 관련)

### 10.1 인증

| Method | Path | 설명 | 인증 |
|:---|:---|:---|:---:|
| GET | `/api/auth/signin` | NextAuth 로그인 페이지 | — |
| GET | `/api/auth/signout` | 로그아웃 | ✅ |
| GET | `/api/auth/session` | 현재 세션 조회 | — |
| POST | `/api/auth/callback/kakao` | 카카오 콜백 (NextAuth 자동) | — |

### 10.2 온보딩

| Method | Path | 설명 | 인증 |
|:---|:---|:---|:---:|
| POST | `/api/onboarding` | 닉네임 설정 + 약관 동의 | ✅ |
| GET | `/api/nickname/check?q=` | 닉네임 중복 체크 | — |

### 10.3 프로필 & 설정

| Method | Path | 설명 | 인증 |
|:---|:---|:---|:---:|
| GET | `/api/users/me` | 내 프로필 조회 | ✅ |
| PATCH | `/api/users/me` | 프로필 수정 (닉네임, 이미지 등) | ✅ |
| PATCH | `/api/users/me/font-size` | 글자 크기 변경 | ✅ |
| DELETE | `/api/users/me` | 회원 탈퇴 | ✅ |

### 10.4 어드민 (회원 관리)

| Method | Path | 설명 | 인증 |
|:---|:---|:---|:---:|
| GET | `/api/admin/users` | 회원 목록 (페이지네이션) | ADMIN |
| GET | `/api/admin/users/:id` | 회원 상세 | ADMIN |
| PATCH | `/api/admin/users/:id/grade` | 등급 변경 | ADMIN |
| PATCH | `/api/admin/users/:id/status` | 상태 변경 (정지/차단) | ADMIN |
| POST | `/api/admin/accounts` | 어드민 계정 생성 | ADMIN |

---

## 11. 라우트 맵 (회원 관련)

| 라우트 | 페이지 | 인증 필요 |
|:---|:---|:---:|
| `/login` | 로그인 (카카오 버튼) | ❌ |
| `/onboarding` | 온보딩 (닉네임 + 약관) | ✅ (신규만) |
| `/my` | 마이페이지 | ✅ |
| `/my/settings` | 설정 (닉네임, 글자크기, 탈퇴) | ✅ |
| `/my/notifications` | 알림 목록 | ✅ |
| `/terms` | 이용약관 | ❌ |
| `/privacy` | 개인정보처리방침 | ❌ |
| `/rules` | 커뮤니티 규칙 | ❌ |
| `/about` | 서비스 소개 | ❌ |
| `/faq` | FAQ | ❌ |
| `/contact` | 문의 | ❌ |

---

## 12. 구현 체크리스트

- [ ] NextAuth v5 + Kakao Provider 설정
- [ ] JWT 콜백에서 User DB upsert
- [ ] 온보딩 미완료 사용자 리다이렉트 미들웨어
- [ ] 닉네임 실시간 중복 체크 API
- [ ] 약관 동의 저장 + 버전 관리
- [ ] 등급 자동 승급 트리거 (글/댓글 작성 후)
- [ ] Rate Limiting 미들웨어
- [ ] 어드민 로그인 (이메일+비밀번호) 별도 구현
- [ ] 회원 탈퇴 소프트 삭제 + 30일 배치 삭제
- [ ] 보안 헤더 설정 (CSP, X-Frame-Options 등)
