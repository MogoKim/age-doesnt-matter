# F14 — 목록 광고 띠배너

> 6개 목록 페이지(베스트·사는이야기·2막준비·웃음방·매거진·내일찾기) GNB 아이콘 줄 바로 아래에 노출되는 광고 띠배너. 어드민에서 통제.

## 개요
- **충족 욕망**: MONEY (광고 수익)
- **타겟**: ALL
- **상태**: ACTIVE (2026-06-05 신규)

## 노출 위치 (6개 목록 페이지에서만)
`/best`, `/community/stories`, `/community/life2`, `/community/humor`, `/magazine`, `/jobs`
- 홈(/)·상세·글쓰기·마이·로그인 등에는 **노출 안 함** (클라 경로 게이트로 정확 매칭)
- GNB 아래 · 탭/카테고리칩/정렬 위 (콘텐츠 시작 직전)

## 동작
- 어드민에 등록된 `AdBanner`(slot=`LIST_HEADER`, 활성, 기간 내) 중 priority순 **최대 3개**를 조회
- **3개 이상이면 7초 자동 슬라이드** (`prefers-reduced-motion` 존중)
- **빈 슬롯(0개)이면 null** — 자리 자체가 사라져 첫 글이 밀리지 않음
- **사용자 닫기(X)**: 세션 동안 숨김 (`sessionStorage: list-ad-dismissed`)
- **내부/외부 링크 분기**: `clickUrl`이 `https://`면 새 탭(`rel=noopener noreferrer nofollow`), 아니면 내부 `Link`
- **이미지**: 데스크탑 기준 고화질 1장(권장 1456×180, 8:1)을 `w-full h-auto` 비율 유지 반응형. 모바일/데스크탑 이미지 분리 없음
- **HTML 광고 지원**: `htmlCode`(어드민에서 sanitize) → 추후 AdSense 등 SDK 대비
- **"광고" 라벨** 좌상단 필수

## 데이터 모델 (기존 AdBanner 재사용)
- `AdSlot` enum에 **`LIST_HEADER`** 추가
- `AdBanner`에 **`targetPath String?`** 추가 — `null`=6개 전체 공통 / `"/magazine"` 등=해당 페이지에만
- impressions/clicks/priority/startDate/endDate/isActive는 기존 필드 그대로

## 추적
- **노출**: 클라가 실제 표시 시 `POST /api/ad-impression` (IP 60초 쿨다운) → `impressions++`
- **클릭**: `POST /api/ad-click` (기존) + `gtmAdClick('LIST_HEADER', adType)` GA4
- 어드민 AdBannerTable에서 노출/클릭/CTR 확인 (기존 통계 재사용)

## 코드 위치
- 프론트: `src/components/ad/ListBanner.tsx`(서버 fetch) + `ListBannerClient.tsx`(클라 게이트·슬라이드·닫기·링크·추적)
- 삽입: `src/components/layouts/MainLayout.tsx` (GNB/IconMenu 아래, `<Suspense>`)
- 노출 API: `src/app/api/ad-impression/route.ts`
- 어드민: `src/components/admin/AdBannerTable.tsx` (LIST_HEADER 슬롯 + 노출위치 드롭다운 + 권장사이즈 안내) + `src/lib/actions/admin/admin.banners.ts` (targetPath)
- 어드민 경로: `/admin/banners?tab=ads`

## 어드민 운영 가이드
1. `/admin/banners` → "광고 슬롯" 탭 → "+ 광고 추가"
2. 슬롯 = **목록 상단 띠(LIST_HEADER)** 선택
3. 노출 위치 = "전체 공통(6개 목록)" 또는 특정 페이지
4. 유형 SELF(자사) / 이미지 URL(R2 업로드) / 클릭 URL(내부 또는 https://) / 기간 / 우선순위
5. 최대 3개까지 등록하면 자동 슬라이드

## 수정 히스토리
| 날짜 | 변경 내용 | 이유 |
|------|----------|------|
| 2026-06-05 | 신규 생성 — 6개 목록 GNB 아래 띠배너 + AdBanner LIST_HEADER 슬롯/targetPath + 노출 API + 어드민 확장 | 광고 영역 확보 + 어드민 통제 (현재 자사 배너, 추후 유료광고) |
| 2026-06-05 | 어드민 광고 폼에 이미지 파일 업로드 버튼 추가(R2 presign) + 미리보기 | URL 직접 입력 불편 해소 — 운영자가 사진만 선택하면 자동 업로드 |
| 2026-06-05 | 슬롯 드롭다운을 동작 2개(목록 상단 띠·홈 인라인)만 노출 + 구글/쿠팡 유형 HTML 입력칸 추가 | 유령 슬롯 6개(소비 코드 없음) 운영 혼란 제거 + 구글/쿠팡 등록 가능화 |

## 주의사항
- 데이터 계층은 기존 AdBanner 재사용 — 기존 HOME_INLINE/HeroSlider/TopPromoBanner 무영향
- 외부 광고 이미지/SDK 도입 시 `next.config.js` CSP(img-src/script-src) + remotePatterns 도메인 추가 필요 (현재 자사 R2는 이미 허용)
- DB 마이그레이션은 prisma migrate 미사용 — pg 직접 ALTER(`ADD VALUE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) + information_schema 검증 방식
