# DB 연결 타임아웃(로그인 Configuration 에러) 수정 설계 + 리스크 헷징 (2026-06-18)

> READ ONLY 분석 기반 설계. **아직 코드 미변경.** 창업자 승인 후 별도 worktree에서 구현.

## 근본 원인 (코드+실측 확정)

1. production DB 풀 `max=3` (Supavisor 6543 한도 200 공유 보호용, 의도적). `connectionTimeout=10초`. [prisma.ts:39,56](src/lib/prisma.ts#L39)
2. 순간 동시 쿼리>3 또는 백그라운드(ISR 30초 재검증)+에이전트가 Supavisor 슬롯 점유 → pg-pool이 10초 내 연결 못 얻음 → **`timeout exceeded when trying to connect`** throw ([pg-pool/index.js:224])
3. **급소**: 재시도 안전망 `CONNECTION_ERROR_PATTERN`에 이 메시지가 **누락** → `retryOnConnError`가 연결에러로 인식 못 함 → 재시도 없이 즉시 throw → auth 콜백 실패 → `/auth/error?error=Configuration`. [db-retry.ts:13](src/lib/db-retry.ts#L13)
4. 트래픽 피크 아님(5일 20건 중 8건이 방문자 0, 새벽 5시대 집중) / 리전 정상(Vercel syd1 ↔ Supabase ap-southeast-2) / 실사용자 영향 ≈ 하루 1~2명

---

## ① [근본 수정] 재시도 안전망에 누락된 에러 추가

`CONNECTION_ERROR_PATTERN`에 `timeout exceeded when trying to connect` 1개 추가. **3곳 동기화**(주석상 묶여 있음):
- [src/lib/db-retry.ts:13](src/lib/db-retry.ts#L13) — 웹 런타임(로그인 경로)
- [agents/core/connection-error.ts:10](agents/core/connection-error.ts#L10) — 에이전트(복제본)
- `.github/workflows/agents-cafe-wave.yml` grep 기준 (주석에 동기화 명시)

**효과**: 풀 고갈로 타임아웃 시 `retryOnConnError`가 200/400ms 백오프로 **2회 재시도** → wave는 0초 작업이라 1~2초 뒤 슬롯이 비면 성공 → **로그인 구제**. (메모리의 원래 설계 의도가 이 에러엔 작동 안 하던 것을 복구)

**왜 connectionTimeout 늘리기(원래 ①안)를 안 쓰나**: admin 외 함수는 `maxDuration` 미설정 = Vercel 기본(~15초). connectionTimeout을 20초로 늘리면 **함수가 먼저 죽어** 무의미/악화. 재시도 추가는 함수 한도와 무관(추가 지연 최대 ~1초).

---

## ② [보조 수정] ISR 백그라운드 DB 부하 감소

글목록 캐시 재검증 주기 `30초 → 90초`:
- [src/app/(main)/community/[boardSlug]/page.tsx:54](src/app/(main)/community/[boardSlug]/page.tsx#L54) `export const revalidate`
- [src/components/features/community/PostListBottom.tsx:12](src/components/features/community/PostListBottom.tsx#L12) `community-board-page` 태그

**제외(절대)**: `community/[boardSlug]/[postId]/page.tsx`(글상세) — **Capacitor 세션 점유 중**. 건드리지 않음.

**효과**: 글목록 재검증 빈도 1/3 → 백그라운드 DB 쿼리 감소 → 풀 여유 → 타임아웃 빈도 하락. **트레이드오프**: 새 글 반영이 30초→90초로 1분 더 걸림(시니어 커뮤니티 체감 미미).

---

## 리스크 헷징

| 항목 | 위험 | 롤백 | 검증 |
|---|---|---|---|
| ① 패턴 추가 | **낮음**. "더 많은 에러 재시도"지만 추가분은 명확한 연결 타임아웃 메시지 1개뿐. 비연결 에러는 여전히 즉시 throw(기존 동작 불변) | 정규식에서 추가분 제거 | `isConnectionError('timeout exceeded when trying to connect')===true` 단위 확인 + 배포 후 Configuration 빈도 모니터링 |
| ① 함수 지연 | 재시도로 최대 ~1초 추가(2회×백오프). 함수 15초 한도 내 여유 | 동일 | 평상시 로그인 지연 무변화 확인 |
| ② revalidate | **낮음**. 데이터 신선도만 30→90초 | 값 복귀 | 글목록 정상 표시 + DB 타임아웃 빈도 감소 |
| 충돌 | **0 (실측)**. 4파일 모두 poc/codex/미커밋 안 건드림 | — | `git diff main...poc/codex -- <4파일>` 비어있음 확인됨 |

### 민감도 / 절차
- ① `db-retry.ts`(인증 경로) + `agents/core`(에이전트 핵심) = **회원가입 체크리스트 + 창업자 승인 대상(HANDOFF)**. `.github/workflows` 변경 포함.
- **Capacitor 2-2 OAuth 작업과 순서 조율**: ①은 OAuth 콜백 인접 경로 → Capacitor가 auth 건드리기 전에 머지하거나 조율.
- 작업은 **main 기준 별도 worktree**에서. 커밋은 변경 파일만 명시적 stage.

### 배포 후 검증 (회원가입 체크리스트)
1. `/api/health/auth` 200 (kakao:true)
2. Android Chrome + iOS Safari 실기기 카카오 로그인 1회
3. BotLog `AUTH_FAILURE` + `Configuration` 빈도 1시간~1일 모니터링 (목표: 0 수렴)
4. `tsc --noEmit` / `eslint` / `build` 통과 / `check-cron-links`(workflows 변경 시)

### 적용 순서 제안
①(근본, 효과 큼) 먼저 단독 배포 → 효과 확인 → ②(보조) 추가. 또는 저위험이라 함께. 권장: **① 먼저** (인과 명확, 효과 추적 쉬움).

---

## 기각한 대안
- connectionTimeout 10→20초: 함수 maxDuration(~15초) 함정 → 무의미/악화
- 풀 max 3→키우기: Supavisor 200 포화(2026-06-08 8→3 복귀 실패 이력) → 위험
- 함수-DB 리전 이전: 이미 정합(syd1↔ap-southeast-2) → 불필요
