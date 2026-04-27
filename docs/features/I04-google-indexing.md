# Google Indexing API 운영 기획서 (I04)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

매거진 발행 즉시 Google에 인덱싱을 요청해  
크롤링 대기 없이 신속하게 검색 노출을 확보한다.

---

## 배경

- 일반 Sitemap은 Google 크롤러가 주기적으로 확인 → 색인 반영까지 수일 소요
- Google Indexing API로 발행 즉시 크롤링 요청 → 수 시간 내 색인 가능
- 무료 (일 200회 쿼터), JWT RS256 인증 (외부 라이브러리 불필요)

---

## 세부 기획

### 인증 방식

**JWT RS256 + OAuth2 (Node.js crypto 모듈)**

```
서비스 계정 PEM 키
  → createJwt(clientEmail, privateKey)  [RSA-SHA256]
  → https://oauth2.googleapis.com/token
  → Bearer 액세스 토큰 (1시간 유효)
  → Google Indexing API 호출 (URL_UPDATED)
```

외부 라이브러리 불필요 — Node.js 내장 `crypto`만 사용

---

### 인덱싱 대상

**매거진만** (커뮤니티/일자리 제외)

- URL 패턴: `https://www.age-doesnt-matter.com/magazine/{slug}`
- slug: 한글 제목 → 알파벳/숫자/하이픈 필터링 (최대 50자)

---

### 실행 파이프라인

```
매거진 발행 (local-magazine-runner.ts → magazine-generator.ts)
  ↓
publishMagazine() — DB post 생성 완료
  ↓
requestGoogleIndexing(postUrl)  [비동기, non-blocking]
  ├─ 환경변수 미설정 → console.warn + return (graceful skip)
  └─ 성공 → console.log
     실패 → .catch() warn 처리 (무시, 발행 중단 없음)
  ↓
이후 CPS 매칭, 썸네일 생성 등 계속 진행
```

---

### 트리거 시점

| 환경 | 트리거 | 상태 |
|------|--------|------|
| 로컬 Mac (launchd) | 매거진 발행 즉시 | ✅ 작동 중 |
| GHA | 매거진 크론 비활성 (로컬 이관) | ❌ 해당없음 |

---

### 할당량 / 제한

| 항목 | 값 |
|------|-----|
| 일일 쿼터 | 200회 |
| 비용 | 무료 |
| 재시도 | ❌ 없음 (실패 시 무시) |
| BotLog 기록 | ❌ 없음 (별도 로그 미기록) |

---

### 환경변수

| 변수 | 필수 | 저장 위치 |
|------|------|---------|
| `GOOGLE_INDEXING_CLIENT_EMAIL` | 필수 | GHA Secret + 로컬 .env.local |
| `GOOGLE_INDEXING_PRIVATE_KEY` | 필수 | GHA Secret + 로컬 .env.local |

미설정 시: `console.warn` + graceful skip (에러 없음, 발행 중단 없음)

---

### Sitemap과의 관계

| 구성 | 역할 |
|------|------|
| `src/app/sitemap.ts` | 정적/동적 페이지 목록 (force-dynamic, 최대 5000개) |
| Google Indexing API | 신규 발행 즉시 크롤링 요청 |

두 방식 병행: Sitemap은 기존 페이지 유지, Indexing API는 신규 발행 즉시 색인 가속

---

### 비용 영향

| 항목 | 비용 |
|------|------|
| Google Indexing API | **무료** (일 200회 쿼터) |
| OAuth2 토큰 요청 | 무료 |

---

## 현재 운영 상태

✅ 매거진 발행 시 자동 호출 작동 중  
✅ 환경변수 미설정 시 graceful skip  
⚠️ 실패 시 재시도 없음 (200회 초과 시 색인 요청 유실 가능)  
⚠️ BotLog 기록 없음 (인덱싱 성공/실패 모니터링 불가)

---

## 관련 링크

- 핵심 구현: `agents/cafe/indexing-api.ts`
- 호출 지점: `agents/cafe/magazine-generator.ts` line 551-552
- Sitemap: `src/app/sitemap.ts`
- SEO 모니터링: `docs/features/A09-seo-optimizer.md`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | 실패 시 재시도 없음 | .catch() 무시 처리 | 5월 개선 시 재시도 큐 추가 검토 |
| 진행중 | BotLog 기록 없음 | 의도적 무시 설계 | 5월 SEO 모니터링 개선 시 함께 처리 |
