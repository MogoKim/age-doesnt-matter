# 네이버 카페 유래 데이터 영구 폐기 — 실행·검증 runbook (개정 2판)

> 실측 근거: [`2026-09-10-naver-cafe-purge-facts.md`](./2026-09-10-naver-cafe-purge-facts.md)
> 도구 `agents/scripts/purge-naver-cafe-data.ts` · 판정 `agents/purge/naver-origin-policy.ts`
> 🔴 **Codex 승인 전에는 `--execute` 를 붙이지 않는다.**

## 0. 전제

| 항목 | 값 |
|---|---|
| DB 접근 | Supabase REST (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |
| R2 접근 | `CLOUDFLARE_ACCOUNT_ID` · `CLOUDFLARE_R2_ACCESS_KEY` · `CLOUDFLARE_R2_SECRET_KEY` · `CLOUDFLARE_R2_BUCKET` |
| env 파일 | `/Users/yanadoo/Documents/unao-prod/.env.local` |
| ⚠️ `DATABASE_URL`·`DIRECT_URL` | **쓰지 않는다** — 현재 인증 실패 상태다 |
| raw SQL · RPC · migration | **금지** |
| allowlist | project ref 의 SHA-256 이 다르면 즉시 중단 (평문은 저장소에 없다) |
| R2 자격증명 없음 | `--execute` 자체가 거부된다 — 외부 잔재를 못 지우면 실행하지 않는다 |

secret·project ref 평문·row ID·본문을 화면·로그·PR·문서에 남기지 않는다. 로그는 숫자와 화이트리스트 키만 출력한다.

## 1. dry-run

```bash
cd /Users/yanadoo/Documents/unao-r2-naver-purge
npx tsx --env-file=/Users/yanadoo/Documents/unao-prod/.env.local \
  agents/scripts/purge-naver-cafe-data.ts
```

PASS 조건 — `start-state` 수치가 facts 문서와 일치 · `plan` 8줄 · `dry-run-end ok:true` ·
`P0~P7` 실행 로그 **0줄** · 2회 연속 동일 · 실행 전후 exact count 동일.

## 2. 실행 (Codex 승인 후에만)

```bash
npx tsx --env-file=/Users/yanadoo/Documents/unao-prod/.env.local \
  agents/scripts/purge-naver-cafe-data.ts --execute --confirm=PURGE-<production-project-ref>
```

`--execute` 와 `--confirm` **둘 다** 있어야 write 한다.

## 3. 순서와 단계별 PASS/ABORT

순서는 **재실행 안전성**이 정한다. BotLog·R2 는 원문 제목·썸네일 URL 이 있어야 대상을 알 수 있어 글보다 먼저 지운다.
hard delete 를 tombstone 보다 먼저 해야, 남은 네이버 유래 글이 곧 tombstone 대상이라 중간에 죽어도 대상을 다시 구할 수 있다.

| 단계 | 작업 | 대상 | PASS | ABORT |
|---|---|---:|---|---|
| 사전 | 대상 판정 · 시작 상태 | – | 조회 중복 0·누락 0 | USER Post 1건이라도 포함 / 대상이 기준선보다 **증가** / 보존 대상 **감소** / 공개 네이버 유래 > 0 → **write 전 중단** |
| **P0** | BotLog 삭제 | 99,578 | `CAFE_CRAWLER` 잔량 0 | 배치 요청 수 ≠ 실제 영향 행 |
| **P1** | R2 객체 삭제 | 518키 | 삭제 후 HEAD 로 **부재 확인** | 삭제 후에도 존재 |
| **P2** | Post hard delete | 7,125 | 네이버 유래 잔량 = tombstone 대상 수 | 잔량 불일치 / RESTRICT 거부 |
| **P3** | tombstone 글의 봇 댓글 삭제 | 2,545 | 봇 댓글 잔량 0 | 잔량 > 0 |
| **P4** | tombstone | 324 | 네이버 유래 0 **그리고** 서명 글 전건 `isTombstoned=true` **그리고** 서명 수 = 324 | 하나라도 불일치 |
| **P5** | `CommentWaveQueue` | 276 | 0 | 잔량 > 0 |
| **P6** | `CafeTrend` | 191 | 0 | 잔량 > 0 |
| **P7** | `CafePost` | 33,031 | 0 | 잔량 > 0 |
| 최종 | 전수 재검증 | – | 아래 표 전부 통과해야 **`done` 출력** | 하나라도 실패 시 `done` 없이 중단 |

모든 mutation 은 `Prefer: return=representation` 으로 **실제 영향 행**을 세고, 요청 건수와 다르면 즉시 던진다. 추정하지 않는다.

## 4. 최종 검증표 (통과 전 `done` 없음)

| # | 확인 | PASS |
|---|---|---|
| 1 | 네이버 유래 Post | **0** |
| 2 | tombstone 서명 글 수 | **324**, 전건 `isTombstoned=true` |
| 3 | 네이버 유래 글의 봇 댓글 | **0** |
| 4 | `CafePost` / `CafeTrend` / `CommentWaveQueue` | 각 **0** |
| 5 | `BotLog(CAFE_CRAWLER)` | **0** |
| 6 | R2 잔존 객체 | **0** |
| 7 | 실회원 댓글 | **71** |
| 8 | `authorId` NULL 댓글 | **56** |
| 9 | GuestLike | **111** |
| 10 | Report | **1** |
| 11 | HomeCurationOverride | **139** |
| 12 | 공개 USER Post | 시작 시점과 **동일** |

배포 표면은 별도로 확인한다 — `/` 200 · sitemap URL 수 불변 · `/api/health` · `/api/health/auth` 200 ·
Slack `/trend` 는 CafeTrend 부재 시 안내 문구를 반환(정상).

## 5. 🔴 백업 복원 게이트 (자동 재적용 아님)

PITR 은 비활성이고 daily backup 은 남는다. **보존 기간·가장 오래된 복원 지점은 `backup expiry pending` 이다.**

복원할 때는 **반드시** 아래를 순서대로 한다. 자동화하지 않는다.

1. 복원 완료 직후 **서비스 공개 전에** 이 도구를 같은 커밋으로 실행한다.
2. §4 검증표를 전부 통과시킨다.
3. 통과 전에는 복원본을 production 으로 승격하지 않는다.
4. 보존 기간이 지나기 전까지 "백업에도 없음"을 주장하지 않는다.
5. 창업자가 콘솔에서 플랜·보존 기간·가장 오래된 복원 지점을 확인해 facts 문서 §6 을 갱신한다.

## 6. 재실행(resume)

같은 명령을 다시 실행하면 된다. 진행 상태는 **라이브 카운트에서 판정**하고 ID·본문·URL 을 저장하지 않는다.
checkpoint 파일(기본 `$TMPDIR/unao-naver-purge-checkpoint.json`)에는 **단계명·건수·시각만** 남는다.
끝난 단계는 `skipped=true` 로 건너뛰고, 완료 후 다시 실행하면 mutation 이 0건이다.

## 7. DB·R2 밖 잔재 (수동)

`unao-prod` 의 `agents/cafe/` 코드 사본과 `logs/cafe-crawler-*.log` 28개는 이 도구 범위가 아니다.
폐기 완료 후 창업자가 직접 정리하고 그 사실을 facts 문서에 기록한다.

## 8. 일회성 — 실행 후 제거

검증표가 전부 PASS 하면 **별도 PR** 로 `agents/scripts/purge-naver-cafe-data*.ts` 와 `agents/purge/` 를 지운다.
두 문서는 감사 증빙으로 보존한다.
