# M05 — 거울 보드 (Mirror Board)

> 운영 현황을 **손 갱신 없이** git/CI/HTTP 실측으로 비추는 로컬 운영 도구.

- **상태**: ACTIVE (1단계)
- **추가일**: 2026-06-04
- **충족욕망**: INFRA / **타겟**: —(운영용)
- **코드 위치**: `scripts/ops-board/` + `.claude/commands/board.md`
- **트리거**: 로컬 수동 — `/board`(텍스트 5분류) / `npm run board`(웹 칸반)

## 목적 / 배경

손으로 갱신하는 운영 문서(MD/HTML)는 반드시 썩는다(drift). AI가 낡은 문서를 사실로 믿고 중복 작업·버그를 양산해 왔다(예: `OPERATING_BACKLOG.md`가 06-02 기준인데 실제는 06-04). 거울 보드는 보드를 "AI가 쓰는 문서"가 아니라 **"git·CI·HTTP를 조회해 자동 판정하는 거울"**로 만든다. 주장이 아니라 증명이므로 안 썩는다.

## 구조

```
.claude/commands/board.md      # /board 슬래시 — cli 실행 후 5분류 보고
scripts/ops-board/
  cli.ts                       # /board 진입점 (5분류 텍스트)
  server.ts                    # 웹 칸반 (SSE, 127.0.0.1:4321 only)
  engine/evaluator.ts          # evaluateBoardState() ★단일 진입점 (슬래시·웹 공유)
  engine/scheduler.ts          # 주기 실행 + 캐시 + 변경시만 SSE push + 중복실행 skip
  probes/{git,ci,http}-probe.ts# read-only probe (DB 없음)
  cards/cards.ts               # 1단계 카드 5개 정의 + decide()
  public/index.html, board.js  # 4컬럼 칸반 UI
  tsconfig.json                # board:check 전용 (root는 scripts/ exclude)
```

## 핵심 설계 (drift 방지 3층 staleness)

1. **데이터 신선도**: 각 ProbeResult `checkedAt`
2. **판정불가 구분**: probe 실패 = `ok:null`(회색), **절대 false(미완료)로 안 떨굼**
3. **probe 메타-staleness**: 카드 `probeReviewedAt` 90일 초과 시 "🔍 판정로직 재검토" — *틀린 GREEN* 방어

## 사용법

| 보는 것 | 방법 |
|---------|------|
| 5분류 텍스트 | Claude Code에서 `/board` |
| 실시간 칸반 | `npm run board` → http://127.0.0.1:4321 |
| 타입 검사 | `npm run board:check` |

## 1단계 범위 / 제약

- **DB probe 없음** (prisma/DATABASE_URL 접근 금지). DB proof 필요 카드는 REVIEW에서 멈춤.
- 메인 `src/` 침투 0. 의존성 추가 0(SSE는 node 내장).
- server는 `127.0.0.1` only bind. SSE payload에 token/env/DB URL 미노출(detail 화이트리스트).
- 1단계 카드 5개: MAGAZINE/JOB 차단 · SHEET v1.5 · EventLog v1 · Agent DB 포화 · 속도/캐시.

## 다음 단계 (2단계)

- Supabase **read-only DB role** 발급 → `OPS_BOARD_READONLY_URL` → db-probe 추가 → DB proof 카드 DONE까지.
- 3단계: manual-check append 로그, DOING 근사(open PR), 백로그 단방향 링크, DONE+90일 자동 ARCHIVE.

## 수정 이력

| 날짜 | 변경 | 이유 |
|------|------|------|
| 2026-06-04 | 1단계 신규 (git/CI/HTTP probe + /board + 웹 칸반) | 손 갱신 문서 drift 구조적 제거 |
