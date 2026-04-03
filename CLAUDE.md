# 우리 나이가 어때서 — Claude Code 지시사항

## 프로젝트 개요
- 서비스명: 우리 나이가 어때서 (우나어)
- 도메인: age-doesnt-matter.com
- 프로젝트 폴더: /Users/yanadoo/Documents/New_Claude_agenotmatter
- PRD 문서: /Users/yanadoo/Documents/New_Claude_agenotmatter/docs/prd/

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
- 폰트 최소: 15px (caption/배지만, 본문 18px 베이스)
- 브랜드 컬러: --color-primary (#FF6F61)
- 버튼 높이: 52px (모바일) / 48px (데스크탑)
- 모달: 모바일=하단 풀스크린 시트 / 데스크탑=중앙 팝업

## 코딩 원칙
- TypeScript any 사용 금지
- 서버 컴포넌트 기본, 'use client' 최소화
- 이미지: next/image 필수 (WebP + lazy load)
- 에러 클래스: AppError / NotFoundError / ForbiddenError
- 에이전트 스크립트 생성 시: .claude/rules/agent-lifecycle.md 체크리스트 필수 준수 (runner.ts 등록 + 크론 연결 + 비용 영향 명시)

## AI 에이전트 규칙
- 에이전트 코드: /agents 폴더 (TypeScript)
- 모델 3-tier: strategic=Opus(주간 전략) / heavy=Sonnet(고객 대면+분석) / light=Haiku(데이터+모니터링) → 상세: constitution.yaml model_policy
- 회사 헌법: /agents/core/constitution.yaml 항상 참조
- DB write: COO 에이전트만 가능

## 검증 명령 (코드 변경 후 반드시 실행)
- 타입 체크: `npx tsc --noEmit`
- 린트: `npx eslint . --ext .ts,.tsx`
- Prisma: `npx prisma generate` (스키마 변경 시)
- 빌드: `npm run build`

## 창업자 피드백 규칙 (절대 준수 — 실제 사고에서 나온 규칙들)

### 작업 방식
1. **문제 정의 먼저**: 문제 정의 → 원인 분석 → 해결 계획 → 검증 방법 순서로 구조화한 뒤 실행. 추측으로 시행착오 반복 금지.
2. **끝까지 이어가라**: 한 단계 끝나면 "최종 목표 달성됐나?" 자문. 안 됐으면 "다음은 [X]입니다. 진행할까요?" 반드시 제시. 중간에 멈추지 마라.
3. **코드 변경 후 커밋 제안**: 코드를 수정하고 커밋 안 한 채 대화 끝내지 마라. 반드시 "커밋할까요?" 물어라.
4. **완료 여부 확인**: 작업 안내 전 memory/project_status.md 교차 검증. 이미 완료된 걸 다시 시키지 마라.
5. **직접 확인 후 안내**: 빌드 통과 ≠ 실제 작동. 반드시 아래 순서로 검증:
   a) `npx tsc --noEmit` 통과
   b) 변경 페이지 curl/WebFetch로 200 응답 확인
   c) 광고/에이전트 변경 시 `npm run smoke-test` + `check-cron-links.ts` 실행
   d) 크론 추가 시 워크플로우 case문 + cron expression 실제 매칭 확인
   e) 검증 결과를 사용자에게 ✅/❌ 형식으로 보고
   **검증 없이 "완료"라고 말하지 마라.**
6. **한 번에 완전하게 요청**: 사용자에게 외부 작업 요청 시 찔끔 요청 금지. 필요한 것 전부 파악 후 한 번에, 스텝 바이 스텝으로, 쉽게 안내.
7. **완료 보고 필수**: 작업 후 ① 뭘 했는지 ② 어디에 기록했는지 ③ 앞으로 뭐가 달라지는지 보고.
8. **서비스 개선 시 어드민 영향도 체크**: 메인 서비스(`src/app/(main)/`, `src/components/features/`, `prisma/schema.prisma` 등)를 수정하면 반드시 어드민 패널에 영향이 없는지 확인. 새 필드/모델 추가 → 어드민 테이블/폼 반영 필요, UI 컴포넌트 변경 → 어드민 관리 화면 정합성 확인, 라우트 추가 → 어드민 네비게이션(admin-nav.ts) + pageTitles 업데이트. 어드민은 서비스와 별도로 개발되는 경우가 많아 drift가 누적되기 쉬우므로, 서비스 변경 PR/커밋마다 "어드민 영향: 없음/있음(내용)" 한 줄 점검.

