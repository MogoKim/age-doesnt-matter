# AdSense 광고 운영 기획서 (R01)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27 (Feature Lifecycle 마이그레이션)

---

## 목표

우나어 전 페이지에 Google AdSense 광고를 배치하여  
서비스 지속 운영을 위한 안정적인 광고 수익을 확보한다.

---

## 배경

- Vercel 서버리스 환경에서 별도 광고 서버 없이 Google AdSense로 즉시 수익화
- AdSense 미채워짐(unfilled) 시 쿠팡 배너(R02)로 자동 폴백 → 광고 노출 극대화
- SPA 라우팅 전환 시 광고 재로드 처리 (Next.js App Router 대응)

---

## 세부 기획

### AdSense 계정 정보

| 항목 | 값 |
|------|-----|
| **퍼블리셔 ID** | `ca-pub-4117999106913048` (하드코딩) |
| **스크립트 로딩** | `afterInteractive` (페이지 상호작용 후 non-blocking 로드) |

> ⚠️ `.env.example`에 `NEXT_PUBLIC_ADSENSE_PUB_ID=ca-pub-4937127825992215` 있으나 **실제 코드에서 사용되지 않음** (환경변수 값과 하드코딩 값 불일치). 환경변수로 전환 시 정정 필요.

---

### 광고 슬롯 목록 (`src/components/ad/ad-slots.ts`)

| 슬롯 상수 | 슬롯 ID | 타입 | 사용 여부 |
|---------|---------|------|---------|
| `IN_FEED` | `5592036395` | 인피드 (fluid) | ✅ 사용 중 |
| `IN_ARTICLE` | `2965873058` | 인아티클 | ✅ 사용 중 |
| `HOME_SECTION` | `9127452149` | 디스플레이 (horizontal) | ✅ 사용 중 |
| `PC_SIDEBAR` | `4568825260` | 디스플레이 | ❌ 미사용 (컴포넌트 있으나 미배치) |
| IN_FEED_LAYOUT_KEY | `-fl+4d+bg-ak-gr` | 인피드 레이아웃 키 | ✅ |

---

### 페이지별 광고 배치

| 페이지 | 컴포넌트 | 슬롯 | 위치 |
|--------|---------|------|------|
| 홈 (`/`) | `AdSenseUnit` | HOME_SECTION | TrendingSection 다음 |
| 홈 (`/`) | `FeedAd` (→AdSenseUnit) | IN_FEED | Life2Section 다음 |
| 커뮤니티 목록 | `FeedAd` | IN_FEED | 게시글 사이 반복 |
| 커뮤니티 상세 | `AdSenseUnit` | IN_ARTICLE | 본문 아래 |
| 매거진 목록 | `FeedAd` | IN_FEED | 기사 사이 반복 |
| 매거진 상세 | `AdSenseUnit` | IN_ARTICLE | 본문 아래 |
| 일자리 목록 | `FeedAd` | IN_FEED | 4번째 항목 다음 (`idx % 8 === 4`) |
| 베스트 | `FeedAd` | IN_FEED | 게시글 사이 반복 |
| 검색 | `FeedAd` | IN_FEED | 결과 사이 반복 |

> ⚠️ `MobileStickyAd` — 모바일 하단 고정 광고 컴포넌트 존재하지만 **현재 어느 페이지에도 배치되지 않음** (구 문서와 불일치)

---

### AdSenseUnit 핵심 동작

**파일**: `src/components/ad/AdSenseUnit.tsx` (`'use client'`)

```
pathname 변경 감지 (useEffect)
  → 기존 <ins> 태그 제거
  → 새 <ins> 태그 생성
  → adsbygoogle.push({}) 실행
  → MutationObserver로 data-ad-status 감시
      └─ "unfilled" → CoupangBanner 폴백 렌더링
```

**Unfilled 폴백**: AdSense 광고 미채워짐 감지 시 자동으로 쿠팡 배너 표시

