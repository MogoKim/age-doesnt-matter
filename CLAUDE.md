# 우리 나이가 어때서 — Claude Code 지시사항

## 프로젝트 개요
- 서비스: 우나어 | 도메인: age-doesnt-matter.com | PRD: `docs/prd/`
- Next.js 14 App Router + TypeScript strict / Supabase + Prisma (**Raw SQL 절대 금지**) / NextAuth v5 카카오 전용
- Tailwind + shadcn/ui (CSS Variables 토큰) / Pretendard Variable / `cn()` = clsx + tailwind-merge
- 컴포넌트 PascalCase / 파일 kebab-case

## 판단 기준 (헌법 v5.0 — 상세: `docs/constitution/NORTH_STAR.md`)
- **North Star**: **주간 재방문 참여 유저 수** (최근 7일 재방문 + 글/댓글 1회 이상 고유 사용자).
  DAU·MAU·PV·SEO 클릭·색인 수는 **생존/유입 참고지표이지 목표가 아니다**
- **🚨 네이버 Search Advisor 보호**: 유입 대부분이 네이버다. `sitemap.ts`·`robots.ts`·canonical·
  일반 `<meta name="robots">` **훼손 금지**. 구글만 제외할 땐 `googleBot` 전용 meta만 사용
  (일반 robots는 `index, follow` 유지). CI `seo-guard`가 차단하며 `seo-reviewed` 라벨로만 통과
- **수단과 목적**: SEO·크롤러·에이전트·운영 하네스는 **수단**. 목적은 커뮤니티 신뢰와 참여.
  헷갈리면 "이 작업이 회원이 댓글을 쓰게 만드는 데 기여하는가?"를 묻는다
- **운영 점검**: `npx tsx scripts/ops-doctor.ts` (read-only 진단)
- **CI 가드 3종**: `seo-guard`(네이버 노출면) · `ops-typecheck`(agents·scripts 타입 회귀) · `agents-check`(크론 연결)

## 제품/브랜드 규칙
- **"시니어·어르신·노인·실버" 절대 금지**: 대체 표현 "우리 나이", "우리 또래", "40대 중반~60대 중반 여성", "인생 2막"
- **공식 타겟**: 40대 중반~60대 중반 여성 (핵심 50대). **본질은 일자리 플랫폼이 아니라 커뮤니티** — 일자리는 '돈과 일' 축의 기능
- **네비게이션**: 하단 탭바 X → 상단 아이콘 메뉴 행 + 플로팅 FAB("✏️ 글쓰기")
- **Figma-First**: `/prd` 명세 → 승인 → 코딩 → 역공학. 상세: `/figma-first`
- UI 상세(터치 52px·폰트·모달·cn() 함정): `.claude/rules/ui-components.md`

## 코딩 원칙
- TypeScript `any` 금지 / 서버 컴포넌트 기본, `'use client'` 최소화 / 이미지는 `next/image` 필수 (WebP + lazy)
- 에러 클래스: AppError / NotFoundError / ForbiddenError
- 인증 변경 시 → `.claude/rules/auth-changes.md` 체크리스트 (배포 후 `/api/health/auth` 200 + 실기기 테스트)

## AI 에이전트 규칙
- 에이전트 코드: `/agents` (TypeScript) · 회사 헌법 `/agents/core/constitution.yaml` 항상 참조
- 모델 3-tier: strategic=Opus / heavy=Sonnet / light=Haiku → constitution.yaml `model_policy`
- **DB write는 COO 에이전트만 가능**
- **봇/에이전트 ON·OFF 질문 시**: 기억·문서만 보고 "있습니다/없습니다" 주장 금지. `.env.local` + `.github/workflows/` 직접 Read 후 답변. 불일치 시 "불일치 상태입니다"로 보고
- **`agents/` → `src/` 런타임 import 절대 금지**: `import type`만 허용 (GHA ESM 크로스 import 실패 — trending-scorer 사례)
- 자사 사이트 HTTP 요청 시 `x-bot-type` 헤더 필수 (미포함 시 GA4·EventLog 오염)
- 스크립트 생성 → `.claude/rules/agents.md` / ON·OFF 변경 → `.claude/rules/agent-lifecycle.md` (GHA + .env.local 동시 반영)

