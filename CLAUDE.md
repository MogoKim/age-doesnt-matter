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
5. **직접 확인 후 안내**: 빌드 통과 ≠ 실제 작동. 페이지 구현 후 curl/WebFetch로 200 응답 확인한 뒤 사용자에게 안내.
6. **한 번에 완전하게 요청**: 사용자에게 외부 작업 요청 시 찔끔 요청 금지. 필요한 것 전부 파악 후 한 번에, 스텝 바이 스텝으로, 쉽게 안내.
7. **완료 보고 필수**: 작업 후 ① 뭘 했는지 ② 어디에 기록했는지 ③ 앞으로 뭐가 달라지는지 보고.
8. **서비스 개선 시 어드민 영향도 체크**: 메인 서비스(`src/app/(main)/`, `src/components/features/`, `prisma/schema.prisma` 등)를 수정하면 반드시 어드민 패널에 영향이 없는지 확인. 새 필드/모델 추가 → 어드민 테이블/폼 반영 필요, UI 컴포넌트 변경 → 어드민 관리 화면 정합성 확인, 라우트 추가 → 어드민 네비게이션(admin-nav.ts) + pageTitles 업데이트. 어드민은 서비스와 별도로 개발되는 경우가 많아 drift가 누적되기 쉬우므로, 서비스 변경 PR/커밋마다 "어드민 영향: 없음/있음(내용)" 한 줄 점검.

### 제품/브랜드 규칙
9. **"시니어" 용어 절대 금지**: "시니어", "액티브 시니어" 사용 금지. 대체: "우리 또래", "50대 60대", "인생 2막" 등 자연스러운 표현.
10. **네비게이션**: 하단 탭바 X → 상단 아이콘 메뉴 행 + 플로팅 FAB("✏️ 글쓰기")
11. **카카오 정보 수집**: 필수 최소화 (providerId/닉네임/프로필만 자동), 나머지 선택 동의. 가입 허들 낮추기.
12. **어드민 계정**: 창업자가 자유롭게 생성/닉네임 설정 가능해야 함.
13. **운영 채널**: Telegram → Slack 전면 전환 완료. 13개 채널 운영 중.
14. **디자인 워크플로우**: 코드가 디자인 토큰 원본, Figma는 시각적 참조. 개발 먼저 → Figma 반영도 OK.

## 컨텍스트 관리 원칙 (절대 준수)
- 작업 완료 시: memory/project_status.md 즉시 업데이트
- 대규모 작업 전: memory 파일 먼저 읽어서 현재 상태 파악
- 실수 발견 시: 이 파일의 "창업자 피드백 규칙"에 추가 (별도 memory 파일 X)
- 새 피드백 규칙은 반드시 CLAUDE.md에 추가 — memory 파일은 읽을지 보장 안 됨
- **컨텍스트 축약**: 대화가 70% 이상 차면 `/compact` 실행. 100% 도달 전에 선제적으로 축약
- **큰 작업 분할**: 파일 5개 이상 변경이 예상되면 서브에이전트(Agent tool)로 분할. 메인 컨텍스트는 교통정리만
- **점진적 공개**: 스킬/참조 문서는 메인 파일에 개요만, 상세는 하위 파일로 분리. 필요할 때만 읽기

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
