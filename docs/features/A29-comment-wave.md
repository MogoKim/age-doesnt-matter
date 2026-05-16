# 댓글 파동 프로세서 (A29)

> 최초 작성: 2026-05-13 | V6 P1 신규 기능

---

## 목표

큐레이션 게시글 발행 직후 **1분 이내 첫 댓글**을 자동 생성하여 알고리즘 활성 기준을 충족하고,  
이후 5분·30분·60분 간격으로 추가 댓글을 파동(wave)형태로 게시해 자연스러운 초기 인게이지먼트를 만든다.

---

## 배경

- 알고리즘 활성 기준: 첫 댓글 10분 이내 → **1분 이내로 단축**
- 기존: 큐레이션 발행 후 댓글 0건 (시드봇 랜덤 활동 의존)
- 개선: 발행 즉시 wave 큐 등록 → GHA 5분 크론이 순차 처리

---

## 아키텍처

```
content-curator.ts (발행 완료)
  │
  ├─ POST /api/internal/comment-wave
  │   └─ CommentWaveQueue 생성 (wave1~4 타임스탬프 + 60h TTL)
  │
  └─ GHA */5 * * * * — wave-processor.ts
      ├─ wave1Done=false AND wave1At ≤ now → 댓글 생성 (+1분)
      ├─ wave2Done=false AND wave2At ≤ now → 댓글 생성 (+5분)
      ├─ wave3Done=false AND wave3At ≤ now → 댓글 생성 (+30분)
      └─ wave4Done=false AND wave4At ≤ now → 댓글 생성 (+60분)
```

---

## 세부 스펙

### Wave 타이밍

| Wave | 발행 후 | 댓글 수 |
|------|--------|---------|
| wave1 | +1분 | 1건 |
| wave2 | +5분 | 1건 |
| wave3 | +30분 | 1건 |
| wave4 | +60분 | 1건 |

### 댓글 생성 규칙

- 모델: Claude Haiku (light)
- 길이: 40~80자, 순수 텍스트
- 어조: 50-60대 여성 구어체 (경어 또는 반말)
- 참고: 원본 카페 글 topComments 어조 90% 보존
- 글쓴이 페르소나 제외: `authorPersonaId ≠ commenterPersonaId`

### API

| 항목 | 내용 |
|------|------|
| 엔드포인트 | `POST /api/internal/comment-wave` |
| 인증 | `x-internal-token` 헤더 (`INTERNAL_API_TOKEN` 환경변수) |
| 요청 | `{ postId, cafePostId, authorPersonaId }` |
| 응답 | `{ id: queue.id }` 201 |

### DB 모델

```
CommentWaveQueue {
  id              String    @id @default(cuid())
  postId          String    // 우나어 게시글 ID
  cafePostId      String    // 원본 카페 글 ID (topComments 참조용)
  authorPersonaId String    // 글쓴이 페르소나 (댓글 제외 대상)
  wave1At~wave4At DateTime  // +1/5/30/60분
  wave1Done~wave4Done Boolean @default(false)
  expiresAt       DateTime  // +60h TTL (자동 정리)
}
```

---

## 실행 환경

| 구성 | 내용 |
|------|------|
| 큐 등록 | content-curator.ts → `/api/internal/comment-wave` API |
| 처리 | GHA `*/5 * * * *` → `agents/cafe/wave-processor.ts` |
| runner 등록 | `cafe_crawler:wave-process` |

---

## 비용 영향

| 항목 | 단가 | 빈도 | 월간 |
|------|------|------|------|
| Claude Haiku (댓글 생성) | $0.0008/1K input, $0.0032/1K output | 4건/글 × 9글/일 × 30일 = 1,080건 | **~$0.5/월** |
| GHA Actions (Public repo) | 무료 | `*/5` × 24h × 30일 = 8,640회 | **$0** |

---

## 운영 상태

✅ wave-processor.ts 신규 구현 완료  
✅ `/api/internal/comment-wave` API 신규 구현 완료  
✅ GHA `*/5 * * * *` wave-process job 추가 완료  
✅ runner.ts `cafe_crawler:wave-process` 등록 완료  
⏳ content-curator.ts → API 호출 연동 (enqueueCommentWave 함수 구현됨)

---

## 관련 파일

- 큐 프로세서: `agents/cafe/wave-processor.ts`
- 큐 등록 API: `src/app/api/internal/comment-wave/route.ts`
- 호출 주체: `agents/cafe/content-curator.ts` (enqueueCommentWave)
- 스케줄러: `.github/workflows/agents-cafe.yml` (wave-process job)
- runner 등록: `agents/cron/runner.ts`
- DB 모델: `prisma/schema.prisma` — `CommentWaveQueue`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-05-13 | 신규 생성 (V6 P1) | 큐레이션 발행 후 초기 인게이지먼트 자동화 |
| 2026-05-14 | agents-cafe-wave.yml 분리 — 독립 concurrency group(cafe-comment-wave) | agents-cafe.yml과 같은 그룹으로 묶여 평균 87분 1회만 실행되던 문제 해결 |
| 2026-05-14 | WAVE_COMMENT_TYPES 상수 추가(공감/질문/경험공유/응원). generateComment에 waveNum 파라미터 추가 + wave별 유형 강제. topComments 인덱스 wave 번호 기반 분산 | topComments 없을 때 3개 wave 모두 공감형 수렴하는 획일화 방지 |
| 2026-05-16 | user-post-wave-processor.ts: existingComments select에 content 추가. 루프 내 priorCommentTexts 누적 → generateComment 4번째 인자로 전달 | 동일 포스트 기존 봇 댓글 내용을 LLM에 전달하지 않아 표현 중복 수렴 발생 → inter-wave/intra-wave 모두 해결 |
