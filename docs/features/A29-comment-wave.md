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
  ├─ enqueueCommentWave() — prisma.commentWaveQueue.create() 직접 호출
  │   └─ CommentWaveQueue 생성 (wave1~4 타임스탬프 + 60h TTL)
  │   ※ /api/internal/comment-wave route 존재하나 현재 미사용
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
| 큐 등록 | content-curator.ts `main()` → `enqueueCommentWave()` → prisma 직접 (API 미사용) |
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
✅ content-curator.ts → main()에서 enqueueCommentWave() 호출 (DB 직접 쓰기, API 미사용)

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
| 2026-05-20 | topComments 직접 달기 — refComment 10자 이상이면 AI 거치지 않고 원문 그대로 달기, 없으면 AI fallback | "큐레이션 댓글은 크롤된 topComments 그대로 달아라" 창업자 최종 지시 |
| 2026-05-18 | P4: processWave()에 prisma.comment.groupBy로 봇 당일 댓글 수 집계 → BOT_DAILY_COMMENT_CAP=3 초과 봇 제외 후 셔플 풀에서 우선 선택. P5: WAVE_COMMENT_TYPES wave4 응원형→다른관점형 교체. generateComment 양쪽 프롬프트에 "화이팅/응원합니다/좋은 정보 감사합니다" 금지 추가 | 5/18 분석: 손뜨개 6개·체력왕 5개 반복 등장, wave4 전부 "화이팅!" 획일화 문제 수정 |
| 2026-05-22 | wave-processor.ts v2 path에 `replaceCafeReferences()` 적용 — sourceCandidates 텍스트·topCommentByContent 키·authorReply 저장값 3곳 치환 기준 통일 (dedup 일관성 보장). CafePost 원본 미변경, legacy path 동결 유지 | 봇 댓글/대댓글에 카페 원본 명칭 노출 차단 |
| 2026-05-19 | ⑦ wave-processor.ts: `remapWaveType(waveNum, viralType)` 함수 추가 — BETRAYAL[4,1,3,2]/INJUSTICE[2,4,1,3]/CONTROVERSY[2,4,3,1]/REVERSAL[3,1,2,4]/EMPATHY[1,3,2,4]/null=기본순서. CafePost select에 viralType 추가, processWave 내 effectiveWaveNum으로 generateComment 호출 | viralType별 글 감정 구조에 맞게 첫 댓글 유형 동적 조정 (psych-analyzer 저장 데이터 실사용) |
| 2026-05-20 | `processAuthorReply()` 신규 추가 — wave4 완료 후 authorPersonaId(글 작성자 페르소나)가 첫 봇 댓글에 parentId 대댓글 달기. topComments.replies 원문 우선, 없으면 AUTHOR_REPLY_POOL 랜덤(AI 호출 없음). main()에서 wave4Done=true 큐 대상 자동 실행 | 글 작성자가 댓글에 답하는 자연스러운 상호작용 구현 |
| 2026-05-22 | v2-E 전면 개편 — KILLER/HOT/NORMAL tier별 wave count(15/8~11/5), content dedup(usedContentSet), 1:1 대댓글 매핑(flatMap 제거), normalExit flag 패턴, processWaveLegacy·processAuthorReplyLegacy 분리. kill switch(COMMENT_WAVE_V2_ENABLED+V2_LAUNCH_DATE). agents-cafe-wave.yml env 2줄 추가 | 모든 글에 댓글 1개/wave 고정·AI fallback·대댓글 flatMap·봇 중복 4가지 문제 해결 |
| 2026-05-23 | 4개 함수(processWaveLegacy·Legacy대댓글·V2·V2대댓글)에 lastEngagedAt + trendingScore 즉시 갱신 추가 — agents/core/post-trending.ts refreshPostTrendingScore() 신규 생성, 루프 종료 후 1회 await | BOT wave 댓글 후 trendingScore 재계산 없어 홈 순위 미반영되던 문제 해결 |
| 2026-05-24 | BOT_CAP 초과 방지(processAuthorRepliesV2 globalCap check + processWaveLegacy getGlobalCap), source-copy 이모지 제거(removeEmoji), BOARD_PERSONAS strict whitelist → HUMOR_ONLY 제외 정책으로 보정 (persona-data board:'HUMOR' 7종 제외, STORY/LIFE2 후보 3→67명, JOB AS/D 유지) | Daily QA: NORMAL CAP 초과·이모지·페르소나 위반 3건 수정 |
| 2026-05-24 | 댓글 부족 CafePost wave 정책: title-only AI generateComment 완전 제거(관련 함수·상수·import 일괄 삭제), usableTopComments=0이면 content-curator에서 queue 생성 생략, processWaveLegacy에 BLOCK1(title-only 차단)+BLOCK2(최대 usable 수 한도) 추가, usable<5이면 author reply(processAuthorRepliesV2·Legacy·post-wave4 루프) 전체 스킵 | 원본 댓글 없는 글에 title-only AI 댓글 9개 생성되던 문제(commentCount=0 CafePost) 구조적 차단 |
