# DB 구조 진단 리뷰 (2026-06-08)

> READ ONLY 진단. **수정 미착수** — 다음 수정 작업의 단일 참조 문서.
> 식별자는 함수명 우선(라인은 코드 변경 시 drift되므로 보조).
> 검증: 3관점 진단(DBA/DA/DE) + 4회 외부검증/직접 코드확인.

---

## A. 코드로 확정한 발견 (직접 검증 — 신뢰)

### 🔴 P1-1 비정규화 카운트 드리프트 (사용자에게 보이는 오류)

글/댓글을 **삭제·숨김해도 카운트를 안 줄여** 프로필 "작성 글 N개" 등이 영구히 부풀려진다. 생성은 atomic(안전), **삭제/숨김이 단방향**이라 시간이 갈수록 실제와 벌어진다.

| 경로(함수) | 파일 | User.postCount | Post.commentCount | User.commentCount |
|---|---|:--:|:--:|:--:|
| `deletePost` | `src/lib/actions/posts.ts` | ❌ 누락 | — | — |
| `deleteComment` | `src/lib/actions/comments.ts` | — | ✅ 줄임 | ❌ 누락 |
| `adminProcessReport` | `src/lib/actions/admin/admin.reports.ts` | ❌ | **❌ 누락** | ❌ |

- **신고 처리 경로는 카운트를 하나도 안 건드린다** — `status`만 DELETED/HIDDEN으로 변경. 그래서 "Post.commentCount는 안전"은 **일반 삭제(`deleteComment`)에만 해당**, 신고 경로는 Post 카운트도 깨진다.
- **HIDDEN 처리도 카운트를 유지** → 숨긴 글/댓글이 카운트에 잔존.
- `receivedLikes`(받은 좋아요)는 좋아요 토글이 increment/decrement 양방향이라 **안전**.
- 생성 경로(`createPost`·`createComment`·`likes.ts`·`guest-likes.ts`)는 `$transaction`+`increment`로 원자 처리되어 안전.

**수정 시 (향후, 승인 필요)**
1. `deletePost`·`deleteComment`·`adminProcessReport`·탈퇴 경로의 트랜잭션에 해당 카운트 `decrement` 추가 (HIDDEN 포함).
2. 과거 누적 드리프트 1회 백필(실제 개수로 재계산).
3. 야간 reconcile 크론(정기 자동 교정).

### 🔴 P1-2 로그/수집 테이블 retention(보존정책) 부재

`EventLog`·`CafePost`·`BotLog` 모두 **append-only + 정리(cleanup) 0**. 무한 증가.
- `CafePost`는 본문 `@db.Text` + 댓글 `Json`이라 행당 용량이 커 스토리지로 더 빨리 아프다. 큐레이션은 최근 7일치만 조회 → 나머지는 **읽히지도 않는 죽은 데이터**로 적재.
- `EventLog`는 분석이 매번 원천을 스캔 → 데이터 증가 시 느려짐.

**수정 시**: 통합 보존정책(집계 롤업 후 단기보관 / 90일 후 삭제 등). EventLog는 집계 사전계산(CDO) 후 단축 보관.

### 🟠 P2 잠복/구조 리스크
- **`Comment.parent` onDelete 미지정**(`prisma/schema.prisma`): 현재 soft-delete만 써서 잠복. 관리자/크론이 글을 **hard delete하면 대댓글 FK 위반으로 터질 지뢰**.
- **탈퇴 후속 정리 배치 없음**(`account.ts`): WITHDRAWN 상태만 찍고 "30일 후 삭제" 미구현 → 탈퇴자 콘텐츠·카운트 잔존.
- **분류값 SSOT 부재**: `desireCategory` 정답 목록이 schema 주석(13개) / 키워드(16개) / `psych-analyzer` enum(20개)로 **제각각**. schema 주석만 보고 분석하면 정상값(HOUSING 등)을 오류로 오인.

### ⚠️ 향후 실측(read-only) 시 주의 — SQL 함정
- 카운트 비교는 `Like + GuestLike` **합산**(둘 다 likeCount increment). Like만 세면 비회원 좋아요 글이 전부 오탐.
- 검증 대상은 Post가 아니라 **User 카운트**(+ 신고경로의 Post.commentCount).
- 연결은 `OPS_BOARD_READONLY_URL` + `scripts/ops-board/probes/db-probe.ts`의 `dbCount`(읽기전용 role). **DIRECT_URL(쓰기가능) 금지.**
- 분류값 점검은 **닫힌집합만**(desireCategory = psych 20 + GENERAL 등). 열린목록(`EventLog.botType` x-bot-type 자유주입 · `BotLog.action` 상수 없음)은 제외.

---

## B. 3관점 진단 의견 (원본 미재검 — 참고용)

> 아래는 DBA/DA/DE 3관점 진단의 의견으로, A섹션처럼 코드로 직접 확정한 것은 아니다.

- **등급**: DBA **B−**(인덱스 양호 / EventLog 무한증가·백업계획 없음) · DA **B**(ERD·enum 우수 / 비정규화·JSON 남용) · DE **C+**(수집 이중화 양호 / 멱등성 없음·집계 풀스캔).
- **멱등성**: EventLog에 중복 방지 키 없음 → 재전송·새로고침 시 중복 적재 가능(총 이벤트수 부정확, DAU는 영향 적음).
- **stale(이미 처리/오판 — 진단 대상 아님)**: Kakao 채널 오분류(수정 `5173a9b`) · browser_env "누락"(오판 철회, 6/2부터 정상) · debug_stage(삭제 완료) · getKstMonthStart 날짜경계(정상 확정).

---

## 우선순위 (수정 착수 시)
1. **P1 카운트 드리프트** — 유일하게 사용자 눈에 보이는 데이터 오류. decrement 추가 + 백필 + reconcile.
2. **P1 retention** — EventLog/CafePost/BotLog 보존정책.
3. **P2** — 탈퇴 배치, Comment onDelete 정책, 분류 SSOT.

## 다음 단계
수정은 DB write·코드 변경 동반이라 창업자 승인 영역. **P1 카운트 드리프트부터** 권장.
