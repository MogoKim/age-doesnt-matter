# 전체 DB 스키마 (DB_SCHEMA_FULL)

> **기준 문서**: AUTH_SPEC.md · PRD_Final_A~D · HOME_UI_SPEC.md
> **작성일**: 2026-03-17
> **목적**: 개발자가 이 문서만 보고 `prisma db push`로 전체 스키마를 반영할 수 있도록 작성

---

## 0. 설계 원칙

| 원칙 | 설명 |
|:---|:---|
| **Prisma 전용** | Raw SQL 절대 금지. 모든 쿼리는 Prisma Client로 실행 |
| **cuid ID** | 모든 테이블 PK는 `String @id @default(cuid())` |
| **Soft Delete** | 삭제는 `status` 필드 변경. 하드 삭제는 배치 Job으로만 |
| **카운트 비정규화** | 자주 조회되는 카운트(좋아요·댓글 수)는 비정규화 저장 + 트리거 갱신 |
| **FK 명시** | 다형(polymorphic) FK 대신 optional FK 분리 (Prisma 관계 지원) |
| **UTC 저장** | 모든 DateTime은 UTC. 프론트에서 KST 변환 |

---

## 1. ERD (Entity Relationship Diagram)

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│  AdminAccount│     │     User     │     │   Agreement    │
│─────────────│     │──────────────│     │────────────────│
│ id          │     │ id           │←──┐ │ id             │
│ email       │     │ nickname     │   │ │ userId ────────│→ User
│ passwordHash│     │ providerId   │   │ │ type           │
│ nickname    │     │ grade        │   │ │ version        │
│ role        │     │ status       │   │ │ agreedAt       │
└──────┬──────┘     └──────┬───────┘   │ └────────────────┘
       │                   │           │
       │            ┌──────┼───────────┼──────────────────┐
       │            │      │           │                  │
       │            ▼      ▼           │                  ▼
       │     ┌──────────┐  ┌─────────┐│  ┌────────────┐ ┌──────────┐
       │     │   Post   │  │ Comment ││  │    Like    │ │  Scrap   │
       │     │──────────│  │─────────││  │────────────│ │──────────│
       │     │ boardType│  │ parentId││  │ userId     │ │ userId   │
       │     │ authorId─┤  │ postId──┤│  │ postId?    │ │ postId   │
       │     │ status   │  │authorId─┤│  │ commentId? │ └──────────┘
       │     │ promoted │  │isFiltered│  └────────────┘
       │     └────┬─────┘  └─────────┘
       │          │
       │          ├─── 1:1 ──→ ┌────────────┐
       │          │            │  JobDetail  │
       │          │            │────────────│
       │          │            │ postId     │
       │          │            │ company    │
       │          │            │ salary     │
       │          │            │ region     │
       │          │            └────────────┘
       │          │
       │          └─── 1:N ──→ ┌────────────┐
       │                       │  CpsLink   │
       │                       │────────────│
       │                       │ postId     │
       │                       │ productUrl │
       │                       └────────────┘
       │
       │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐
       │  │   Report     │  │ Notification │  │  UserBlock    │
       │  │──────────────│  │──────────────│  │───────────────│
       │  │ userId       │  │ userId       │  │ userId        │
       │  │ postId?      │  │ type         │  │ blockedUserId │
       │  │ commentId?   │  │ postId?      │  └───────────────┘
       │  │ processedBy──┤  │ fromUserId?  │
       │  └──────────────┘  └──────────────┘
       │
       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│AdminAuditLog │  │   BotLog     │  │  EventLog    │
│──────────────│  │──────────────│  │──────────────│
│ adminId ─────┤  │ botType      │  │ eventName    │
│ action       │  │ status       │  │ userId?      │
│ targetType   │  │ collected    │  │ properties   │
│ targetId     │  │ published    │  │ path         │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Banner     │  │  AdBanner    │  │ BoardConfig  │
│──────────────│  │──────────────│  │──────────────│
│ title        │  │ slot         │  │ boardType    │
│ imageUrl     │  │ adType       │  │ hotThreshold │
│ linkUrl      │  │ clickUrl     │  │ writeGrade   │
│ priority     │  │ priority     │  │ isActive     │
└──────────────┘  └──────────────┘  └──────────────┘

