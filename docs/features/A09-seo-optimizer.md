# SEO 최적화 운영 기획서 (A09)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## ⚠️ 현재 상태 요약

| 구성요소 | 상태 | 비고 |
|---------|------|------|
| Google Indexing API | ✅ 작동 중 | 매거진 발행 시 자동 호출 |
| Sitemap | ✅ 작동 중 | `/sitemap.xml` 동적 생성 |
| SEO 모니터링 에이전트 | ❌ 미운영 | 코드 준비됨, 크론 미연결 |
| Canonical 태그 | ⚠️ 부분 운영 | 정적 페이지만 완료 |
| Core Web Vitals 모니터링 | ❌ 없음 | 5월 개선 예정 |

**→ 개선 계획: 2026-05 말일 진행 예정**

---

## 목표

트렌드 키워드 기반 SEO 최적화 주간 리포트 자동화 +  
신규 콘텐츠 발행 즉시 Google 인덱싱 요청으로  
50~60대 유입 검색 트래픽을 지속적으로 늘린다.

---

## 배경

- 매거진/커뮤니티 콘텐츠는 SEO 트래픽 주요 채널
- AI 생성 콘텐츠는 메타데이터 누락 위험 → 주기적 감사 필요
- Google Indexing API로 크롤링 대기 없이 즉시 인덱싱 요청 가능
- `seo-optimizer.ts`는 구현 완료됐으나 자동 스케줄 미연결 상태

---

## 세부 기획

### 구성요소별 상세

#### A. SEO 모니터링 에이전트 (현재 미운영)

**파일**: `agents/cmo/seo-optimizer.ts`

**3가지 기능:**
1. `getRecentKeywords()` — 지난 7일 CafeTrend 키워드 빈도 집계 (상위 20개)
2. `checkMetaCoverage()` — 최근 1주 게시물 summary/thumbnail 누락 집계
3. `generateSeoRecommendations()` — Claude Haiku로 SEO 제안 생성
   - 롱테일 키워드 5개
   - 매거진 제목 아이디어 3개
   - 메타 디스크립션 키워드 조합

**runner.ts 등록**: ✅ (`cmo:seo-optimizer`)  
**GHA 크론 연결**: ❌ (agents-social.yml에 `workflow_dispatch` 수동만 등록, 자동 크론 없음)

---

#### B. Google Indexing API (작동 중)

**파일**: `agents/cafe/indexing-api.ts`

- JWT RS256 + OAuth2 액세스 토큰 방식
- 매거진 발행 후 `magazine-generator.ts`에서 자동 호출
- 환경변수 미설정 시 graceful skip (에러 없음)
- 무료 (하루 200회 쿼터)

**환경변수**: `GOOGLE_INDEXING_CLIENT_EMAIL`, `GOOGLE_INDEXING_PRIVATE_KEY`

---

#### C. Sitemap (작동 중)

**파일**: `src/app/sitemap.ts`

- 동적 생성 (`force-dynamic`)
- 정적 페이지: 11개 (우선도 1.0~0.2)
- 동적 페이지: PUBLISHED + SEO_ONLY 게시물 최대 5000개
  - JOB: 0.9 / MAGAZINE: 0.8 / SEO_ONLY: 0.5 / 기타: 0.6

---

#### D. Canonical / 메타데이터

| 항목 | 상태 |
|------|------|
| 정적 11개 페이지 | ✅ canonical 추가됨 |
| 매거진 og:image / seoTitle / seoDescription | ✅ 자동 생성 |
| 커뮤니티 boardSlug canonical | ✅ |
| BreadcrumbList / WebSite JSON-LD | ✅ |
| Core Web Vitals 모니터링 | ❌ |

---

### 현재 운영 파이프라인 (실제 작동 부분만)

```
매거진 발행 (local-magazine-runner.ts)
  → magazine-generator.ts publishMagazine()
  → requestGoogleIndexing(postUrl)
  → Google Indexing API URL_UPDATED
  → (즉시 크롤링 요청)
```

---

### 미운영 파이프라인 (5월 개선 예정)

```
GHA 주 1회 크론 (미연결)
  → cmo:seo-optimizer 핸들러
  → getRecentKeywords() + checkMetaCoverage()
  → generateSeoRecommendations() [Claude Haiku]
  → Slack #리포트 주간 SEO 리포트
  → BotLog SEO_MONITOR
```

---

### 스케줄 / 실행 환경

| 구성요소 | 핸들러 | 현재 크론 | 목표 KST |
|---------|--------|---------|---------|
| SEO 모니터링 | `cmo:seo-optimizer` | ❌ 미연결 | 매주 월 09:00 (예정) |
| Google Indexing | 직접 호출 | 매거진 발행 시 | 자동 |

**실행 환경**: GHA ubuntu-latest, Node 20

---

### Slack 알림

| 조건 | 채널 | 내용 |
|------|------|------|
| 주간 SEO 리포트 (예정) | #리포트 | 트렌드 키워드 + 메타 누락 건수 + AI 추천 |

---

### BotLog

- `botType: 'CMO'`
- `action: 'SEO_MONITOR'`
- `status: 'SUCCESS' | 'FAILED'`

---

### 비용 영향

| 항목 | 비용 | 빈도 | 월간 |
|------|------|------|------|
| Claude Haiku (SEO 추천) | ~$0.0001/회 | 주 1회 | ~$0.0004 |
| Google Indexing API | 무료 | 매거진 발행 시 | $0 |
| **합계** | — | — | **~$0.0004** |

---

## 5월 개선 계획 (2026-05 말일 예정)

창업자 결정: 2026-04-27

**개선 항목:**
1. `agents-daily.yml`에 SEO 모니터링 크론 추가 (월 09:00 KST)
2. Core Web Vitals 모니터링 추가 (PageSpeed Insights API)
3. 신규 페이지 추가 시 canonical 자동화 (`scripts/add-canonicals.js` 통합)
4. 커뮤니티 게시물 메타데이터 자동 생성 검토

---

## 관련 링크

- SEO 에이전트: `agents/cmo/seo-optimizer.ts`
- Google Indexing: `agents/cafe/indexing-api.ts`
- Sitemap: `src/app/sitemap.ts`
- Canonical 스크립트: `scripts/add-canonicals.js`
- GHA 워크플로우: `.github/workflows/agents-social.yml` (수동 트리거만)
- Runner 핸들러: `agents/cron/runner.ts` — `cmo:seo-optimizer`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 — 현재 상태(미운영) 정확히 기록 | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04-27 | SEO 모니터링 자동 실행 안 됨 | GHA 크론 미연결 (수동 트리거만) | 2026-05 말일 개선 예정 |
