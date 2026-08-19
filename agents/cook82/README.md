# 82cook 후보 큐 (M2-7 설계 / M2-8 제한 운영)

82cook 자유게시판(`bn=15`)에서 후보를 모아 gate로 걸러내고, **창업자 승인 후에만** 기존 Sheet 발행 경로로 넘긴다.

## 왜 별도 디렉터리인가

기존 발행 로직(`external-crawler.ts` · `sheet-scraper.ts` · `content-curator.ts`) 안에 gate를 끼워 넣으면
판정과 발행이 영구히 결합되어 되돌릴 수 없다. 이 디렉터리는 **통째로 삭제해도 기존 시스템에 영향이 0**이다.

## 3레이어 — 경계는 "파일"이다

| 레이어 | 파일 | 하는 일 | 외부 write |
|---|---|---|---|
| L1 수집 | `collector.ts` | 목록에서 URL·제목·댓글수만 | 없음 |
| L2 판정 | `gate.ts` + `queue.ts` | PASS/REVIEW/REJECT 분류 | 없음 |
| — | `review.ts` | **사람이** APPROVED/HOLD/DECLINED로 전환 | 없음 |
| L3 전달 | `publish-bridge.ts` | 승인분만 Sheet append | **★ 유일** |

레이어를 함수 호출로 묶지 않고 파일로 잇는 이유는 각각 독립 교체가 가능해야 하기 때문이다.
Sheet를 걷어낼 때는 `publish-bridge.ts` 한 파일만 DB 큐 write로 바꾸면 된다.

## 실행

```bash
# L1 — 네트워크 없이 검증 (캐시)
npx tsx agents/cook82/collector.ts --from-cache --pages=10

# L1 — 라이브 (COOK82_COLLECTOR_ENABLED=true 필요)
npx tsx agents/cook82/collector.ts --pages=5

# L2 — 판정 (AI 0회, 네트워크 0)
npx tsx agents/cook82/queue.ts
npx tsx agents/cook82/queue.ts --check-sheet    # 기존 Sheet URL 중복 대조(read-only)

# 검토
npx tsx agents/cook82/review.ts                            # PASS 후보, 댓글 신호순
npx tsx agents/cook82/review.ts --status=REVIEW
npx tsx agents/cook82/review.ts --approve=cook82:15:1234 --note="사유"

# L3 — 전달 (기본 dry-run)
npx tsx agents/cook82/publish-bridge.ts                     # dry-run
npx tsx agents/cook82/publish-bridge.ts --apply --limit=1   # 첫 전달은 이 형태만 가능
npx tsx agents/cook82/publish-bridge.ts --apply             # 2회차 이후
```

승인은 쉼표로 여러 건을 한 번에 지정할 수 있다. **하나라도 문제가 있으면 전부 적용하지 않는다**
(부분 적용되면 어디까지 됐는지 되짚어야 하고, 승인은 되돌리기 어려운 동작이다).

```bash
npx tsx agents/cook82/review.ts --approve=cook82:15:111,cook82:15:222
```

## 안전장치

```
kill switch   COOK82_COLLECTOR_ENABLED   라이브 수집. 기본 미설정 = 차단
              COOK82_BRIDGE_ENABLED      Sheet 전달.  기본 미설정 = 차단
dry-run 기본  publish-bridge는 --apply 인자가 없으면 append를 호출하지 않는다.
              환경변수가 아니라 CLI 인자라서 크론에 잘못 걸려도 실행되지 않는다.
사람 게이트   APPROVED로 가는 코드 경로가 없다. review.ts로만 가능하다.
REJECT 불가역 REJECT 후보는 승인할 수 없다. 댓글 수로도 구제되지 않는다.
첫 전달 1건  이 큐가 Sheet에 보낸 적이 없으면 --apply 만으로는 거부되고 --limit=1 을 요구한다.
             (감사 로그와 큐 상태를 둘 다 보고 판정 — 한쪽이 지워져도 오판하지 않는다)
승인 원자성  다중 승인은 all-or-nothing. 하나라도 문제가 있으면 큐를 건드리지 않는다.
승인 보존     gate 재판정은 사람이 바꾼 상태를 덮어쓰지 않는다.
guardrail     제3자 범죄/의혹이 승인선을 넘으면 L3가 즉시 정지한다(유일한 자동 차단).
```

## ⚠️ M2-8 실험 전용 제한 (영구 정책 아님)

아래는 **7일 수동 실험 기간에만 적용되는 임시값**이다. 정식 운영 정책이 아니며, 실험 종료 시 재검토 대상이다.

| 항목 | 실험값 | 위치 | 정식 운영 시 |
|---|---|---|---|
| 1일 전달 상한 | **3건** | `publish-bridge.ts` `DAILY_LIMIT` | 고정 cap을 없애고 guardrail 경고선으로 대체할지 재검토 |
| 수집 페이지 | 1~5p | 실행 인자 | 재검토 |
| 실행 방식 | 전부 수동 | — | GHA 스케줄 도입 여부 재검토 |

창업자 결정(M2-5)은 **"고정 cap이 아니라 품질 우선 + guardrail 경고선"**이다.
`DAILY_LIMIT=3`은 그 정책을 바꾼 것이 아니라, 실험 기간에만 손으로 통제 가능한 규모로 묶어둔 것이다.
**이 절이 남아 있다면 재검토가 아직 안 된 것이다.**

## rollback

| 시점 | 방법 |
|---|---|
| `SENT_TO_SHEET` 이전 | `data/queue.jsonl` 상태만 되돌림. 외부 영향 0 |
| `SENT_TO_SHEET` 직후 | Sheet 해당 행 B열을 `SKIP`으로 → 스크래퍼가 건너뜀 |
| `PUBLISHED` 이후 | 어드민에서 HIDDEN. ⚠️ 이미 색인됐으면 되돌릴 수 없다 |
| 전체 중단 | 스위치 2개를 끄거나 `agents/cook82/` 삭제 |

## 생성물

`data/` 아래에만 쓴다. `.gitignore`에 등재되어 repo에 추적되지 않는다.

```
data/raw-YYYYMMDD-HHmm.jsonl   L1 수집 원본
data/queue.jsonl               큐 정본
data/bridge-log.jsonl          Sheet 전달 감사 로그
```

## 하지 않는 것

- DB write (prisma를 import하지 않는다)
- AI 호출 (gate는 사전·정규식뿐, 비용 0원)
- 본문 rewrite (제목 원문 보존)
- 댓글 전문 저장·재게시 (유형 라벨만)
- `bn=15` 외 게시판 접근 (섞이면 L1이 정지시킨다)
- GHA 스케줄 (7일 수동 검증 전까지 크론 없음)

## 잔여 리스크

82cook 이용약관·저작권은 **미확인**이다. 창업자가 리스크를 인지하고 blocker에서 제외했다(risk accepted).
"법적으로 안전하다"는 뜻이 아니라, 판단을 창업자가 내렸고 잔여 리스크로 남겨둔다는 뜻이다.
