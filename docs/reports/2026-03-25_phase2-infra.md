# 작업보고서 — 2026-03-25 Phase 2 인프라 구축

## 작업 요약
Phase 2 수익/마케팅/비용최적화 인프라를 일괄 구축했습니다.

---

## 1. API 비용 최적화

### 변경 내용
| 항목 | Before | After | 절감 |
|------|--------|-------|------|
| BaseAgent 기본 토큰 | 2,048 | 1,024 | 50% |
| CEO 모닝 사이클 모델 | Sonnet (heavy) | Haiku (light) | ~80% |
| CEO 응답 토큰 | 2,048 | 512 | 75% |
| 카페 트렌드 분석 토큰 | 3,000 | 2,000 | 33% |
| CTO/CDO 실행 주기 | 매 시간 | 2시간마다 | 50% |

### 수정된 파일
- [agents/core/agent.ts](agents/core/agent.ts) — chat() maxTokens 파라미터 추가
- [agents/ceo/morning-cycle.ts](agents/ceo/morning-cycle.ts) — heavy→light, 512 토큰
- [agents/cafe/trend-analyzer.ts](agents/cafe/trend-analyzer.ts) — 3000→2000 토큰
- [.github/workflows/agents-hourly.yml](.github/workflows/agents-hourly.yml) — 2시간 주기
- [agents/cron/schedules.yaml](agents/cron/schedules.yaml) — 스케줄 동기화

### 예상 효과
- 월 API 비용: ~$26 → **~$12~15** (약 50% 절감)
- $30 크레딧으로 2달 이상 운영 가능

---

## 2. 수익 인프라 (AdSense + 쿠팡 CPS)

### 새로 만든 파일
- [src/components/ad/AdSlot.tsx](src/components/ad/AdSlot.tsx) — 광고 슬롯 서버 컴포넌트
  - DB에서 활성 광고 조회 → 렌더링
  - Google AdSense / 쿠팡 HTML 코드 지원
  - 자체/외부 이미지 광고 지원
  - 노출수 자동 카운트
- [src/components/ad/CoupangCPS.tsx](src/components/ad/CoupangCPS.tsx) — 쿠팡 상품 추천
  - 게시글에 연결된 쿠팡 상품 최대 3개 표시
  - 상품명, 이미지, 별점 표시
- [src/components/ad/AdClickTracker.tsx](src/components/ad/AdClickTracker.tsx) — 클릭 추적
- [src/app/api/ad-click/route.ts](src/app/api/ad-click/route.ts) — 클릭 카운트 API

### 수정된 파일
- [src/components/features/home/AdInline.tsx](src/components/features/home/AdInline.tsx) — placeholder → 실제 AdSlot

### 지원 광고 슬롯 (7개)
| 슬롯 | 위치 | 용도 |
|------|------|------|
| HERO | 히어로 배너 | 브랜드 광고 |
| HOME_INLINE | 홈 피드 중간 | AdSense/자체 |
| SIDEBAR | 데스크탑 사이드바 | AdSense |
| LIST_INLINE | 게시판 목록 중간 | AdSense |
| POST_BOTTOM | 게시글 하단 | AdSense/쿠팡 |
| MOBILE_STICKY | 모바일 하단 고정 | AdSense |
| MAGAZINE_CPS | 매거진 하단 | 쿠팡 CPS |

### 앞으로 달라지는 점
- 어드민 대시보드에서 광고 등록 → 즉시 사이트에 노출
- AdSense 승인 후 HTML 코드 붙여넣기만 하면 수익 시작
- 쿠팡 파트너스 가입 후 상품 URL 등록하면 CPS 수익 시작

---

## 3. 마케팅 자동화 (SNS 포스팅)

### 새로 만든 파일
- [agents/cmo/social-poster.ts](agents/cmo/social-poster.ts) — SNS 콘텐츠 생성 에이전트
  - 인기글(좋아요 3+) + 최근 매거진 → Haiku가 SNS 홍보 텍스트 생성
  - 100~150자 본문 + 해시태그 5개
  - 텔레그램으로 미리보기 전송
- [.github/workflows/agents-social.yml](.github/workflows/agents-social.yml) — 매일 15:00 KST 자동 실행

### 수정된 파일
- [agents/cron/schedules.yaml](agents/cron/schedules.yaml) — 소셜 포스터 스케줄 추가

### 앞으로 달라지는 점
- 매일 오후 3시에 자동으로 SNS 홍보 콘텐츠 생성
- 텔레그램에서 미리보기 확인 → 복사해서 Threads/X에 포스팅
- 나중에 Threads/X API 연동하면 완전 자동화 가능

---

## 4. 코드 품질

- tsc --noEmit: 0 에러
- ESLint: 0 경고, 0 에러
- next/image 사용 (img 태그 → Image 컴포넌트)

---

## 전체 파일 변경 목록

| 구분 | 파일 | 변경 |
|------|------|------|
| 신규 | src/components/ad/AdSlot.tsx | 광고 슬롯 컴포넌트 |
| 신규 | src/components/ad/CoupangCPS.tsx | 쿠팡 CPS 컴포넌트 |
| 신규 | src/components/ad/AdClickTracker.tsx | 클릭 추적 컴포넌트 |
| 신규 | src/app/api/ad-click/route.ts | 클릭 API |
| 신규 | agents/cmo/social-poster.ts | SNS 에이전트 |
| 신규 | .github/workflows/agents-social.yml | SNS 워크플로우 |
| 수정 | agents/core/agent.ts | maxTokens 파라미터 |
| 수정 | agents/ceo/morning-cycle.ts | heavy→light |
| 수정 | agents/cafe/trend-analyzer.ts | 토큰 절감 |
| 수정 | .github/workflows/agents-hourly.yml | 2시간 주기 |
| 수정 | agents/cron/schedules.yaml | 스케줄 통합 |
| 수정 | src/components/features/home/AdInline.tsx | 실제 광고 연결 |
