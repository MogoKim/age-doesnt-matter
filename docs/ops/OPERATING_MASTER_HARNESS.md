# 운영 마스터 하네스

> 운영에 필요한 판단 기준이 여러 문서에 흩어져 있다. 이 문서는 **그것들을 잇는 지도**이고,
> 어디에도 없던 **작업 흐름 · PR 분할 · 운영검증 기준**만 여기서 새로 정의한다.
> 내용을 복사해 오지 않는다 — 정본은 항상 링크 대상 문서다.

## 0. 문서 지도 — 무엇이 어디 있나

| 알고 싶은 것 | 정본 |
|---|---|
| 왜 이 서비스인가 · North Star · 핵심 감정 · 타겟 · 페르소나 | [`docs/constitution/NORTH_STAR.md`](../constitution/NORTH_STAR.md) |
| 헌법이 어떻게 유지·동기화되는가 | [`docs/constitution/RULE_MAINTENANCE.md`](../constitution/RULE_MAINTENANCE.md) · [`agents/core/constitution.yaml`](../../agents/core/constitution.yaml) |
| Codex 운영 마스터 역할 전문 | [`AGENTS.md`](../../AGENTS.md) |
| Claude가 매 세션 지킬 규칙 | [`CLAUDE.md`](../../CLAUDE.md) |
| 무엇을 먼저 할까 · 상태 · 우선순위 | [`docs/backlog/OPERATING_BACKLOG.md`](../backlog/OPERATING_BACKLOG.md) · [`scripts/ops-board/cards/ledger.json`](../../scripts/ops-board/cards/ledger.json) |
| 세션 격리 · 커밋 휩쓸림 방지 | [`.claude/rules/session-isolation.md`](../../.claude/rules/session-isolation.md) |
| 자율 위임(AUTO/HANDOFF/WAIT) | [`.claude/rules/autonomy.md`](../../.claude/rules/autonomy.md) |
| 하드코딩 · 기술부채 · 승인 게이트 | [`.claude/commands/cto-arch.md`](../../.claude/commands/cto-arch.md) |
| 기능 등록·변경·제거 | [`docs/features/REGISTRY.md`](../features/REGISTRY.md) |
| 운영 경로 정합성 진단 | [`scripts/ops-doctor.ts`](../../scripts/ops-doctor.ts) |

## 1. 역할 분담

목적은 **작업량이 아니라 고객이 다시 오는 것**이다. 판단이 갈리면
"이 작업이 회원이 댓글을 쓰게 만드는 데 기여하는가"를 묻는다.

| | 하는 것 | **하지 않는 것** |
|---|---|---|
| **창업자** | 최종 승인 · 우선순위 결정 · 외부 액션(merge, Secrets, 콘솔) | 세부 구현 판단을 대신 하지 않는다 |
| **Codex (운영 마스터)** | 목적·PASS 기준 정의 · AS-IS 검증 · Claude 지휘 · 보고 검증 · 위험 관리 | 검증 없이 Claude 보고를 믿지 않는다 · 단순 작업을 던지지 않는다 |
| **Claude Code (실행)** | read-only 진단 · 구현 · 검증 · PR 작성 · 관찰 측정 | 승인 없이 merge하지 않는다 · 로컬 dirty를 건드리지 않는다 |

역할 전문은 [`AGENTS.md`](../../AGENTS.md)에 있다. 여기서는 요약만 둔다.

## 2. 작업 흐름 표준

```
목적 → 목표 → AS-IS 실측 → 금지사항 → 구현 범위 → PASS 기준
     → merge 전 확인 → (승인) → merge → 운영검증 → ledger/handoff 반영
```

각 단계에서 빠지기 쉬운 것:

- **목적**: "무엇을 고칠까"보다 "왜 고치나 · 성공 상태가 무엇인가"가 먼저다.
- **AS-IS**: 코드를 가정하지 않고 읽는다. 같은 기능의 유사 구현체를 반드시 비교한다.
- **PASS 기준**: 구현 **전에** 정한다. 나중에 정하면 결과에 맞춰 기준이 휜다.
- **보고**: 파일 수정·commit·DB write 여부를 매번 명시한다. 0이면 0이라고 쓴다.

### read-only 진단이 먼저 필요한 작업

| 먼저 진단 | 바로 구현 가능 |
|---|---|
| 원인이 불명확한 장애 | 오타·문구 수정 |
| 발행/크롤/댓글 등 운영 파이프라인 | 단일 컴포넌트 스타일 |
| DB·스키마·인증·에이전트 구조 | 문서·주석 |
| SEO 노출면 | 테스트 추가 |
| 여러 파일에 걸친 리팩토링 | 이미 진단이 끝난 후속 PR |

