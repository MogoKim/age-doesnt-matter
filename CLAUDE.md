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
- 모델: claude-sonnet-4-6 (전략 판단) / claude-haiku-4-5 (빠른 작업)
- 회사 헌법: /agents/core/constitution.yaml 항상 참조
- DB write: COO 에이전트만 가능

## 검증 명령 (코드 변경 후 반드시 실행)
- 타입 체크: `npx tsc --noEmit`
- 린트: `npx eslint . --ext .ts,.tsx`
- Prisma: `npx prisma generate` (스키마 변경 시)
- 빌드: `npm run build`

## 컨텍스트 관리 원칙 (절대 준수)
- 작업 완료 시: memory/project_status.md 즉시 업데이트
- 대규모 작업 전: memory 파일 먼저 읽어서 현재 상태 파악
- 이미 완료된 작업을 다시 지시하지 말 것 — 메모리 확인 필수
- 실수 발견 시: 이 파일 또는 memory/feedback_*.md에 규칙 추가
- 창업자에게 작업 안내 시: 이전에 완료한 것이 아닌지 project_status.md 교차 검증

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