## 검증 명령 (코드 변경 후 반드시 실행)
- 타입: `npx tsc --noEmit` — ⚠️ `npm run typecheck`는 root tsconfig가 `agents`·`scripts`를 exclude해 **둘을 검사하지 않는다**.
  agents/scripts는 `npx tsc -p tsconfig.ops.json --noEmit`로 별도 확인
- 린트: `npx eslint . --ext .ts,.tsx` / 빌드: `npm run build` / 스키마 변경 시: `npx prisma generate`
- **DB 스키마 변경은 `/prisma-guide` 기준**(pg 모듈 직접 SQL + `information_schema` 검증). `prisma migrate`·`db push`·`db seed` **금지 — 안내도 금지**
- `agents/`·워크플로우 변경 시: `npx tsx scripts/check-cron-links.ts` (orphan 0 확인)
- 배포 전: tsc 통과 · ESLint 통과 · 모바일 767px 반응형 · 터치 52px · 광고 슬롯 "광고" 라벨
- QA 자동 트리거(Hook·CI·배포 후) 상세: `.claude/rules/qa-deploy.md`

## 창업자 피드백 규칙 (절대 준수)
1. **문제 정의 먼저**: 문제 정의 → 원인 분석 → 해결 계획 → 검증 방법. 추측 시행착오 금지.
   → 코드 분석 시 함수 동작을 가정하지 말고 Read로 직접 읽어라. 유사 구현체도 반드시 비교하라
2. **끝까지 이어가라**: 단계 완료 후 "최종 목표 달성됐나?" 자문. 안 됐으면 "다음은 [X]입니다. 진행할까요?" 제시
3. **커밋+푸시는 `/done`으로**: Gate 1 PASS → 자동 커밋+푸시. 읽기·분석/플랜·메모리/임시 디버그는 제외
4. **수동 블로킹 작업 먼저 요청**: DB 마이그레이션 / GitHub Secrets / 외부 서비스 / `.env.local` → 코드보다 먼저, 한 번에 완전하게
5. **완료 여부 확인**: 작업 전 CC auto-memory(`pending_founder_actions.md` 등)와 교차 검증. 이미 완료된 것 다시 시키지 마라
6. **직접 확인 후 안내**: tsc 통과 + curl 200 확인 필수. 검증 없이 "완료" 금지
7. **한 번에 완전하게**: 외부 작업 요청 시 찔끔 금지. 전부 파악 후 스텝 바이 스텝으로
8. **완료 보고 필수**: ① 뭘 했는지 ② 어디에 기록했는지 ③ 앞으로 뭐가 달라지는지
9. **어드민 영향도 체크**: 메인 서비스 변경 시 "어드민 영향: 없음/있음(내용)" 한 줄 점검
10. **종속성 파악 후 작업**: CSP↔광고, DB↔페이지, 에이전트↔크론↔워크플로우 확인 후 작업
11. **완료 후 창업자 액션 먼저 요청**: PR merge·DB 마이그레이션·Secrets·launchctl reload 등 외부 액션이 있으면
    완료 보고 직후 '🔔 지금 해주세요' 형식으로 명시 요청. 물어볼 때까지 기다리지 마라

## 운영 마스터 협업 (Codex ↔ Claude)
- Codex=운영 마스터(방향·검증) / Claude=실행(진단·구현). read-only 진단 → 승인 → 구현 순서를 지킨다
- merge는 창업자 승인 전 금지. PR 제목에 `[merge 금지]` 유지
- 이전 보고와 실측이 어긋나면 정정부터 하고 진행한다
- 상세: `docs/ops/OPERATING_MASTER_HARNESS.md`

