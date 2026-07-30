# launchd 운영 경로 분리 — 전환 절차

> 상태: **1차(래퍼 파라미터화) 완료 / 2차(plist 전환) 미실행**
> 작성 2026-07-30

## 왜 하는가

로컬 launchd 크론 12개가 **개발 작업트리**(`/Users/yanadoo/Documents/New_Claude_agenotmatter`)를 그대로 실행 경로로 쓴다.
이 작업트리는 사람이 브랜치를 옮기고 미커밋 변경을 쌓는 곳이라, 다음이 일어난다.

- 2026-07-30 실측: 브랜치 `feat/admin-kpi-monthly-view` @ `310f9e17`, `origin/main`보다 **69커밋 뒤처짐**, 미커밋 34파일
- 그 결과 `agents/core/summary.ts`(PR #247)가 **없는 상태로** 크롤이 돌아, 새 글이 계속 `summary = null`로 저장됨

즉 **프로덕션 배포와 로컬 크론 실행 코드가 서로 다른 시점**에 있다. 운영 실행 경로를 개발 작업트리에서 떼어내야 한다.

## 대상 (1차 범위)

`Post` 행을 만들어 summary가 필요한 크론은 12개 중 **2개뿐**이다.

| Label | 래퍼 | 실행 스크립트 | 스케줄(KST) |
|---|---|---|---|
| `com.unao.fmkorea-scraper` | `launchd-wrapper.mjs` | `agents/community/run-local-fmkorea.ts` | 11:30, 21:30 (2회) |
| `com.unao.naver-cafe-sheet-scraper` | `launchd-alert.sh` | `agents/community/run-local-naver-cafe.ts` | 02:00·06:00·08:50·10:40·13:00·15:30·16:45·18:25·19:45·22:10·23:00·23:45 (12회) |

> 두 크론이 **서로 다른 래퍼**를 쓴다. 그래서 1차 PR에서 래퍼 2개를 모두 고쳤다.
>
> 나머지 10개(`cafe-crawler-*`)는 `cafePost`만 쓰거나(`crawler.ts`) `post.create`가 0건(`popular-sync.ts`)이라 summary 위험이 없다. 2차 전환 후 안정되면 같은 방식으로 옮긴다.

---

## 1차 — 래퍼 파라미터화 (완료, 동작 변화 없음)

`scripts/launchd-wrapper.mjs`와 `scripts/launchd-alert.sh`가 작업 디렉토리를 `UNAO_WORKDIR` 환경변수로 받는다.

| UNAO_WORKDIR | 동작 |
|---|---|
| 미설정 | 기존 경로(`/Users/yanadoo/Documents/New_Claude_agenotmatter`) 사용 + 로그에 `UNAO_WORKDIR 미설정 — 기본 경로 fallback` |
| 설정 + 경로 존재 | 그 경로를 `cwd`·`.env.local`·로그 안내 경로로 사용 + 로그에 `workdir=... (UNAO_WORKDIR)` |
| 설정 + 경로 없음 | **exit 1로 즉시 실패**. 조용히 기존 경로로 떨어지지 않는다 |

마지막 줄이 중요하다. 이번 사고의 형태가 "잘못된 경로에서 옛 코드가 조용히 계속 도는 것"이었기 때문에, 경로를 잘못 주면 실패하고 Slack 알림이 뜨는 편이 낫다.

plist는 아직 `UNAO_WORKDIR`을 주지 않으므로 **현재 동작은 전환 전과 100% 동일**하다.

---

## 2차 — 전용 worktree + plist 전환 (미실행, 창업자 판단 후)

### Step 1. 전용 운영 worktree 생성

```bash
cd /Users/yanadoo/Documents/New_Claude_agenotmatter
git worktree add /Users/yanadoo/Documents/unao-ops main
```

> 개발 작업트리의 브랜치·미커밋 변경은 건드리지 않는다. `git checkout main`으로 개발 작업트리를 옮기는 방식은 **다른 세션의 미커밋 34파일이 날아가므로 금지**.

### Step 2. git이 추적하지 않는 자산 복사 (빠뜨리면 크롤이 조용히 실패한다)

```bash
OPS=/Users/yanadoo/Documents/unao-ops
SRC=/Users/yanadoo/Documents/New_Claude_agenotmatter

cp "$SRC/.env.local"                        "$OPS/.env.local"
cp "$SRC/agents/cafe/storage-state.json"    "$OPS/agents/cafe/storage-state.json"
cp "$SRC/agents/cafe/storage-state-jisik.json" "$OPS/agents/cafe/storage-state-jisik.json"
ln -s "$SRC/node_modules"                   "$OPS/node_modules"
mkdir -p "$OPS/logs"
cd "$OPS" && npx prisma generate
```

- `storage-state.json` = 네이버 로그인 쿠키. **없으면 navercafe 수집이 통째로 SKIP된다.**
- `node_modules`는 심볼릭 링크로 충분(디스크 절약). 의존성 변경 시 개발 쪽에서 `npm install` 하면 함께 반영된다.
- `src/generated/prisma`는 추적되지 않으므로 `prisma generate` 필수.

### Step 3. plist 4곳 수정 — **UNAO_WORKDIR만으로는 부족하다**

`ProgramArguments`에 **래퍼 경로와 에이전트 스크립트 경로가 절대경로로 박혀 있다.** 여기를 안 바꾸면 `UNAO_WORKDIR`을 줘도 **옛 작업트리의 `.ts` 파일이 그대로 실행된다.** 아래 4가지를 모두 바꿔야 한다.

`com.unao.fmkorea-scraper.plist`:

| 키 | AS-IS | TO-BE |
|---|---|---|
| `ProgramArguments[1]` | `…/New_Claude_agenotmatter/scripts/launchd-wrapper.mjs` | `…/unao-ops/scripts/launchd-wrapper.mjs` |
| `ProgramArguments[5]` | `…/New_Claude_agenotmatter/agents/community/run-local-fmkorea.ts` | `…/unao-ops/agents/community/run-local-fmkorea.ts` |
| `WorkingDirectory` | `…/New_Claude_agenotmatter` | `…/unao-ops` |
| `StandardOutPath` / `StandardErrorPath` | `…/New_Claude_agenotmatter/logs/…` | `…/unao-ops/logs/…` |
| `EnvironmentVariables` | `PATH`, `HOME` | + `UNAO_WORKDIR=/Users/yanadoo/Documents/unao-ops` |

`com.unao.naver-cafe-sheet-scraper.plist`: 동일하되 `ProgramArguments[1]`은 `scripts/launchd-alert.sh`, `ProgramArguments[5]`는 `agents/community/run-local-naver-cafe.ts`.

### Step 4. 재등록

```bash
launchctl unload ~/Library/LaunchAgents/com.unao.fmkorea-scraper.plist
launchctl load   ~/Library/LaunchAgents/com.unao.fmkorea-scraper.plist
launchctl unload ~/Library/LaunchAgents/com.unao.naver-cafe-sheet-scraper.plist
launchctl load   ~/Library/LaunchAgents/com.unao.naver-cafe-sheet-scraper.plist
```

### Step 5. 검증

- 다음 실행 후 `~/Documents/unao-ops/logs/*.log` 첫 줄이 `workdir=/Users/yanadoo/Documents/unao-ops (UNAO_WORKDIR)`인지
- 그 회차에 새로 저장된 글의 `summary`가 null이 아닌지
- navercafe 수집 건수가 0으로 떨어지지 않았는지(= 쿠키 복사 성공 여부)

### Step 6. 상시 운영 규칙

운영 worktree는 **자동으로 최신이 되지 않는다.** 배포 후 아래를 돌려야 프로덕션과 코드가 맞는다.

```bash
cd /Users/yanadoo/Documents/unao-ops && git pull --ff-only origin main && npx prisma generate
```

이걸 사람이 기억하는 방식은 또 뒤처진다. 3차로 **크론 실행 직전 자동 sync**(래퍼에서 `git pull --ff-only` 후 실행)를 검토한다.

---

## 롤백

plist의 `UNAO_WORKDIR`을 지우고 경로 4곳을 옛 값으로 되돌린 뒤 `launchctl unload && load`. 래퍼는 `UNAO_WORKDIR` 미설정 시 기존 경로로 돌아가므로 1차 PR을 revert할 필요가 없다.