┌──────────────┐
│  BannedWord  │
│──────────────│
│ word         │
│ category     │
│ isActive     │
└──────────────┘
```

---

## 2. Enum 정의

```prisma
// ── 사용자 ──
enum Role {
  USER
  ADMIN
}

enum Grade {
  SPROUT         // 🌱 새싹 — 가입 즉시
  REGULAR        // 🌿 단골 — 글5 OR 댓글20
  VETERAN        // 💎 터줏대감 — 글20 AND 공감100+
  WARM_NEIGHBOR  // ☀️ 따뜻한이웃 — PO 수동 부여
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
  WITHDRAWN
}

enum FontSize {
  NORMAL   // 17px
  LARGE    // 20px
  XLARGE   // 24px
}

// ── 약관 ──
enum AgreementType {
  TERMS_OF_SERVICE
  PRIVACY_POLICY
  MARKETING
}

// ── 게시글 ──
enum BoardType {
  JOB       // 내 일 찾기
  STORY     // 사는이야기
  HUMOR     // 활력충전소
  MAGAZINE  // 매거진
  WEEKLY    // 수다방
}

enum PostStatus {
  DRAFT
  PUBLISHED
  HIDDEN
  DELETED
}

enum PostSource {
  USER
  BOT
  ADMIN
}

enum PromotionLevel {
  NORMAL
  HOT            // 공감 10+ (기본값, BoardConfig로 조절)
  HALL_OF_FAME   // 공감 50+ (기본값, BoardConfig로 조절)
}

// ── 댓글 ──
enum CommentStatus {
  ACTIVE
  HIDDEN
  DELETED
}

// ── 신고 ──
enum ReportReason {
  PROFANITY   // 욕설/비속어
  POLITICS    // 정치
  HATE        // 혐오/차별
  SPAM        // 스팸/광고
  ADULT       // 성인/음란
  OTHER       // 기타
}

enum ReportStatus {
  PENDING
  REVIEWED
  RESOLVED
}

enum ReportAction {
  DELETED
  HIDDEN
  WARNING
  SUSPENDED
  BANNED
  DISMISSED
}

// ── 알림 ──
enum NotificationType {
  COMMENT         // 댓글 알림
  LIKE            // 공감 알림 (묶음)
  GRADE_UP        // 등급 승격
  SYSTEM          // 운영 공지
  CONTENT_HIDDEN  // 내 글/댓글 숨김 처리
}

// ── 광고 ──
enum AdType {
  SELF      // 자체 배너
  GOOGLE    // 구글 애드센스
  COUPANG   // 쿠팡 파트너스
  EXTERNAL  // 외부 직접 계약
}

enum AdSlot {
  HERO            // 홈 히어로
  HOME_INLINE     // 홈 피드 사이
  SIDEBAR         // 데스크탑 사이드바
  LIST_INLINE     // 목록 사이
  POST_BOTTOM     // 게시글 하단
  MOBILE_STICKY   // 모바일 하단 고정
  MAGAZINE_CPS    // 매거진 CPS
}

// ── 봇 ──
enum BotType {
  JOB      // 일자리 수집 (주2회)
  HUMOR    // 유머 수집 (주1회)
  STORY    // 이야기 수집 (주1회)
  THREAD   // 토론 주제 생성 (일1회)
}

enum BotStatus {
  SUCCESS
  PARTIAL
  FAILED
}

// ── 금지어 ──
enum BannedWordCategory {
  PROFANITY  // 욕설
  POLITICS   // 정치
  HATE       // 혐오
  SPAM       // 광고
  ADULT      // 성인
}

