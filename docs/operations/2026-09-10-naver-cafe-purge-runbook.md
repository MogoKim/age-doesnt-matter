# 네이버 카페 유래 데이터 영구 폐기 — 실행·검증 runbook

> 실측 근거: [`2026-09-10-naver-cafe-purge-facts.md`](./2026-09-10-naver-cafe-purge-facts.md)
> 도구: `agents/scripts/purge-naver-cafe-data.ts` · 판정: `agents/purge/naver-origin-policy.ts`
> 🔴 **Codex 승인 전에는 `--execute` 를 붙이지 않는다.**

## 0. 전제

| 항목 | 값 |
|---|---|
| 접근 | Supabase REST (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |
| env 파일 | `/Users/yanadoo/Documents/unao-prod/.env.local` |
| ⚠️ `DATABASE_URL`·`DIRECT_URL` | **쓰지 않는다** — 현재 인증 실패 상태다 |
| raw SQL · RPC · migration | **금지** |
| project ref allowlist | 도구가 `PRODUCTION_PROJECT_REF` 와 다르면 즉시 중단 |

secret 값을 화면·로그·PR·문서에 남기지 않는다. 도구는 로그에 숫자와 화이트리스트 키만 출력한다.

## 1. dry-run (지금 단계)

```bash
cd /Users/yanadoo/Documents/unao-r2-naver-purge
npx tsx --env-file=/Users/yanadoo/Documents/unao-prod/.env.local \
  agents/scripts/purge-naver-cafe-data.ts
```

PASS 조건
- `baseline` 로그의 수치가 `EXPECTED` 와 일치
- `plan` 6줄이 출력되고 `dry-run-end ok:true`
- **write 요청 0** (도구는 dry-run 에서 mutate 를 호출하면 스스로 예외를 던진다)
- 2회 연속 실행 시 **동일 대상·동일 수치**
- 실행 전후 exact count 동일

## 2. 실행 (Codex 승인 후에만)

```bash
cd /Users/yanadoo/Documents/unao-r2-naver-purge
npx tsx --env-file=/Users/yanadoo/Documents/unao-prod/.env.local \
  agents/scripts/purge-naver-cafe-data.ts \
  --execute --confirm=PURGE-<production-project-ref>
```

`--execute` 와 `--confirm` **둘 다** 있어야 write 한다. 토큰이 틀리면 write 없이 중단한다.

## 3. 실행 순서와 중단 조건

| 단계 | 작업 | 대상 | 중단 조건 |
|---|---|---:|---|
| 사전 | 대상 판정 + 기준선 확인 | – | 후보에 USER Post 1건이라도 → 중단 · 기준 건수 범위 밖 → 중단 (**둘 다 write 전**) |
| **S1** | tombstone 글의 **봇 댓글** 삭제 | 1,765 | HTTP 오류 시 그 배치에서 정지 (앞 배치는 이미 반영, 재실행하면 남은 것만) |
| **S2** | tombstone 글 콘텐츠 필드 제거 | 226 | 동일 |
| **S3** | 나머지 네이버 유래 글 hard delete | 7,223 | `Report` FK `Restrict` 로 거부되면 그 배치 정지 → 해당 글을 tombstone 으로 재판정 |
| **S4** | `CommentWaveQueue` 전량 삭제 | 276 | 동일 |
| **S5** | `CafeTrend` 전량 삭제 | 191 | 동일 |
| **S6** | `CafePost` 전량 삭제 | 33,031 | 동일 |
| 사후 | 재판정 후 잔량 로그 | – | – |

**멱등성**: 모든 단계가 매 실행 라이브 데이터에서 대상을 다시 구한다. 중간에 죽어도 다시 돌리면 남은 것만 처리하고 범위가 넓어지지 않는다.

## 4. 삭제 후 검증표

| # | 확인 | 방법 | PASS |
|---|---|---|---|
| 1 | 네이버 유래 Post 0 | `Post?<NAVER_ORIGIN_FILTER>` count | **0** |
| 2 | tombstone 원문 잔존 0 | 226건에 `isTombstoned()` | 전건 true |
| 3 | `CafePost` 0 | count | **0** |
| 4 | `CafeTrend` 0 | count | **0** |
| 5 | `CommentWaveQueue` 0 | count | **0** |
| 6 | 실회원 댓글 보존 | tombstone 글의 실회원 댓글 count | **75** |
| 7 | 게스트/탈퇴 댓글 보존 | `authorId` NULL count | **56** |
| 8 | GuestLike 보존 | count | **111** |
| 9 | Report 보존 | count | **1** |
| 10 | USER Post 무변경 | 공개 USER count | **73** |
| 11 | 공개 URL 변화 없음 | sitemap URL 수 | **854** (네이버 유래는 전량 비공개였다) |
| 12 | health | `/api/health` · `/api/health/auth` | 200 |
| 13 | 홈 | `/` | 200 |
| 14 | Slack `/trend` | CafeTrend 없음 경로 | 문구 반환, 오류 없음 |

## 5. 백업 복원 시 재적용 (중요)

PITR 은 비활성이고 **daily backup 은 남아 있다.** 폐기 이후 백업으로 복원하면 **지운 데이터가 되살아난다.**

1. 복원 직후 이 도구를 **같은 커밋으로** 다시 실행한다.
2. 백업 보존 기간이 지나기 전까지는 "백업에도 없음"을 주장하지 않는다.
3. 보존 기간·만료일은 창업자가 Supabase 콘솔에서 확인해 이 문서에 기록한다.

## 6. 일회성 — 실행 후 제거

폐기가 끝나고 검증표가 전부 PASS 하면 **별도 PR** 로 아래를 지운다.

- `agents/scripts/purge-naver-cafe-data.ts`
- `agents/scripts/purge-naver-cafe-data.test.ts`
- `agents/purge/`

두 문서(`*-facts.md` · 이 runbook)는 **감사 증빙으로 보존**한다.
