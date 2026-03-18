# New_Claude_agenotmatter
## 우리 나이가 어때서 (age-doesnt-matter.com)

> 50·60대가 나이 걱정 없이 일자리와 소통을 찾는 따뜻한 커뮤니티 플랫폼

---

## 프로젝트 개요

- **서비스명**: 우리 나이가 어때서 (우나어)
- **도메인**: age-doesnt-matter.com
- **타겟**: 50~60대 한국인
- **형태**: 커뮤니티 + 일자리 플랫폼 (펨코/오늘의유머/디시 스타일)

## 기술 스택

| 역할 | 기술 |
|---|---|
| 프레임워크 | Next.js 14 App Router + TypeScript |
| DB | Supabase (PostgreSQL + Prisma) |
| 호스팅 | Vercel |
| 인증 | NextAuth v5 (카카오 전용) |
| AI 에이전트 | Claude API (claude-sonnet-4-6 / claude-haiku-4-5) |
| 외부 연결 | MCP (supabase/github/analytics/r2) |
| 자동화 | GitHub Actions Cron |
| 이미지 | Cloudflare R2 |

## 폴더 구조

```
New_Claude_agenotmatter/
├── README.md
├── CLAUDE.md                  ← Claude Code 지시사항
├── docs/
│   ├── prd/                   ← PRD 문서 4개
│   │   ├── PRD_Final_A_서비스_고객웹.md
│   │   ├── PRD_Final_B_어드민_데이터.md
│   │   ├── PRD_Final_C_보안_DevOps_QA.md
│   │   └── PRD_Final_D_AI에이전트운영.md
│   └── constitution/          ← 회사 헌법 문서
├── src/                       ← Next.js 웹사이트 코드
└── agents/                    ← AI 에이전트 시스템 (TypeScript)
```

## 브랜드

- **컬러**: #FF6F61 (Coral Living)
- **폰트**: Noto Sans KR (최소 17px)
- **톤**: 따뜻하고 다정한 이웃 언니/오빠

## 개발 단계

| Phase | 내용 |
|---|---|
| 0 | Next.js + Supabase + 디자인시스템 + 카카오로그인 + CI/CD |
| 1 | 홈/일자리/소통마당/매거진/마이페이지 |
| 2 | 공감/댓글/등급/신고/AI필터 |
| 3 | 어드민 패널 |
| 4 | 봇 + 데이터 + 에이전트 기반 |
| 5 | 에이전트 고도화 + 알바생 시드 |
