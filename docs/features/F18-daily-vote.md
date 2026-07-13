# F18 — 오늘의 투표 (참여형 이벤트 MVP)

> 상태: ACTIVE · 등록: 2026-07-13 · 기획: docs/제안서-참여형-이벤트-리텐션-2026-07-10.html · 목업: mockup/day1-vote-simulation.html

## 개요

리텐션 개선용 참여형 이벤트의 1단계(파일럿 MVP). 하루 1개 A/B 밸런스 투표를 홈 HERO 배너와 연동 게시글에 노출하고, 비회원 포함 탭 1번으로 투표 → 실시간 % 공개 → 댓글 진영 배지로 수다 유도. 실 회원이 극소수인 Stage 0에서는 어드민 통제판으로 seed 표수·봇 댓글을 수동 운영(판깔기)한다.

## 동작 규칙

- **하루 1투표**: `VoteEvent.date`(KST 기준, `getKstToday()` 경유) unique. 시의성 있는 날 당일 오픈.
- **자동 마감**: 당일 KST 20:00 이후 public은 무조건 CLOSED (`src/lib/vote-status.ts` — 크론 없음, 읽기 시점 계산). 어드민 수동 CLOSED는 즉시 조기 마감.
- **표시 표수 = seedCountA/B + 실 표(USER/GUEST)** — BOT ballot은 댓글 진영 배지 전용, 표시/실측 어디에도 불포함.
- **비회원 투표**: GuestLike 패턴 복제 (cookieId `guest_vote_id` 1년 + ipHash SHA-256). 마감 전 선택 변경 가능.
- **실측 분리**: 어드민 실측 카드(실 회원 표·게스트 표·실 댓글(봇 제외)·투표 경유 가입)는 조작 수치와 절대 분리.

## 코드 위치

| 구분 | 파일 |
|---|---|
| 도메인/집계 | `src/lib/votes.ts`, `src/lib/vote-status.ts` (+ `src/__tests__/vote-close-rule.test.ts`) |
| API | `src/app/api/votes/today` (GET 현황) · `[id]` (POST 투표) · `badges` (GET 댓글 배지 맵) |
| 위젯 | `src/components/features/vote/VoteWidget.tsx` (banner/post 공용, 15초 refetch) |
| 노출 | `HeroSlider.tsx` 분기(오늘 투표 시 슬라이더 대체) · 글상세 `[postId]/page.tsx` 위젯 삽입 · `CommentSection/CommentItem` 진영 배지 |
| 어드민 | `src/app/admin/(panel)/vote-events/` + `src/components/admin/VoteEventManager.tsx` |
| AI 초안 | `src/lib/ai/vote-draft.ts` — `generateVoteDraftBatch()` **CLAUDE_MODEL_LIGHT(haiku) 전용 하드 가드**, 어드민 클릭 1회=API 1회, 실패 시 직접 입력 등록 무관 |
| DB | `VoteEvent`, `VoteBallot`(voterType USER/GUEST/BOT) — RLS enabled |

## 운영 (어드민 /admin/vote-events)

오늘 투표 생성·수정(질문/A/B/linkedPostId) → seed ±·표시 조회수 → OPEN/CLOSED 토글 → 봇 댓글 다중 row(최대 5) 등록: 페르소나(@unao.bot 계정) 선택 + [AI 초안 받기] + 수정 후 일괄 등록 (배지용 BOT ballot upsert 동반).

## 비용

AI 초안: haiku(CLAUDE_MODEL_LIGHT) 버튼 클릭당 1회, max_tokens 800 — 회당 ~$0.001 수준. 자동 호출 없음.

## 환경변수

- `ANTHROPIC_API_KEY` + `CLAUDE_MODEL_LIGHT=claude-haiku-4-5` (Vercel — AI 초안용. 없으면 초안 버튼만 실패, 직접 입력 정상)

## 수정 히스토리

| 날짜 | 내용 | 이유 |
|---|---|---|
| 2026-07-13 | MVP 최초 구현 (모델 2·API 3·위젯·어드민·봇 댓글 AI 초안) | 2주 파일럿 Day 1 |
| 2026-07-13 | 20:00 KST 자동 마감 규칙 추가 (vote-status.ts, 크론 없음) | 하루 1투표 사이클 |
| 2026-07-13 | CommentItem memo 비교자에 campBadges 누락 수정 | QA 9번에서 배지 미렌더 발견 |

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|---|---|---|---|
| 2026-07-13 | dev 모드에서 댓글 배지 미렌더 | ① memo 비교자 campBadges 누락(실버그) ② dev/HMR 스테일 청크(아티팩트) | ①수정 ②프로덕션 빌드로 QA 전환 — 클라 컴포넌트 QA는 prod 빌드 기준 |
