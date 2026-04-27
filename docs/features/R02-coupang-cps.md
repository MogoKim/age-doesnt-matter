# 쿠팡 파트너스 CPS 운영 기획서 (R02)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27 (Feature Lifecycle 마이그레이션)

---

## 목표

매거진 콘텐츠와 연관된 쿠팡 상품을 AI로 자동 매칭·추천하여  
콘텐츠 맥락에 맞는 자연스러운 CPS 수익을 창출한다.

---

## 배경

- AdSense 광고 외 CPS(Cost Per Sale) 수익 다각화
- 50·60대 관심 카테고리(건강·요리·여행·생활)에 맞는 상품 자동 추천
- 매거진 발행 파이프라인에 통합 → 별도 운영 없이 자동화
- AdSense unfilled 시 쿠팡 배너 폴백으로도 노출

---

## 세부 기획

### 쿠팡 파트너스 계정 정보

| 항목 | 값 |
|------|-----|
| **트래킹 코드** | `AF3181348` |
| **API 방식** | Coupang Partners Deeplink API (HMAC-SHA256 CEA 인증) |
| **API 엔드포인트** | `POST https://api-gateway.coupang.com/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink` |

---

### 2-Layer 구조

**Layer 1: AI 매칭 → CPS 링크 생성 (에이전트)**  
매거진 발행 시 `cps-matcher.ts`가 자동으로 관련 상품을 선별하여 DB에 저장

**Layer 2: 배너 표시 (프론트엔드)**  
`CoupangBanner.tsx`로 전 페이지 배너 노출 + AdSense unfilled 폴백

---

### Layer 1: AI 매칭 파이프라인 (`agents/cafe/cps-matcher.ts`)

```
매거진 발행 완료
  ↓
카테고리 기반 상품 후보 목록 (CATEGORY_PRODUCTS 상수)
  - 건강: 종합비타민, 무릎 보호대, 혈압계
  - 요리: 에어프라이어, 밀폐용기 세트
  - 여행: 경량 백팩, 넥쿠션
  - 생활: 안마기, 스팀청소기
  ↓
Claude Haiku AI 매칭
  - 입력: 카테고리 + 기사 제목 + 본문 첫 300자
  - 출력: [{index, reason}] 최대 2개 선택
  ↓
Coupang Deeplink API 호출 (선택된 상품별)
  - HMAC-SHA256 CEA 인증
  - shortenUrl 우선 사용
  ↓
DB INSERT (CpsLink 테이블, 최대 2건)
  ↓
BotLog details.cpsMatched 기록
```

**AI 모델**: `CLAUDE_MODEL_LIGHT` (claude-haiku-4-5) — 비용 효율 중심

---

### Layer 2: 배너 표시 컴포넌트

**CoupangBanner** (`src/components/ad/CoupangBanner.tsx`)  
서버 컴포넌트 — UTC 날짜 기반 로테이션으로 hydration mismatch 방지

| preset | 크기 | 배너 종류 |
|--------|------|---------|
| `mobile` | 320×100 | 카테고리 배너 (UTC date % 2 로테이션) |
| `desktop` | 300×100 | 카테고리 배너 (동일 로테이션) |
| `leaderboard` | 728×90 | 리더보드 동적 배너 |
| `electronics` | 320×100 | 전자제품 배너 |

**등록 배너 2종**:
- `CATEGORY_FRESH` (bannerId: 976338) — 로켓프레시
- `CATEGORY_KITCHEN` (bannerId: 976342) — 로켓주방용품

---

### 페이지별 광고 배치

| 페이지 | 컴포넌트 | 배치 위치 |
|--------|---------|---------|
| 홈 (`/`) | `CoupangBanner` (mobile) | CommunitySection 다음 |
| 홈 (`/`) | `CoupangCarousel` | MagazineSection 다음 |
| 커뮤니티 상세 | `CoupangSearchWidget` | AdSense 다음 |
| 매거진 상세 | `CoupangCPS` (상품 링크 최대 3건 표시) | 본문 아래 |
| 매거진 상세 | `CoupangSearchWidget` | CPS 링크 다음 |
| 일자리 목록 | `CoupangBanner` (mobile) | 8번째 항목 다음 (`idx % 8 === 0`) |
| 베스트 | `CoupangBanner` (mobile) | 피드 사이 |
| 매거진 목록 | `CoupangBanner` (mobile) | 피드 사이 |
| 홈 PC 사이드바 | `CoupangBanner` (desktop) | 우측 고정 |