### 제품/브랜드 규칙
9. **"시니어" 용어 절대 금지**: "시니어", "액티브 시니어" 사용 금지. 대체: "우리 또래", "50대 60대", "인생 2막" 등 자연스러운 표현.
10. **네비게이션**: 하단 탭바 X → 상단 아이콘 메뉴 행 + 플로팅 FAB("✏️ 글쓰기")
11. **카카오 정보 수집**: 필수 최소화 (providerId/닉네임/프로필만 자동), 나머지 선택 동의. 가입 허들 낮추기.
12. **어드민 계정**: 창업자가 자유롭게 생성/닉네임 설정 가능해야 함.
13. **운영 채널**: Slack 6개 통합 채널 운영 중 (#대시보드, #리포트, #qa, #시스템, #로그, #에이전트). 13개 슬래시 커맨드.
14. **디자인 워크플로우**: 코드가 디자인 토큰 원본, Figma는 시각적 참조. 개발 먼저 → Figma 반영도 OK.
15. **종속성 파악 후 작업**: 코드 변경 전 해당 코드의 종속 관계 먼저 파악. CSP↔광고, DB↔페이지, 에이전트↔크론↔워크플로우 등 연쇄 영향을 놓치면 프로덕션 장애 발생. grep/Explore로 의존 관계 확인 후 작업.
16. **배포 후 프로덕션 검증 필수**: 커밋+푸시 후 `/verify` 또는 smoke-test로 프로덕션 실제 동작 확인. CI 통과만으로 안심하지 마라.
17. **크론/에이전트는 "돌았다" 증거 확인**: 에이전트 추가/수정 후 "크론 설정했습니다"로 끝내지 마라. 실제로 (1) runner.ts 핸들러 등록, (2) 워크플로우 case문 매칭, (3) cron expression 정확성, (4) GitHub Actions 실행 로그 또는 BotLog/Slack 기록까지 확인. 코드에 있다고 실행되는 게 아니다.

## 컨텍스트 관리 원칙 (절대 준수)
- 작업 완료 시: memory/project_status.md 즉시 업데이트
- 대규모 작업 전: memory 파일 먼저 읽어서 현재 상태 파악
- 실수 발견 시: 이 파일의 "창업자 피드백 규칙"에 추가 (별도 memory 파일 X)
- 새 피드백 규칙은 반드시 CLAUDE.md에 추가 — memory 파일은 읽을지 보장 안 됨
- **컨텍스트 축약**: 대화가 70% 이상 차면 `/compact` 실행. 100% 도달 전에 선제적으로 축약
- **큰 작업 분할**: 파일 5개 이상 변경이 예상되면 서브에이전트(Agent tool)로 분할. 메인 컨텍스트는 교통정리만
- **점진적 공개**: 스킬/참조 문서는 메인 파일에 개요만, 상세는 하위 파일로 분리. 필요할 때만 읽기

## 스킬 라우팅 규칙

다음 요청이 들어오면 코드 작성 전에 해당 스킬을 먼저 실행:
- "이게 맞나?", "더 크게", "전략 리뷰", "방향성 검토" → `/plan-ceo-review`
- "아키텍처 검토", "코딩 시작 전 확인", "설계 검토" → `/plan-eng-review`
- "버그", "에러", "왜 안되지", "자꾸 실패해" → `/investigate`
- "코드 리뷰", "PR 전 확인", "리뷰해줘" → `/code-review`
- DB 마이그레이션, force push, 에이전트 구조 변경, rm -rf → `/careful`
- "회고", "이번 주 어땠어", "주간 리뷰" → `/retro`

## Claude Code 스킬 목록

| 스킬 | 용도 |
|------|------|
| `/plan-ceo-review` | 창업자 관점 제품 전략 리뷰 (4 모드: 확장/선택/유지/축소) |
| `/plan-eng-review` | 엔지니어링 매니저 아키텍처 리뷰 (코딩 전 필수) |
| `/code-review` | 2-pass PR 리뷰 + 계획 이행률 감사 |
| `/investigate` | Iron Law 버그 근본 원인 분석 (4단계) |
| `/careful` | 파괴적 작업 전 확인 게이트 |
| `/retro` | 주간 회고 (BotLog + git) |
| `/verify` | 프로덕션 배포 후 검증 |
| `/qa` | QA 체크리스트 |
| `/done` | 작업 완료 처리 |
| `/status` | 프로젝트 진행 상황 |
| `/sync-memory` | 메모리 동기화 |
| `/prisma-guide` | Prisma DB 작업 가이드 |
| `/runbook-crawler` | 카페 크롤러 장애 대응 |

## 디렉토리 구조 (주요)
- `/src/app/` — Next.js App Router 페이지 + API 라우트
- `/src/components/` — 공통 UI 컴포넌트
- `/src/lib/` — 유틸리티 (env, utils, slack-commands 등)
- `/agents/` — AI 에이전트 시스템 (core, ceo, cmo, coo, cfo, cdo, cafe)
- `/agents/core/` — BaseAgent, notifier, db, constitution, slack-commander
- `/prisma/` — DB 스키마 + 마이그레이션

## 배포 전 체크리스트
- [ ] tsc --noEmit 통과
- [ ] ESLint 통과
- [ ] 모바일 767px 반응형 확인
- [ ] 터치 타겟 52px 이상 확인
- [ ] 광고 슬롯 "광고" 라벨 확인
