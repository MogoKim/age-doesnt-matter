# 10. 광고/수익화 (AdSense/쿠팡CPS/배너/팝업)

## 개요
Google AdSense 및 쿠팡 파트너스 기반의 다채널 광고 노출 시스템으로, 배너·인피드·인아티클·스티키·팝업·CPS 상품 링크를 통해 수익화하며 노출/클릭 이벤트를 추적한다.

---

## 주요 화면/페이지

| 경로 | 설명 | 인증 필요 |
|------|------|----------|
| `/` (홈) | 섹션 사이 배너 광고(`HOME_SECTION`) 및 피드 인피드 광고 노출 | 불필요 |
| `/community/**` | 커뮤니티 목록 피드 사이 인피드 광고(`FeedAd`) 노출 | 불필요 |
| `/community/[category]/[id]` | 게시글 상세 — 본문 인아티클 광고, CPS 상품 링크, 쿠팡 검색 위젯; 모바일 스티키 광고 **숨김** | 불필요 |
| 매거진·일자리 목록/상세 | 피드 인피드 광고, 인아티클 광고 | 불필요 |
| 전체 페이지 | 모바일 하단 스티키 광고(스크롤 300px 이후 노출, 게시글 상세 제외) | 불필요 |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `POST` | `/api/ad-click` | AdBanner 클릭 수 증가 (`clicks +1`) | 불필요 |
| `GET` | `/api/popups?path={경로}` | 현재 경로에 해당하는 활성 팝업 목록 반환 | 불필요 |
| `POST` | `/api/popups` | 팝업 노출(`impression`) 또는 클릭(`click`) 이벤트 기록 | 불필요 (IP 기반 Rate Limit) |

---

## 데이터 모델 (주요 필드)

### AdBanner (Prisma — 코드에서 추론)
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `slot` | AdSlot (enum) | 광고 슬롯 위치 |
| `adType` | Enum (`GOOGLE`, `COUPANG`, `SELF`, `EXTERNAL`) | 광고 유형 |
| `title` | String? | 광고 제목 (텍스트 폴백용) |
| `imageUrl` | String? | 자체/외부 광고 이미지 URL |
| `clickUrl` | String? | 클릭 시 이동 URL |
| `htmlCode` | String? | Google/쿠팡 HTML 삽입 코드 |
| `isActive` | Boolean | 활성 여부 |
| `startDate` | DateTime | 노출 시작일 |
| `endDate` | DateTime | 노출 종료일 |
| `priority` | Int | 우선순위 (높을수록 먼저 선택) |
| `impressions` | Int | 누적 노출 수 |
| `clicks` | Int | 누적 클릭 수 |

### Banner (DB 스키마 직접 정의)
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `title` | String | 배너 제목 |
| `description` | String? | 설명 |
| `imageUrl` | String | 이미지 URL |
| `linkUrl` | String? | 클릭 링크 |
| `startDate` / `endDate` | DateTime | 노출 기간 |
| `priority` | Int | 우선순위 |
| `isActive` | Boolean | 활성 여부 |

### Popup (DB 스키마 직접 정의)
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `type` | PopupType (enum) | 팝업 유형 |
| `target` | PopupTarget (enum, default: ALL) | 노출 대상 |
| `targetPaths` | String[] | 노출 경로 배열 |
| `title` / `content` / `imageUrl` / `linkUrl` / `buttonText` | String? | 콘텐츠 필드 |
| `startDate` / `endDate` | DateTime | 노출 기간 |
| `priority` | Int | 우선순위 |
| `isActive` | Boolean | 활성 여부 |
| `showOncePerDay` | Boolean | 하루 1회 표시 여부 |
| `hideForDays` | Int? | N일간 숨김 설정 |
| `impressions` / `clicks` | Int | 노출·클릭 집계 |

### CpsLink (DB 스키마 직접 정의)
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | String (cuid) | PK |
| `postId` | String | 연관 게시글 FK |
| `productName` | String | 상품명 |
| `productUrl` | String | 쿠팡 상품 URL |
| `productImageUrl` | String? | 상품 이미지 URL |
| `rating` | Float? | 상품 평점 (별점 렌더링용) |

