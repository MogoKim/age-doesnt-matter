# 자율 위임 운영 규칙 (Codex /goal 대응)

> **존재 이유**: 창업자의 매 단계 지시 없이 Claude가 "혼자 끝낼 것 / 끝내고 요청할 것 / 대기할 것"을 스스로 분류·처리하기 위한 규칙. 새 도구가 아니라 기존 `/done`(Gate 1 + 브랜치 push + PR) + `/board`(실측 판정) + `pending_founder_actions.md`(핸드오프)를 묶는 운영 계약이다.

---

## 0-A. 상위 문서 — Codex [1] 운영 마스터 레인 (최우선)

**운영 마스터(Codex) 지휘 세션에서는 [`docs/ops/OPERATING_MASTER_HARNESS.md`](../../docs/ops/OPERATING_MASTER_HARNESS.md)가 이 문서보다 상위다.** 충돌하면 그쪽을 따른다.

- 역할: **Codex = 운영 마스터**(목적·PASS 기준 정의·검증) / **Claude = 실행**(read-only 진단 → 승인 → 구현 → PR 작성)
- **AUTO 등급이어도 창업자 승인 없이 merge·production 배포·workflow dispatch를 하지 않는다.** Claude 작업의 종점은 `[merge 금지]` PR까지다.
- **`main` 직접 push는 등급과 무관하게 항상 금지.** main 반영은 PR merge 경로로만 이루어진다.
- 새 작업은 `git switch -c <브랜치> origin/main`으로 시작한다. 로컬 `main` checkout은 시도하지 않는다(다른 worktree가 점유 중).
- 자율 위임은 **"승인을 생략해도 된다"는 뜻이 아니라 "매 단계 지시를 기다리지 않는다"는 뜻**이다.

---

## 0. 메모리 경로 (혼동 주의)

핸드오프·상태 메모리의 **단일 진실은 CC auto-memory**(세션 시작 시 자동 로드되는 `MEMORY.md` + 서브파일들, `/memory` 명령으로 관리)다. `pending_founder_actions.md`, `project_status.md` 등 23개가 모두 여기 실존한다.

프로젝트 로컬 `<repo>/memory/`(MEMORY.md·project_status.md 2개, 5월자)는 **CC auto-memory 도입 전 stale 잔재**이므로 신뢰하지 않는다. 본 문서에서 "pending_founder_actions.md"는 항상 **CC auto-memory 본**을 가리킨다.

---

## 1. 3-tier 자가 분류 (모든 작업에 항상 적용)

작업을 시작하기 전, 그리고 끝낸 직후 아래 3등급 중 하나로 분류한다.

| 등급 | 정의 | 처리 |
|---|---|---|
| 🟢 **AUTO** | 창업자의 사전 지시 없이 진행 가능 — 게이트로 안전이 보장됨 | 혼자 완료 → `/done` Gate 1 PASS → 커밋 → **작업 브랜치 push → `[merge 금지]` PR 생성** → 완료 1줄 보고. **merge는 창업자 승인 후** |
| 🟡 **HANDOFF** | 작업은 끝냈으나 창업자의 외부 액션이 있어야 반영됨 | 완료 → `pending_founder_actions.md` 행 추가 → `🔔 지금 해주세요` 출력 |
| 🔴 **WAIT** | 시간·데이터·외부결과·선행작업을 기다려야 함 | 실행하지 않음 → 대기 사유 + **재확인 절대일시** 명시 |

---

## 2. AUTO 경계 (창업자 승인 없이 혼자 끝내도 되는 범위)

### 2-A. AUTO 허용 ✅
- read-only 진단·측정: `curl`/TTFB, `gh run` 확인, 코드 trace, 로그 분석
- 문서 작성·갱신: `docs/**`, `.claude/**`
  - ⚠️ repo `<repo>/memory/`는 **제외** — CC auto-memory 도입 전 stale 잔재다. 상태·핸드오프 기록은 CC auto-memory에만 한다(§0 참조)
- 임시 파일 정리: `agents/scripts/_*.ts`(디버그), `docs/analysis/` 등 untracked 정리
- **저위험 코드 수정**: `src/components/**`, `src/app/**` 페이지의 UI·스타일·복사문구 등
  - 🚫 **SEO 노출면은 제외** — `title`·`description`·`canonical`·`robots`·`sitemap`은 AUTO가 아니다(2-B)
  - 단, 아래 게이트를 **모두 PASS**해야 AUTO 자격:
    - `npx tsc --noEmit` 오류 0
    - `npm run build` 성공
    - `npx tsx scripts/check-cron-links.ts` orphan 0 (agents/·workflows 변경 시)

### 2-B. AUTO 금지 → 항상 HANDOFF 또는 명시적 승인 🚫
CLAUDE.md 민감영역. 게이트를 통과해도 자동 진행하지 않는다.
- `src/lib/auth.config.ts`, `src/lib/auth.ts` — 인증 (회원가입 체크리스트 대상)
- `prisma/schema.prisma` + migration — DB 스키마
- `agents/**` 핵심 로직 — constitution `canWrite`, `runner.ts` HANDLERS, wave/generator, DB write(COO만)
- `.github/workflows/**` — CI/크론
- `.env*`, GitHub Secrets, 외부 OAuth·API 콘솔, launchd plist
- **SEO 노출면** — `sitemap`·`robots`·`canonical`·`title`·`description` (CI `seo-guard` 대상, 네이버 유입 보호)
- **`main` 직접 push · merge · production 배포 · workflow dispatch** — 등급 무관 **항상** 창업자 승인 대상
- `/careful` 트리거 대상 — force push, `rm -rf`, 에이전트 구조 변경