## 3. PR 분할 원칙

- **한 PR = 한 책임.** 리팩토링과 기능 추가를 섞지 않는다.
- 큰 작업은 `PR-1 / PR-2 / …`로 쪼개고, 각 PR이 **단독으로 merge 가능**해야 한다.
- **`close_condition`은 마지막 PR에서만 충족된다.** 중간 PR은 "진행"이지 "완료"가 아니다.
- **구현 완료 ≠ 운영검증 PASS.** 둘을 같은 보고에 섞지 않는다.
- PR 제목에 `[merge 금지]`를 달고, 창업자 승인 후 제거한다.

> 예: 여러 곳에 흩어진 정의를 한 곳으로 모으는 작업은 ① 정본 신설 → ② 소비자 전환 →
> ③ 원본 제거 + CI 가드 순으로 나눈다. ②에서 멈추면 **중복 경로가 남은 상태**다.

## 4. 운영검증 4단계

| 단계 | 무엇을 본다 | 언제 끝나나 |
|---|---|---|
| **코드 PASS** | 타입·lint·단위 테스트 | 로컬에서 즉시 |
| **CI PASS** | 파이프라인 전체 green | PR에서 |
| **production PASS** | 배포 후 실제 URL·응답·렌더 | merge 직후 |
| **운영지표 PASS** | 실제 데이터가 의도대로 움직이는가 | **관찰 창 이후** |

**관찰 창이 필요한 영역**: 봇·크롤러·큐레이션·댓글·SEO 노출면.
merge 즉시 판정하지 않는다. 첫 회차 → 6h → 24h처럼 체크포인트를 미리 정한다.

**PASS/FAIL 기준은 관찰 시작 전에 숫자로 적는다.** 기준 없이 시작하면
"괜찮아 보인다"로 끝나고, 그건 검증이 아니다.

## 5. 하드코딩 · 레거시 · 리팩토링

- 임시 bridge · adapter · fallback · 하드코딩 map은 **제거 예정 PR 또는 ledger 항목**을 반드시 남긴다.
- **"새 구조 추가"는 완료가 아니다.** 구 경로 제거 + CI 가드까지가 완료다.
- **중복 경로 병존을 위험으로 본다.** 두 경로가 살아 있으면 언젠가 갈라진다.
- 판정 기준과 체크리스트는 [`.claude/commands/cto-arch.md`](../../.claude/commands/cto-arch.md)에 있다.

## 6. 멀티세션 · 로컬은 정본이 아니다

- 같은 파일을 두 세션이 동시에 수정하지 않는다. 상세는 [`session-isolation.md`](../../.claude/rules/session-isolation.md).
- **작업 전 확인**: `git fetch origin main && git rev-list --count HEAD..origin/main`
- 0이 아니면 파일 존재·부재·내용 판단은 **`git show origin/main:<path>`** 기준으로 한다.
- **`/context`·Memory files로 `.claude/**` 변경 효과를 판정할 땐 로컬이 최신인지 먼저 확인한다.**
  stale 폴더에서 본 `/context`는 옛 파일을 읽은 결과다.
- dirty가 쌓인 공용 폴더는 건드리지 말고, **`git worktree`로 최신 사본**을 따로 만들어 검증한다.
- 검증이 끝난 worktree는 `git worktree remove`로 정리한다. 남겨두면 다음 사람이 stale을 정본으로 오해한다.

## 7. 컨텍스트 · 토큰 원칙

- **항상 로드되는 것**: `CLAUDE.md` + `paths` frontmatter가 **없는** `.claude/rules/*.md`.
- **`paths` frontmatter가 사실상 유일한 절감 수단**이다. 파일을 나누거나 import로 참조해도
  자동 로드 총량은 줄지 않는다.
- 절차서·런북은 `.claude/commands/`, 참조 문서는 `docs/`에 둔다. 둘 다 자동 로드 대상이 아니다.
- 오래된 handoff·ledger는 자동 로드하지 않는다. 필요할 때 경로를 지정해 읽는다.
- Claude에게 장문을 통째로 붙여넣지 않는다. **파일·범위·질문**을 지정하는 편이 정확하고 싸다.

## 8. 금지사항

- 창업자 승인 전 **merge 금지**
- **Raw SQL 금지** · 임의 **DB write 금지** (write는 COO 에이전트 경로만)
- 임의 **workflow dispatch 금지**
- SEO 노출면 임의 변경 금지 — `sitemap` · `robots` · `canonical` · `title` · `description`
- 네이버 수집/색인 요청·재제출 임의 실행 금지
- **stale local을 정본으로 판단 금지**
- **Claude 보고를 검증 없이 신뢰 금지** — 실측과 어긋나면 정정이 먼저다