## 수정 범위 최소화 (멀티 AI 세션 대응)
Claude Code + Codex 등 여러 AI 세션이 동시에 작업한다. 세션 간 충돌 방지를 위해 반드시 준수.
1. **작업 전 범위 선언**: 코드 수정 전 "이번 태스크에서 건드릴 파일 목록"을 먼저 말한다
2. **태스크 직접 관련 파일만 수정**: 리팩토링·스타일 정리 등 "겸사겸사" 수정 금지
3. **커밋 전 재확인**: `git status`의 수정 파일이 이번 태스크 범위 안인지, 다른 세션 미커밋이 섞이지 않았는지 확인
4. **`git add .` 절대 금지**: 항상 파일명 명시 (`git add [파일명]`)
5. **커밋은 "내가 이번 세션에서 직접 수정한 파일"만**: 내가 만지지 않은 파일은 **절대 스테이징하지 않는다**.
   인증·DB 스키마·에이전트 등 민감 영역은 더 주의. 도메인 참고: `.claude/sessions/domain-map.json`
6. 상세: `.claude/rules/session-isolation.md`

## 컨텍스트 관리 · 로컬은 정본이 아니다
- **작업 전 확인**: `git fetch origin main && git rev-list --count HEAD..origin/main`
- **0이 아니면** 파일 존재·부재·내용 판단은 반드시 `git show origin/main:<path>` 기준으로 한다
- `/context`·Memory files로 `.claude/**` 변경 효과를 판정할 땐 **로컬 최신 여부를 먼저 확인**
- 작업 완료 시 CC auto-memory(`/memory`) 즉시 업데이트 · 대규모 작업 전 먼저 읽기
- ⚠️ repo `memory/`는 CC auto-memory 도입 전 **stale 잔재** — 읽지도 갱신하지도 말 것
- 상세: `.claude/rules/context-management.md`

## 기능 라이프사이클 (자동 적용)
> 단일 진실의 원천: `docs/features/REGISTRY.md` | 상세: `.claude/rules/feature-lifecycle.md`

신규 기능 = REGISTRY 행 추가 + `docs/features/{ID}-{name}.md` 생성 / 기존 개선 = 수정 이력 한 줄 + 날짜 갱신 /
제거 = ARCHIVED + 체크리스트 / **버그수정·리팩토링은 면제**

## 스킬 라우팅 (핵심)
- "버그", "에러", "왜 안되지" · "에러 없는데 이상해" → `/investigate` (상세: `.claude/commands/investigate/silent-failure.md`)
- "이게 맞나?", "전략 리뷰" → `/plan-ceo-review` | "아키텍처 검토", "설계 결정" → `/plan-eng-review` · `/cto-arch`
- DB 마이그레이션, force push, 에이전트 구조 변경, `rm -rf` → `/careful`
- "혼자 처리해", "자율로", "알아서 끝내고 보고" → `.claude/rules/autonomy.md` (AUTO/HANDOFF/WAIT 자가 분류)
- 에이전트 기능 추가·수정 전 → `.claude/rules/agent-code-review.md` (중복 작업 방지)
- 참여 이벤트(VOTE·FEEDBACK·SURVEY·팝업·HERO) 구현·수정 후 → `.claude/commands/qa/participation-events.md` 필수 10항목 QA
- 모바일 QA: "iPhone/iOS/Safari" → `--project=qa-ios-webkit` · "갤럭시/안드로이드" → `--project=qa-write-s24ultra` ·
  "전체 QA" → 위 둘 + `--project=qa-audit`
- "코드 리뷰", "PR 전 확인" → `/code-review` | "회고", "주간 리뷰" → `/retro`
- "Capacitor 개발", "앱 빌드", "Android Studio" → `/careful` + `/plan-eng-review` 먼저
- 그 외(Figma·이미지·영상)는 해당 skill이 description으로 자동 매칭된다
