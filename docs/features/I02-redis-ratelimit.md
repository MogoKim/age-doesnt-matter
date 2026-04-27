# Upstash Redis 레이트리밋 운영 기획서 (I02)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

분산 서버 환경(Vercel 멀티 인스턴스)에서 API 요청 남용을 방지하고  
Upstash Redis 장애 시에도 인메모리 폴백으로 무중단 서비스를 보장한다.

---

## 배경

- Vercel 멀티 인스턴스 환경 → 서버별 인메모리만으로는 제한이 분산되어 무효화
- 2026-04 FIX-11: "인메모리 레이트리밋 분산 환경 무효화 (Critical)" → Upstash Redis로 수정 완료
- Upstash Redis는 HTTP 기반 → Vercel Edge/Serverless 환경에서도 사용 가능

---

## 세부 기획

### 라이브러리

- `@upstash/ratelimit` ^2.0.8
- `@upstash/redis` ^1.37.0
- Dynamic import로 환경변수 미설정 시 로드 방지

---

### 이중 구조 (Upstash + 인메모리 폴백)

```
요청 도착
  ↓
UPSTASH_REDIS_REST_URL 설정됨?
  ├─ YES → rateLimitDistributed() → Upstash Redis 호출 (300ms 타임아웃)
  │          ├─ 성공: 분산 제한 적용
  │          └─ 타임아웃/실패: catch → 인메모리 폴백
  └─ NO  → rateLimit() 직접 (인메모리)
  ↓
초과 시: 429 + Retry-After 헤더
```

---

### 알고리즘

**Sliding Window** — 윈도우 시간 동안 실시간 요청 수 추적

---

### API별 제한 설정 (14개 엔드포인트)

| 엔드포인트 | max | window | 방식 |
|-----------|-----|--------|------|
| `/api/posts` | 60 | 1분 | 분산 |
| `/api/jobs` | 60 | 1분 | 분산 |
| `/api/best` | 60 | 1분 | 분산 |
| `/api/magazine` | 60 | 1분 | 분산 |
| `/api/comments` | 60 | 1분 | 분산 |
| `/api/notifications` | 30 | 1분 | 분산 |
| `/api/notifications/unread-count` | 30 | 1분 | 분산 |
| `/api/push/subscribe` | 10 | 1분 | 분산 |
| `/api/search` | 30 | 1분 | 인메모리 |
| `/api/uploads` | 10 | 1분 | 인메모리 |
| `/api/uploads/presign` | 10 | 1분 | 인메모리 |
| `/api/uploads/video` | 5 | 1분 | 인메모리 |
| `/api/events` | 30 | 1분 | 인메모리 |
| `/api/popups` | 30 | 1분 | 인메모리 |

---

### 429 응답 형식

```json
{ "error": "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }
```
- 헤더: `Retry-After: {초}` (resetAt 기준)

---

### IP 추출 방식 (스푸핑 방지)

1. `x-real-ip` (Vercel 신뢰 헤더) 우선
2. `x-forwarded-for` 마지막 IP (proxy 체인 우측)
3. `anonymous` fallback

---

### 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `UPSTASH_REDIS_REST_URL` | 필수 | Upstash Redis HTTP URL |
| `UPSTASH_REDIS_REST_TOKEN` | 필수 | Upstash 인증 토큰 |

미설정 시: 자동으로 인메모리 모드로 fallback (에러 없음)

---

### Redis 키 네임스페이싱

- Prefix: `unao:rl:{endpoint}:{ip}`
- `analytics: false` (Free 플랜 저장소 절감)

---

### 비용 영향

| 항목 | 비용 |
|------|------|
| Upstash Free 플랜 | 월 100만 요청 무료 |
| 초과 시 | 유료 플랜 검토 필요 |

---

## 현재 운영 상태

✅ 프로덕션 완전 작동 (Vercel + Upstash Redis)  
✅ 로컬 개발: .env.local에 설정됨  
✅ Upstash 장애 시 인메모리 자동 폴백

---

## 관련 링크

- 핵심 구현: `src/lib/rate-limit.ts`
- API 래퍼: `src/lib/api-rate-limit.ts`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04-08 | 분산 환경에서 제한 무효화 (Critical) | Vercel 멀티 인스턴스별 인메모리 분산 | Upstash Redis 분산 레이트리밋으로 수정 |
| 2026-04-23 | IP 스푸핑 취약점 | x-forwarded-for 첫 번째 IP 신뢰 | 마지막 IP 추출 + x-real-ip 우선으로 수정 |