> 경계가 모호하면 **항상 보수적으로** (= HANDOFF로 올린다). 의심되면 AUTO 아님.

---

## 3. HANDOFF 처리 (끝내고 창업자에게 요청)

1. 작업·커밋·**작업 브랜치 push·`[merge 금지]` PR 생성**까지 완료한다 (반쪽짜리로 멈추지 않는다). **merge는 하지 않는다.**
2. `pending_founder_actions.md`에 행 추가:
   ```
   | YYYY-MM-DD | [액션 내용] | [커밋 SHA 또는 -] | ⏳ 대기 중 |
   ```
3. 대화창에 `🔔 지금 해주세요` 블록 출력 (done.md STEP 6 형식).
4. 창업자가 완료 확인 시 해당 행을 `✅ 완료`로 갱신.

HANDOFF 트리거 예: PR merge, **DB 스키마 반영**(`/prisma-guide` 절차 — pg 모듈 직접 SQL, Prisma CLI 금지), `.env.local` 키 추가, GitHub Secrets, launchd reload, 외부 콘솔 설정, **DB read-only role 발급**(board 2단계).

---

## 4. WAIT 처리 (대기)

실행하지 않고, 아래를 명시한다.
- **대기 사유**: 무엇을 기다리는가 (시간 경과 / 데이터 누적 / 외부 결과 / 선행 작업)
- **재확인 시점**: 절대일시 (예: "2026-06-08 09:00 KST 이후") 또는 조건 (예: "wave 연속 10/10 success 시")
- WAIT 항목은 `pending_founder_actions.md` 또는 보드 카드 WAIT로 남긴다.

WAIT 예: 에이전트 안정성 누적 관찰, 24h 검증, 백로그 운영 게이트(generator 변경 등) 해제 대기.

---

## 5. 작업 종료 루프 (self-contained)

```
작업 분류(AUTO/HANDOFF/WAIT)
  → AUTO:    실행 → /done(Gate1) → 커밋 → 브랜치 push → [merge 금지] PR → 1줄 보고
  → HANDOFF: 실행 → /done(PR까지) → pending_founder_actions 기록 → 🔔 출력
  → WAIT:    미실행 → 사유 + 재확인 시점 기록
  ※ 등급과 무관하게 merge·배포는 창업자 승인 후. main 직접 push는 하지 않는다.
  → 끝에 "최종 목표 달성됐나?" 자문 (CLAUDE.md 작업방식 2)
     안 됐으면 "다음은 [X]입니다" 제시
```

## 6. 안전장치 (이미 존재 — 재사용)
- `/done` Gate 1: tsc + build + cron-links + 아키텍처 검토 → 브랜치 push + `[merge 금지]` PR까지만
- `.claude/settings.json` PreToolUse가 차단하는 것 (실측 기준):
  - **`main` 대상 push 전면** — force 유무 무관. `origin main` · `-u origin main` · `origin HEAD:main` · `origin +main` · `--force-with-lease origin main` 전부 차단
  - **`git reset --hard`** (모든 형태)
  - **`rm -rf` 계열 + `/`로 시작하는 절대경로** — 루트뿐 아니라 `/Users/...` 같은 모든 절대경로. 플래그 변형(`-rf`·`-fr`·`-r -f`)도 포함
  - ⚠️ **사각지대**: `rm -rf`의 **상대경로**(`rm -rf src/`)와 **`~/` 경로**는 차단되지 않는다(`rm -rf .next` 같은 정상 작업을 막지 않기 위한 의도적 범위)
  - ⚠️ `gh pr merge` · `gh workflow run` · `launchctl`은 **훅이 막지 않는다.** 승인 후 Claude가 대행해야 하는 명령이라 하드 블록 대상에서 제외했다 — 규칙(§0-A·2-B)으로만 통제된다
  - ⚠️ `prisma migrate deploy`·`db push`·`db seed`도 훅이 막지 않지만, 이쪽은 **승인 후에도 실행 금지**다(이 프로젝트는 Prisma CLI 마이그레이션을 쓰지 않는다 — `/prisma-guide` 참조)
  - 이 훅은 문자열 매칭이라 우회가 가능하다. **안전망으로 과신하지 말고 AUTO 경계를 넓히지 마라**
- `.claude/sessions/domain-map.json`: 멀티 AI 도메인 침범 경고
- `agents/core/constitution.yaml` `automation_status`: 에이전트 자동화 ON/OFF
- `/careful`: 되돌리기 어려운 작업 전 게이트

## 7. 트리거 조건
- 창업자가 "혼자 처리해", "자율로", "/goal처럼", "알아서 끝내고 보고해" 등 자율 위임 요청 시
- `/board` 보고 후 "단독 종결 가능한 것 처리해" 류 요청 시
- 다수 운영 작업을 일괄 위임받았을 때