---

### CSP 설정 (`next.config.js`)

| directive | 허용 도메인 |
|-----------|-----------|
| `script-src` | pagead2.googlesyndication.com, tpc.googlesyndication.com, www.google.com, googleads.g.doubleclick.net, *.adtrafficquality.google, fundingchoicesmessages.google.com |
| `img-src` | pagead2.googlesyndication.com, googleads.g.doubleclick.net, tpc.googlesyndication.com |
| `connect-src` | 위 script-src와 동일 |
| `frame-src` | www.google.com, pagead2.googlesyndication.com, tpc.googlesyndication.com, googleads.g.doubleclick.net |

---

### Hydration 이슈 해결

| 문제 | 해결 방식 |
|------|---------|
| SPA 라우팅 시 광고 미갱신 | `pathname` 의존성 추가 → 라우트 변경마다 재생성 |
| CoupangBanner UTC/KST 불일치 | `getUTCDate() % 2` 서버 컴포넌트로 전환 |
| `useIsDesktop()` hydration mismatch | `ResponsiveAd` → CSS `block lg:hidden / hidden lg:block` 분기 |

---

### 클릭 추적 (`src/components/ad/AdClickTracker.tsx`)

- **GTM 이벤트**: `ad_click` (ad_slot, ad_type 파라미터)
- **DB 카운터**: `POST /api/ad-click` → `AdBanner.clicks +1`
- **중복 방지**: 동일 IP + adId 60초 쿨다운

---

### DB 기반 광고 슬롯 (`src/components/ad/AdSlot.tsx`)

어드민에서 등록한 광고를 DB 기반으로 동적 운영:
- `startDate ≤ now ≤ endDate` 필터
- `priority DESC` 정렬 → 1건 선택
- `adType`: GOOGLE / COUPANG / SELF / EXTERNAL
- 노출 시 `impressions +1` fire-and-forget

---

### 환경변수

| 변수 | 필수 | 비고 |
|------|------|------|
| 없음 (환경변수 불필요) | — | 퍼블리셔 ID 하드코딩 (`ca-pub-4117999106913048`) |

> `NEXT_PUBLIC_ADSENSE_PUB_ID` 환경변수 존재하나 코드에서 실제 사용 안 함

---

### 비용 영향

| 항목 | 비용 |
|------|------|
| Google AdSense | **무료** (구글이 광고주에게 청구, 우리는 수익만 수취) |
| AdSense 스크립트 CDN | 무료 |

---

## 현재 운영 상태

✅ IN_FEED, IN_ARTICLE, HOME_SECTION 슬롯 전 페이지 배치 완료  
✅ Unfilled → 쿠팡 배너 자동 폴백  
✅ SPA 라우팅 광고 재로드 처리  
✅ CSP 완벽 설정  
⚠️ PC_SIDEBAR, MobileStickyAd 미사용 (코드 정리 필요)  
⚠️ 퍼블리셔 ID 하드코딩 (환경변수와 값 불일치)

---

## 관련 링크

- 핵심 컴포넌트: `src/components/ad/AdSenseUnit.tsx`
- 슬롯 설정: `src/components/ad/ad-slots.ts`
- 클릭 추적: `src/components/ad/AdClickTracker.tsx`
- 반응형 분기: `src/components/ad/ResponsiveAd.tsx`
- DB 기반 슬롯: `src/components/ad/AdSlot.tsx`
- 클릭 API: `src/app/api/ad-click/route.ts`
- CSP: `next.config.js`
- 쿠팡 CPS: [R02](R02-coupang-cps.md)

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반, specs/10-advertising.md 마이그레이션) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | PC_SIDEBAR, MobileStickyAd 코드는 있으나 미사용 | 개발 후 미배치 | 필요 시 페이지에 추가 or 코드 정리 |
| 진행중 | 퍼블리셔 ID 환경변수 미사용 | 하드코딩 | 환경변수로 전환 권장 |