// ── 어드민 감사 ──
enum AuditTargetType {
  USER
  POST
  COMMENT
  REPORT
  BOARD_CONFIG
  BANNER
  AD
  BOT
  AGENT
}
```

---

## 3. 모델 정의 (Prisma Schema)

### 3.1 User

```prisma
model User {
  id              String     @id @default(cuid())
  email           String?    @unique
  nickname        String     @unique
  profileImage    String?
  providerId      String     @unique  // 카카오 User ID
  role            Role       @default(USER)
  grade           Grade      @default(SPROUT)
  birthYear       Int?
  gender          String?
  regions         String[]   // 관심 지역 (복수 선택)
  interests       String[]   // 관심사 (복수 선택)
  fontSize        FontSize   @default(NORMAL)

  // 비정규화 카운트 (등급 산정 + 목록 표시용)
  postCount       Int        @default(0)
  commentCount    Int        @default(0)
  receivedLikes   Int        @default(0)

  // 상태
  status          UserStatus @default(ACTIVE)
  suspendedUntil  DateTime?
  withdrawnAt     DateTime?  // 탈퇴 시각 (30일 후 하드삭제 기준)

  // 설정
  marketingOptIn  Boolean    @default(false)
  nicknameChangedAt DateTime?

  // 타임스탬프
  lastLoginAt     DateTime   @default(now())
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  // 관계
  posts           Post[]
  comments        Comment[]
  likes           Like[]
  scraps          Scrap[]
  reportsMade     Report[]       @relation("reporter")
  notifications   Notification[] @relation("notificationOwner")
  notificationsSent Notification[] @relation("notificationSender")
  agreements      Agreement[]
  blocksInitiated UserBlock[]    @relation("blocker")
  blocksReceived  UserBlock[]    @relation("blocked")

  @@index([status])
  @@index([grade])
  @@index([createdAt])
}
```

### 3.2 AdminAccount

```prisma
model AdminAccount {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String   // bcrypt (saltRounds=12)
  nickname      String
  role          Role     @default(ADMIN)
  lastLoginAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // 관계
  auditLogs     AdminAuditLog[]
  processedReports Report[]  @relation("reportProcessor")
}
```

### 3.3 Agreement

```prisma
model Agreement {
  id       String        @id @default(cuid())
  userId   String
  type     AgreementType
  version  String        // e.g. "2026-03-17-v1"
  agreedAt DateTime      @default(now())

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, type, version])
  @@index([userId])
}
```

### 3.4 Post

```prisma
model Post {
  id             String         @id @default(cuid())
  boardType      BoardType
  category       String?        // 말머리 (게시판별 상이)
  title          String
  content        String         // HTML (DOMPurify 처리됨)
  summary        String?        // 목록용 요약 (자동 생성 또는 수동)
  thumbnailUrl   String?

  authorId       String
  source         PostSource     @default(USER)

  status         PostStatus     @default(PUBLISHED)
  promotionLevel PromotionLevel @default(NORMAL)
  isPinned       Boolean        @default(false)
  pinnedPosition Int?           // 핀 순서 (1=최상단)

  // 비정규화 카운트
  viewCount      Int            @default(0)
  likeCount      Int            @default(0)
  commentCount   Int            @default(0)
  scrapCount     Int            @default(0)
  reportCount    Int            @default(0)

  // SEO
  seoTitle       String?
  seoDescription String?

  publishedAt    DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  // 관계
  author         User           @relation(fields: [authorId], references: [id])
  jobDetail      JobDetail?
  comments       Comment[]
  likes          Like[]         @relation("postLikes")
  scraps         Scrap[]
  reports        Report[]       @relation("postReports")
  notifications  Notification[] @relation("notificationPost")
  cpsLinks       CpsLink[]

  @@index([boardType, status, createdAt(sort: Desc)])
  @@index([boardType, status, promotionLevel, createdAt(sort: Desc)])
  @@index([authorId])
  @@index([status, reportCount])
}
```

### 3.5 JobDetail

```prisma
model JobDetail {
  id           String    @id @default(cuid())
  postId       String    @unique

  company      String
  salary       String?   // "시급 12,000원", "월 250만원" 등 자유 형식
  workHours    String?   // "09:00~18:00"
  workDays     String?   // "주5일", "주3일" 등
  location     String    // 상세 주소
  region       String    // 지역 (서울, 경기, 부산 등)
  jobType      String?   // 직종 분류
  applyUrl     String?   // 지원 링크

  // 봇 수집 데이터 (JSON)
  pickPoints   Json?     // AI가 뽑은 핵심 포인트 [{point: "...", icon: "..."}]
  qna          Json?     // AI Q&A [{q: "...", a: "..."}]
  quickTags    String[]  // ["시급12000", "주5일", "서울강남"]

  tier         Int       @default(0)  // 정렬 가중치
  expiresAt    DateTime? // 채용 마감일

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  // 관계
  post         Post      @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([region])
  @@index([expiresAt])
}
```

### 3.6 Comment

```prisma
model Comment {
  id           String        @id @default(cuid())
  postId       String
  authorId     String
  content      String        // 텍스트 (DOMPurify)
  imageUrl     String?       // 이미지 첨부 (🌿 단골 이상)

  parentId     String?       // 대댓글 (1단계만)
  likeCount    Int           @default(0)
  reportCount  Int           @default(0)
  isFiltered   Boolean       @default(false) // AI 필터 감지

  status       CommentStatus @default(ACTIVE)

  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  // 관계
  post         Post          @relation(fields: [postId], references: [id], onDelete: Cascade)
  author       User          @relation(fields: [authorId], references: [id])
  parent       Comment?      @relation("replies", fields: [parentId], references: [id])
  replies      Comment[]     @relation("replies")
  likes        Like[]        @relation("commentLikes")
  reports      Report[]      @relation("commentReports")

  @@index([postId, status, createdAt])
  @@index([authorId])
  @@index([parentId])
}
```

### 3.7 Like

```prisma
model Like {
  id        String   @id @default(cuid())
  userId    String

  // 대상: Post 또는 Comment (둘 중 하나만 값 존재)
  postId    String?
  commentId String?

  createdAt DateTime @default(now())

  // 관계
  user      User     @relation(fields: [userId], references: [id])
  post      Post?    @relation("postLikes", fields: [postId], references: [id], onDelete: Cascade)
  comment   Comment? @relation("commentLikes", fields: [commentId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
  @@unique([userId, commentId])
  @@index([postId])
  @@index([commentId])
}
```

### 3.8 Scrap

```prisma
model Scrap {
  id        String   @id @default(cuid())
  userId    String
  postId    String
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
  @@index([userId, createdAt(sort: Desc)])
}
```

### 3.9 Report

```prisma
model Report {
  id           String        @id @default(cuid())
  userId       String        // 신고자

  // 대상: Post 또는 Comment (둘 중 하나만 값 존재)
  postId       String?
  commentId    String?

  reason       ReportReason
  description  String?       // 기타 사유 상세

  status       ReportStatus  @default(PENDING)
  action       ReportAction? // 처리 결과

  processedBy  String?       // AdminAccount ID
  processedAt  DateTime?

  createdAt    DateTime      @default(now())

  // 관계
  reporter     User          @relation("reporter", fields: [userId], references: [id])
  post         Post?         @relation("postReports", fields: [postId], references: [id], onDelete: Cascade)
  comment      Comment?      @relation("commentReports", fields: [commentId], references: [id], onDelete: Cascade)
  processor    AdminAccount? @relation("reportProcessor", fields: [processedBy], references: [id])

  @@index([status, createdAt])
  @@index([postId])
  @@index([commentId])
  @@index([userId])
}
```

### 3.10 Notification

```prisma
model Notification {
  id         String           @id @default(cuid())
  userId     String           // 수신자
  type       NotificationType
  content    String           // 표시 메시지
  postId     String?          // 관련 게시글 (클릭 시 이동)
  fromUserId String?          // 발신자 (시스템 알림은 null)
  isRead     Boolean          @default(false)
  createdAt  DateTime         @default(now())

  // 관계
  user       User             @relation("notificationOwner", fields: [userId], references: [id], onDelete: Cascade)
  fromUser   User?            @relation("notificationSender", fields: [fromUserId], references: [id])
  post       Post?            @relation("notificationPost", fields: [postId], references: [id], onDelete: SetNull)

  @@index([userId, isRead, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
}
```

### 3.11 UserBlock

```prisma
model UserBlock {
  id            String   @id @default(cuid())
  userId        String   // 차단한 사람
  blockedUserId String   // 차단당한 사람
  createdAt     DateTime @default(now())

  blocker       User     @relation("blocker", fields: [userId], references: [id], onDelete: Cascade)
  blocked       User     @relation("blocked", fields: [blockedUserId], references: [id], onDelete: Cascade)

  @@unique([userId, blockedUserId])
}
```

### 3.12 Banner

```prisma
model Banner {
  id          String    @id @default(cuid())
  title       String
  description String?
  imageUrl    String    // R2 스토리지 URL
  linkUrl     String?
  startDate   DateTime
  endDate     DateTime
  priority    Int       @default(0) // 높을수록 먼저 노출
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([isActive, startDate, endDate])
}
```

### 3.13 AdBanner

```prisma
model AdBanner {
  id          String   @id @default(cuid())
  slot        AdSlot
  adType      AdType
  title       String?
  imageUrl    String?  // 이미지 배너용
  htmlCode    String?  // 구글/쿠팡 코드 삽입용
  clickUrl    String?

  startDate   DateTime
  endDate     DateTime
  priority    Int      @default(0)  // 높을수록 우선 노출

  // 통계 (비정규화)
  impressions Int      @default(0)
  clicks      Int      @default(0)

  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([slot, isActive, startDate, endDate])
  @@index([adType])
}
```

### 3.14 CpsLink

```prisma
model CpsLink {
  id              String   @id @default(cuid())
  postId          String
  productName     String
  productUrl      String   // 쿠팡 파트너스 링크
  productImageUrl String?
  rating          Float?
  createdAt       DateTime @default(now())

  post            Post     @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
}
```

### 3.15 BotLog

```prisma
model BotLog {
  id                 String    @id @default(cuid())
  botType            BotType
  status             BotStatus

  collectedCount     Int       @default(0)  // 수집한 원본 수
  filteredCount      Int       @default(0)  // 필터 통과 수
  publishedCount     Int       @default(0)  // 발행된 수
  reviewPendingCount Int       @default(0)  // 검수 대기 수

  logData            Json?     // 상세 로그 (에러 메시지, URL 등)

  executedAt         DateTime  @default(now())
  nextScheduledAt    DateTime?

  createdAt          DateTime  @default(now())

  @@index([botType, executedAt(sort: Desc)])
  @@index([status])
}
```

### 3.16 EventLog

```prisma
model EventLog {
  id         String   @id @default(cuid())
  eventName  String   // page_view, post_created, like_clicked, search_query, ad_click 등
  userId     String?  // 비회원은 null
  sessionId  String?
  properties Json?    // 이벤트별 커스텀 데이터

  path       String?  // 페이지 경로
  referrer   String?
  userAgent  String?
  ip         String?

  createdAt  DateTime @default(now())

  @@index([eventName, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
}
```

### 3.17 AdminAuditLog

```prisma
model AdminAuditLog {
  id         String          @id @default(cuid())
  adminId    String
  action     String          // "grade_change", "user_ban", "post_delete", "config_update" 등
  targetType AuditTargetType
  targetId   String          // 대상 엔티티 ID
  before     Json?           // 변경 전 값
  after      Json?           // 변경 후 값
  note       String?         // 메모

  createdAt  DateTime        @default(now())

  admin      AdminAccount    @relation(fields: [adminId], references: [id])

  @@index([adminId, createdAt(sort: Desc)])
  @@index([targetType, targetId])
  @@index([createdAt(sort: Desc)])
}
```

### 3.18 BoardConfig

```prisma
model BoardConfig {
  id             String    @id @default(cuid())
  boardType      BoardType @unique

  displayName    String    // "내 일 찾기", "사는이야기" 등
  description    String?
  categories     String[]  // 말머리 목록 ["일상", "건강", "고민" ...]
  writeGrade     Grade     @default(SPROUT) // 최소 작성 등급
  isActive       Boolean   @default(true)
  hotThreshold   Int       @default(10)     // 뜨는글 공감 기준
  fameThreshold  Int       @default(50)     // 명예의전당 공감 기준

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

### 3.19 BannedWord

```prisma
model BannedWord {
  id        String             @id @default(cuid())
  word      String             @unique
  category  BannedWordCategory
  isActive  Boolean            @default(true)
  createdAt DateTime           @default(now())

  @@index([category, isActive])
}
```

---

## 4. 관계 요약

### 4.1 1:N 관계

| 부모 | 자식 | FK | 설명 |
|:---|:---|:---|:---|
| User | Post | `authorId` | 사용자가 작성한 게시글 |
| User | Comment | `authorId` | 사용자가 작성한 댓글 |
| User | Like | `userId` | 사용자의 공감 |
| User | Scrap | `userId` | 사용자의 스크랩 |
| User | Report | `userId` | 사용자가 한 신고 |
| User | Notification | `userId` | 수신 알림 |
| User | Agreement | `userId` | 약관 동의 이력 |
| Post | Comment | `postId` | 게시글의 댓글 |
| Post | CpsLink | `postId` | 매거진 CPS 상품 |
| AdminAccount | AdminAuditLog | `adminId` | 어드민 행위 로그 |
| AdminAccount | Report | `processedBy` | 어드민이 처리한 신고 |

### 4.2 1:1 관계

| 부모 | 자식 | FK | 설명 |
|:---|:---|:---|:---|
| Post | JobDetail | `postId` | 일자리 게시글 상세 |

### 4.3 Self-referential

| 모델 | FK | 설명 |
|:---|:---|:---|
| Comment | `parentId` | 대댓글 (1단계만) |

### 4.4 다형(Polymorphic) 패턴 — Optional FK

| 모델 | FK 1 | FK 2 | 규칙 |
|:---|:---|:---|:---|
| Like | `postId?` | `commentId?` | 둘 중 하나만 값 존재 (앱 레벨 검증) |
| Report | `postId?` | `commentId?` | 둘 중 하나만 값 존재 (앱 레벨 검증) |

---

## 5. 인덱스 전략

### 5.1 핵심 쿼리별 인덱스

| 쿼리 | 테이블 | 인덱스 |
|:---|:---|:---|
| 게시판 목록 (최신순) | Post | `[boardType, status, createdAt DESC]` |
| 뜨는글/명예의전당 | Post | `[boardType, status, promotionLevel, createdAt DESC]` |
| 내가 쓴 글 | Post | `[authorId]` |
| 댓글 목록 | Comment | `[postId, status, createdAt]` |
| 알림 목록 | Notification | `[userId, isRead, createdAt DESC]` |
| 미처리 신고 | Report | `[status, createdAt]` |
| 이벤트 분석 | EventLog | `[eventName, createdAt DESC]` |
| 배너 노출 | Banner | `[isActive, startDate, endDate]` |
| 광고 노출 | AdBanner | `[slot, isActive, startDate, endDate]` |
| 감사 로그 | AdminAuditLog | `[adminId, createdAt DESC]` |

### 5.2 Unique 제약

| 테이블 | 필드 | 목적 |
|:---|:---|:---|
| User | `email` | 이메일 유일성 |
| User | `nickname` | 닉네임 유일성 |
| User | `providerId` | 카카오 ID 유일성 |
| AdminAccount | `email` | 어드민 이메일 유일성 |
| Agreement | `[userId, type, version]` | 동일 약관 중복 동의 방지 |
| Like | `[userId, postId]` | 게시글 중복 공감 방지 |
| Like | `[userId, commentId]` | 댓글 중복 공감 방지 |
| Scrap | `[userId, postId]` | 중복 스크랩 방지 |
| UserBlock | `[userId, blockedUserId]` | 중복 차단 방지 |
| BoardConfig | `boardType` | 게시판당 1개 설정 |
| BannedWord | `word` | 금지어 중복 방지 |
| JobDetail | `postId` | 게시글당 1개 상세 |

---

## 6. 비정규화 필드 & 동기화 규칙

성능을 위해 카운트를 비정규화 저장. 원본은 관계 테이블이며, 카운트는 트랜잭션 내에서 갱신.

| 모델 | 비정규화 필드 | 원본 | 갱신 시점 |
|:---|:---|:---|:---|
| User | `postCount` | `Post` count | 글 작성/삭제 시 |
| User | `commentCount` | `Comment` count | 댓글 작성/삭제 시 |
| User | `receivedLikes` | `Like` on user's posts | 공감 추가/취소 시 |
| Post | `viewCount` | — (직접 증가) | 조회 시 (debounce) |
| Post | `likeCount` | `Like` count | 공감 추가/취소 시 |
| Post | `commentCount` | `Comment` count | 댓글 작성/삭제 시 |
| Post | `scrapCount` | `Scrap` count | 스크랩 추가/취소 시 |
| Post | `reportCount` | `Report` count | 신고 접수 시 |
| Comment | `likeCount` | `Like` count | 공감 추가/취소 시 |
| Comment | `reportCount` | `Report` count | 신고 접수 시 |
| AdBanner | `impressions` | — (직접 증가) | 노출 시 |
| AdBanner | `clicks` | — (직접 증가) | 클릭 시 |

### 갱신 패턴 (Prisma 트랜잭션)

```typescript
// 공감 추가 예시
async function addLike(userId: string, postId: string) {
  return prisma.$transaction([
    prisma.like.create({
      data: { userId, postId },
    }),
    prisma.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
    }),
    prisma.user.update({
      where: { id: post.authorId },
      data: { receivedLikes: { increment: 1 } },
    }),
  ]);
}
```

---

## 7. 데이터 생명주기 & 보존 정책

| 데이터 | 보존 기간 | 삭제 방식 | 근거 |
|:---|:---|:---|:---|
| **User (탈퇴)** | 30일 유예 → 삭제 | Soft → Hard | 개인정보보호법 |
| **Post (삭제)** | `status=DELETED`, 영구 보관 | Soft Delete | 신고/감사 이력 보존 |
| **Comment (삭제)** | `status=DELETED`, 영구 보관 | Soft Delete | 대댓글 구조 유지 |
| **EventLog** | 90일 | 배치 하드 삭제 | 스토리지 절약 |
| **BotLog** | 90일 | 배치 하드 삭제 | 스토리지 절약 |
| **AdminAuditLog** | 1년 | 배치 하드 삭제 | 감사 규정 |
| **Notification** | 90일 | 배치 하드 삭제 | UX (오래된 알림 불필요) |

### 배치 Job 스케줄

```
# 매일 02:00 KST
- User 하드 삭제: withdrawnAt < now() - 30 days
- EventLog 삭제: createdAt < now() - 90 days
- BotLog 삭제: createdAt < now() - 90 days
- Notification 삭제: createdAt < now() - 90 days

# 매월 1일 02:00 KST
- AdminAuditLog 삭제: createdAt < now() - 365 days
```

---

## 8. 시드 데이터

### 8.1 BoardConfig 초기 데이터

```typescript
const boardConfigs = [
  {
    boardType: 'JOB',
    displayName: '내 일 찾기',
    description: '5060 맞춤 일자리 정보',
    categories: [],  // 일자리는 말머리 없음 (region으로 구분)
    writeGrade: 'ADMIN' as any,  // 봇/어드민만 작성
    hotThreshold: 10,
    fameThreshold: 50,
  },
  {
    boardType: 'STORY',
    displayName: '사는이야기',
    description: '일상을 나누는 공간',
    categories: ['일상', '건강', '고민', '자녀', '기타'],
    writeGrade: 'SPROUT',
    hotThreshold: 10,
    fameThreshold: 50,
  },
  {
    boardType: 'HUMOR',
    displayName: '활력충전소',
    description: '웃음과 힐링이 있는 곳',
    categories: ['유머', '힐링', '자랑', '추천', '기타'],
    writeGrade: 'SPROUT',
    hotThreshold: 10,
    fameThreshold: 50,
  },
  {
    boardType: 'MAGAZINE',
    displayName: '매거진',
    description: '유익한 정보 모음',
    categories: ['연금복지', '건강', '생활', '일자리팁', '기타'],
    writeGrade: 'ADMIN' as any,  // 봇/어드민만 작성
    hotThreshold: 10,
    fameThreshold: 50,
  },
  {
    boardType: 'WEEKLY',
    displayName: '수다방',
    description: '가벼운 수다와 토론',
    categories: [],
    writeGrade: 'SPROUT',
    hotThreshold: 10,
    fameThreshold: 50,
  },
];
```

### 8.2 초기 어드민 계정

```typescript
// prisma/seed.ts에서 실행
const admin = await prisma.adminAccount.create({
  data: {
    email: 'admin@age-doesnt-matter.com',
    passwordHash: await bcrypt.hash(process.env.ADMIN_INITIAL_PW!, 12),
    nickname: '운영자',
    role: 'ADMIN',
  },
});
```

### 8.3 기본 금지어

```typescript
const bannedWords = [
  // 정치 관련
  { word: '문재인', category: 'POLITICS' },
  { word: '윤석열', category: 'POLITICS' },
  { word: '이재명', category: 'POLITICS' },
  // ... 정치인 이름, 정당명 등

  // 욕설/비속어 (일부 예시)
  { word: '시발', category: 'PROFANITY' },
  { word: '개새끼', category: 'PROFANITY' },
  // ... 추가 금지어는 어드민에서 관리
];
```

---

## 9. 마이그레이션 가이드

### 9.1 Prisma 설정

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")  // Supabase
}

generator client {
  provider = "prisma-client-js"
}
```

### 9.2 마이그레이션 순서

```bash
# 1. 스키마 파일 작성 완료 후
npx prisma migrate dev --name init

# 2. 시드 데이터 투입
npx prisma db seed

# 3. Prisma Client 생성
npx prisma generate
```

### 9.3 환경변수

```
DATABASE_URL=  # .env.local 참조 (Pooler, port 6543)
DIRECT_URL=    # .env.local 참조 (Direct, port 5432)
# 형식: postgres.[PROJECT_ID]:[PASSWORD]@aws-1-[REGION].pooler.supabase.com:[PORT]/postgres
```

---

## 10. 테이블 총괄

| # | 테이블 | 용도 | 출처 |
|:---:|:---|:---|:---|
| 1 | **User** | 일반 사용자 (카카오 OAuth) | AUTH_SPEC, PRD_A |
| 2 | **AdminAccount** | 어드민 계정 (이메일+비밀번호) | AUTH_SPEC, PRD_B |
| 3 | **Agreement** | 약관 동의 이력 | AUTH_SPEC |
| 4 | **Post** | 게시글 (5개 게시판 통합) | PRD_A |
| 5 | **JobDetail** | 일자리 게시글 상세 | PRD_A, PRD_D |
| 6 | **Comment** | 댓글 + 대댓글 | PRD_A |
| 7 | **Like** | 공감 (게시글/댓글) | PRD_A |
| 8 | **Scrap** | 스크랩 (게시글) | PRD_A |
| 9 | **Report** | 신고 (게시글/댓글) | PRD_A, PRD_B |
| 10 | **Notification** | 알림 | PRD_A |
| 11 | **UserBlock** | 사용자 차단 | PRD_A |
| 12 | **Banner** | 히어로 배너 | PRD_A, PRD_B |
| 13 | **AdBanner** | 광고 배너 | PRD_A, PRD_B |
| 14 | **CpsLink** | 쿠팡 CPS 상품 링크 | PRD_A |
| 15 | **BotLog** | 봇 실행 로그 | PRD_B, PRD_D |
| 16 | **EventLog** | 이벤트/분석 로그 | PRD_B, PRD_C |
| 17 | **AdminAuditLog** | 어드민 행위 감사 로그 | PRD_B |
| 18 | **BoardConfig** | 게시판 설정 (어드민 관리) | PRD_B |
| 19 | **BannedWord** | 금지어 사전 | PRD_A, PRD_B |

**총 19개 테이블** — Phase 1 서비스 운영에 필요한 전체 스키마

> **Phase 2+ 확장 예정**: AgentLog, AgentMeeting, AgentApprovalRequest (PRD_D AI 에이전트 테이블은 Track E에서 추가)

---

## 11. 구현 체크리스트

- [ ] `prisma/schema.prisma`에 전체 모델 작성
- [ ] `npx prisma migrate dev --name init` 실행
- [ ] `prisma/seed.ts` 시드 스크립트 작성
- [ ] BoardConfig 5개 시드
- [ ] AdminAccount 초기 계정 시드
- [ ] BannedWord 기본 금지어 시드
- [ ] 비정규화 카운트 갱신 유틸 함수 작성
- [ ] 배치 Job 스케줄러 설정 (하드 삭제)
- [ ] Prisma Client 타입 생성 확인