> AdSense unfilled 시 → `CoupangBanner` 자동 폴백 (AdSenseUnit 내 MutationObserver)

---

### DB 모델 (CpsLink)

```prisma
model CpsLink {
  id              String   @id @default(cuid())
  postId          String
  productName     String      // 상품명 (예: "종합비타민 (50대 이상)")
  productUrl      String      // 쿠팡 CPS shortenUrl
  productImageUrl String?     // 미사용
  rating          Float?      // 미사용
  createdAt       DateTime @default(now())
  
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  @@index([postId])
}
```

- **저장**: 매거진 발행 직후, 최대 **2건** DB 저장
- **표시**: 매거진 상세 페이지에서 최대 **3건** 표시 (DB 2건 + 추가 로직)
- **캐시**: 매거진 상세 페이지 5분 캐시

---

### BotLog 기록

- `botType: 'COO'`
- `action: 'MAGAZINE_GENERATE'` (CPS 전용 action 없음 — 매거진 파이프라인에 포함)
- `details.cpsMatched`: CPS 매칭 건수 기록

---

### Slack 알림

CPS 전용 Slack 알림 없음. 매거진 발행 완료 알림(`MAGAZINE_GENERATE`)에 cpsMatched 수치 포함.

---

### 클릭 추적

**CpsClickTracker** (`src/components/ad/CpsClickTracker.tsx`) — 클라이언트 컴포넌트

- **GTM 이벤트**: `cps_click` (product_name, category 파라미터)
- **DB 카운터**: 없음 (GTM만 기록)
- **쿠팡 파트너스**: 클릭 후 쿠팡 추적 코드(`AF3181348`) 기반 수수료 자동 집계

---

### API 키 미설정 시 동작

```
COUPANG_ACCESS_KEY 미설정
  → Deeplink API 호출 스킵
  → 원본 쿠팡 URL 그대로 사용 (파트너스 추적 없음)
  → graceful fallback (에러 없음)
```

---

### 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `COUPANG_ACCESS_KEY` | 선택 | 쿠팡 파트너스 API 접근 키 |
| `COUPANG_SECRET_KEY` | 선택 | HMAC-SHA256 서명 키 |

미설정 시: 파트너스 추적 없이 원본 URL 사용 (수수료 미발생)

---

### 비용 영향

| 항목 | 단가 | 빈도 | 월간 |
|------|------|------|------|
| Claude Haiku (AI 매칭) | $0.0008/1K input, $0.0032/1K output | 매거진 발행당 1회 | **~$1~2/월** |
| Coupang Deeplink API | 무료 | 발행당 최대 2회 | $0 |
| **합계** | — | — | **~$1~2/월** |

---

## 현재 운영 상태

✅ AI 자동 매칭 + Deeplink API 정상 작동  
✅ 전 페이지 배너 배치 완료  
✅ AdSense unfilled 폴백 정상 작동  
✅ GTM cps_click 이벤트 추적  
⚠️ CpsLink.rating 필드 미사용 (스키마 정리 검토 필요)  
⚠️ CPS 전용 BotLog action 없음 (MAGAZINE_GENERATE에 포함)

---

## 관련 링크

- AI 매칭 에이전트: `agents/cafe/cps-matcher.ts`
- 쿠팡 API 클라이언트: `agents/core/coupang.ts`
- 배너 컴포넌트: `src/components/ad/CoupangBanner.tsx`
- 상품 링크 컴포넌트: `src/components/ad/CoupangCPS.tsx`
- 클릭 추적: `src/components/ad/CpsClickTracker.tsx`
- 슬롯 설정: `src/components/ad/ad-slots.ts`
- 매거진 파이프라인: `agents/cafe/magazine-generator.ts`
- AdSense: [R01](R01-adsense.md)

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반, specs/10-advertising.md 마이그레이션) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | CpsLink.rating 필드 미사용 | 초기 설계 잔여물 | 5월 스키마 정리 시 삭제 검토 |
| 진행중 | DB 저장 2건 vs UI 표시 3건 불일치 | 설계 변경 잔여물 | 문서에 실제값 명시 |
