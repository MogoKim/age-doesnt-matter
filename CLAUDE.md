# 우리 나이가 어때서 — Claude Code 지시사항

## 프로젝트 개요
- 서비스: 우나어 | 도메인: age-doesnt-matter.com | 폴더: /Users/yanadoo/Documents/New_Claude_agenotmatter
- PRD 문서: docs/prd/

## 기술 스택 규칙
- 프레임워크: Next.js 14 App Router + TypeScript strict
- DB: Supabase + Prisma (Raw SQL 절대 금지)
- 인증: NextAuth v5 카카오 전용
- CSS: Tailwind CSS + shadcn/ui (CSS Variables 디자인 토큰 병행)
- 폰트: Pretendard Variable (next/font/local)
- 유틸: cn() — clsx + tailwind-merge (@/lib/utils)
- 컴포넌트: PascalCase / 파일: kebab-case

## 시니어 친화 UI 원칙 (절대 준수)
- 터치 타겟: 최소 52×52px
- 폰트 최소: 본문 17px / caption·배지 14px (constitution.yaml 기준) — 구현 목표: 본문 18px
- 브랜드 컬러: --color-primary (#FF6F61)
- 버튼 높이: 52px (모바일) / 48px (데스크탑)
- 모달: 모바일=하단 풀스크린 시트 / 데스크탑=중앙 팝업

## 코딩 원칙
- TypeScript any 사용 금지
- 서버 컴포넌트 기본, 'use client' 최소화
- 이미지: next/image 필수 (WebP + lazy load)
- 에러 클래스: AppError / NotFoundError / ForbiddenError
- 에이전트 스크립트 생성 시: `.claude/rules/agents.md` 체크리스트 준수
- 에이전트 ON/OFF 변경 시: `.claude/rules/agent-lifecycle.md` ON/OFF 체크리스트 준수 (GHA + .env.local 동시 반영)

## AI 에이전트 규칙
- 에이전트 코드: /agents 폴더 (TypeScript)
- 모델 3-tier: strategic=Opus / heavy=Sonnet / light=Haiku → 상세: constitution.yaml model_policy
- 회사 헌법: /agents/core/constitution.yaml 항상 참조
- DB write: COO 에이전트만 가능
- **봇/에이전트 ON·OFF 상태 질문 시**: 기억·문서만 보고 "있습니다/없습니다" 주장 금지. 반드시 `.env.local` + `.github/workflows/` 파일 직접 Read 후 답변. 두 곳 불일치 시 "불일치 상태입니다"로 보고.

## 검증 명령 (코드 변경 후 반드시 실행)
- 타입 체크: `npx tsc --noEmit`
- 린트: `npx eslint . --ext .ts,.tsx`
- Prisma: `npx prisma generate` (스키마 변경 시)
- 빌드: `npm run build`

## 회원가입(Auth) 변경 시 절대 준수 체크리스트

- `src/lib/auth.config.ts` / `src/lib/auth.ts` 변경 시:
  1. 배포 후 `/api/health/auth` 200 확인
  2. Android Chrome + iOS Safari 실기기 직접 로그인 테스트
  3. BotLog `action: 'AUTH_FAILURE'` 1시간 모니터링
- 다른 기능 개발 완료 후: `grep -rn "from.*auth\|from.*session" src/` 로 의도치 않은 변경 없는지 확인
- Kakao Developer Console redirect_uri 변경 시: 반드시 창업자 승인 후

## QA 자동 트리거
- **코드 편집 후**: tsc 자동 실행 (Hook)
- **git push**: CI 변경 감지 → @smoke/@ads E2E / agents → cron-links | 배포 후: Smoke+Visual QA+Lighthouse
- **작업 완료**: `/done` → Gate 1 (tsc + cron-links + build) → 자동 커밋+푸시
상세: `.claude/rules/qa-deploy.md`

## 창업자 피드백 규칙 (절대 준수)

### 작업 방식
1. **문제 정의 먼저**: 문제 정의 → 원인 분석 → 해결 계획 → 검증 방법. 추측 시행착오 금지.
   → 코드 분석 시: 함수 동작을 가정하지 말고 Read 도구로 직접 읽어라. 같은 기능의 유사 구현체도 반드시 비교하라. 시뮬레이션 테이블은 코드 트레이스 후에만 작성.
2. **끝까지 이어가라**: 단계 완료 후 "최종 목표 달성됐나?" 자문. 안 됐으면 "다음은 [X]입니다. 진행할까요?" 제시.
3. **커밋+푸시는 /done으로**: Gate 1 PASS → 자동 커밋+푸시. 읽기·분석만 / 플랜·메모리 파일 / 임시 디버그는 제외.
4. **수동 블로킹 작업 먼저 요청**: DB 마이그레이션 / GitHub Secrets / 외부 서비스 활성화 / .env.local 추가 → 코드보다 먼저, 한 번에 완전하게.
5. **완료 여부 확인**: 작업 전 memory/project_status.md 교차 검증. 이미 완료된 것 다시 시키지 마라.
6. **직접 확인 후 안내**: tsc 통과 + curl 200 확인 필수. 검증 없이 "완료" 금지.
7. **한 번에 완전하게**: 외부 작업 요청 시 찔끔 금지. 전부 파악 후 스텝 바이 스텝으로.
8. **완료 보고 필수**: ① 뭘 했는지 ② 어디에 기록했는지 ③ 앞으로 뭐가 달라지는지.
9. **어드민 영향도 체크**: 메인 서비스 변경 시 "어드민 영향: 없음/있음(내용)" 한 줄 점검.
10. **종속성 파악 후 작업**: CSP↔광고, DB↔페이지, 에이전트↔크론↔워크플로우 확인 후 작업.
11. **완료 후 창업자 액션 먼저 요청**: 커밋·푸시·PR 생성 후 창업자가 해야 할 외부 액션(PR merge, DB 마이그레이션, Secrets 추가, launchctl reload 등)이 있으면 완료 보고 직후 '🔔 지금 해주세요' 형식으로 명시 요청. 창업자가 물어볼 때까지 기다리지 마라. /done 외 상황도 동일 적용.

### 제품/브랜드 규칙
- **"시니어" 절대 금지**: 대체 표현 "우리 또래", "50대 60대", "인생 2막"
- **네비게이션**: 하단 탭바 X → 상단 아이콘 메뉴 행 + 플로팅 FAB("✏️ 글쓰기")
- **카카오 정보 수집**: providerId/닉네임/프로필만 자동, 나머지 선택 동의. 가입 허들 낮추기.
- **Figma-First**: `/prd` 명세 → 승인 → 코딩 → 역공학. 상세: `/figma-first 스킬`

## 컨텍스트 관리
- 작업 완료 시 memory/project_status.md 즉시 업데이트
- 대규모 작업 전 memory 파일 먼저 읽기
- 상세: `.claude/rules/context-management.md`

## 기능 라이프사이클 규칙 (자동 적용)

> **단일 진실의 원천**: `docs/features/REGISTRY.md` | 상세: `.claude/rules/feature-lifecycle.md`

| 작업 유형 | Claude 자동 실행 사항 |
|---------|-------------------|
| **신규 기능 추가** | REGISTRY.md 행 추가 + `docs/features/{ID}-{name}.md` 생성 |
| **기존 기능 개선** | feature 문서 수정 이력 한 줄 + REGISTRY 날짜 갱신 |
| **기능 제거** | REGISTRY ARCHIVED + 제거 체크리스트 |
| **버그수정/리팩토링** | 면제 |

## 스킬 라우팅 규칙

- "Figma에 그려줘", "화면 설계", "역공학", "Figma 초기화" → Product Designer Agent | `/figma-first`
- "이미지 만들어줘", "광고 소재", "SNS 이미지" → Graphic Designer Agent
- "영상 만들어줘", "광고 영상", "숏폼" → Video Director Agent
- "이게 맞나?", "전략 리뷰", "방향성" → `/plan-ceo-review`
- "아키텍처 검토", "코딩 전 확인", "설계 검토" → `/plan-eng-review`
- "레거시 영향", "하네스 영향", "CTO 관점", "설계 결정" → `/cto-arch`
- "버그", "에러", "왜 안되지", "자꾸 실패해" → `/investigate`
- "에러 없는데 이상해", "됐는데 안 보여" → `/investigate` (Silent Failure 섹션)
- "코드 리뷰", "PR 전 확인" → `/code-review`
- DB 마이그레이션, force push, 에이전트 구조 변경, rm -rf → `/careful`
- 에이전트 기능 추가·수정 전 → `.claude/rules/agent-code-review.md` 체크리스트 먼저 (이미 구현된 기능 중복 작업 방지)
- "회고", "주간 리뷰" → `/retro`
- "iPhone으로", "iOS로", "Safari로", "WebKit으로" → `npx playwright test --project=qa-ios-webkit` (WebKit 엔진)
- "갤럭시로", "안드로이드로" → MCP Chromium 412×915 또는 `--project=qa-write-s24ultra`
- "전체 QA", "QA 풀로", "모바일 QA 전체" → `--project=qa-ios-webkit --project=qa-write-s24ultra --project=qa-audit`
- "모바일 QA" → `--project=qa-ios-webkit --project=qa-write-s24ultra`
- "두 기기 비교" → `--project=qa-ios-webkit --project=qa-write-s24ultra`
- "Capacitor 개발", "앱 빌드", "Android Studio" → `/careful` + `/plan-eng-review` 먼저 실행

## 디렉토리 구조 (주요)
- `/src/app/` — Next.js App Router 페이지 + API 라우트
- `/src/components/` — 공통 UI 컴포넌트
- `/agents/` — AI 에이전트 시스템 (core, ceo, cmo, coo, cfo, cdo, cafe)
- `/agents/core/` — BaseAgent, constitution, notifier, db
- `/prisma/` — DB 스키마 + 마이그레이션

## 수정 범위 최소화 원칙 (멀티 AI 세션 대응)

Claude Code + Codex 등 여러 AI 세션이 동시에 작업하는 환경. 세션 간 충돌 방지를 위해 반드시 준수.

1. **작업 전 범위 선언**: 코드 수정 전 "이번 태스크에서 건드릴 파일 목록"을 먼저 말한다
2. **태스크 직접 관련 파일만 수정**: 요청과 직접 연관 없는 파일은 절대 수정하지 않는다 — 리팩토링·스타일 정리 등 "겸사겸사" 수정 금지
3. **커밋 전 재확인**: git status에서 수정된 파일이 이번 태스크 범위 안인지 확인. 다른 세션의 미커밋 파일이 섞이지 않았는지 체크
4. **git add . 절대 금지**: 항상 파일명 명시적으로 지정 (`git add [파일명]`)
5. **도메인 참고**: `.claude/sessions/domain-map.json`에 AI별 담당 파일 목록이 있다. 어느 파일을 건드려야 할지 모를 때 참조
6. **커밋은 "내가 이번 세션에서 직접 수정한 파일"만**: `/done` 시 `git status`에 내가 직접 만지지 않은 파일(다른 AI 세션의 미커밋 변경)이 보이면 **절대 스테이징하지 않는다**. 특히 인증·DB 스키마·에이전트 등 민감 영역은 더 주의.

## 배포 전 체크리스트
- [ ] tsc --noEmit 통과
- [ ] ESLint 통과
- [ ] 모바일 767px 반응형 확인
- [ ] 터치 타겟 52px 이상 확인
- [ ] 광고 슬롯 "광고" 라벨 확인