---

## 핵심 비즈니스 로직

### 광고 슬롯 선택 (`AdSlot` 서버 컴포넌트)
- `isActive = true`, `startDate ≤ now ≤ endDate` 조건으로 활성 광고 필터
- `priority DESC` 기준으로 1건만 선택
- 선택된 광고의 `impressions` 즉시 +1 (fire-and-forget, 실패 무시)
- `adType`에 따른 렌더링 분기:
  - `GOOGLE` / `COUPANG` → `htmlCode` 직접 삽입 (`dangerouslySetInnerHTML`)
  - `SELF` / `EXTERNAL` → `imageUrl`이 있으면 이미지 링크, 없으면 텍스트 링크

### AdSense 동적 로드 (`AdSenseUnit`)
- SPA 라우트 전환 시 `pathname` 변경 감지 → 기존 `<ins>` 태그 제거 후 재생성
- `MutationObserver`로 `data-ad-status` 감시 → `"unfilled"` 시 쿠팡 배너로 폴백
- `adsbygoogle.push({})` 실패(스크립트 미로드) 시 예외 무시

### 쿠팡 배너 로테이션 (`CoupangBanner`)
- `CATEGORY_FRESH` / `CATEGORY_KITCHEN` 2종을 UTC 기준 날짜(`getUTCDate() % 2`)로 일별 자동 교체
- 서버 컴포넌트로 구현 → hydration mismatch 방지

### 모바일 스티키 광고 (`MobileStickyAd`)
- 스크롤 300px 초과 시 등장, 300px 이하 시 숨김
- 닫기 버튼 클릭 → 세션 내 `dismissed` 상태로 영구 숨김 (새로고침 시 리셋)
- 경로 정규식 `/^\/community\/[^/]+\/[^/]+$/` 매칭 시 게시글 상세로 판단, 표시 안 함
- `lg` 이상 데스크탑에서 CSS로 숨김

### 팝업 이벤트 (`/api/popups`)
- IP 기반 Rate Limit: 분당 30회 초과 시 `429` 반환
- `event` 값은 `"impression"` / `"click"` 두 가지만 허용, 그 외 `400`
- `popupId` DB 존재 여부 검증 후 카운터 증가
- `GET` 요청 시 `path` 파라미터로 경로 필터링된 활성 팝업 목록 반환

### CPS 클릭 추적 (`CoupangCPS` + `CpsClickTracker`)
- 게시글에 연결된 CPS 링크 최대 3건 최신순 표시
- 클릭 시 GTM 이벤트(`gtmCpsClick`) 전송 (서버 측 카운터 증가 없음)
- 별점은 `Math.round(rating)` 기준 ★/☆ 문자로 렌더링

### AdBanner 클릭 추적 (`AdClickTracker` + `/api/ad-click`)
- 클릭 시 GTM 이벤트(`gtmAdClick`) 전송 + `/api/ad-click` 비동기 호출 (실패 무시)
- API에서 `adId`로 `AdBanner.clicks +1`

### 반응형 광고 분기 (`ResponsiveAd`)
- `useIsDesktop()` 훅 대신 CSS `block lg:hidden` / `hidden lg:block`으로 분기
- 양쪽 모두 SSR 렌더링 → hydration mismatch 방지

---

## UI 컴포넌트

| 컴포넌트 | 유형 | 역할 |
|----------|------|------|
| `AdSenseUnit` | Client | Google AdSense `<ins>` 태그 동적 생성·관리; unfilled 시 쿠팡 폴백 |
| `AdSlot` | Server | DB 기반 AdBanner 조회 및 adType별 렌더링 |
| `AdClickTracker` | Client | 자식 요소 클릭 시 GTM 이벤트 + `/api/ad-click` 호출 래퍼 |
| `CoupangBanner` | Server | 쿠팡 카테고리 배너 일별 로테이션 (320×100, 300×100) |
| `CoupangCategoryB