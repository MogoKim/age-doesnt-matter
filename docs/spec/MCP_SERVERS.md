# MCP 서버 설정 가이드

> 우리 프로젝트에서 사용할 MCP 서버 목록 및 설정 방법
> 2026-03-16 작성

---

## Tier 1 — 필수 (개발 환경 세팅 시 설치)

### 1. Supabase MCP (공식)
- **패키지**: `supabase-community/supabase-mcp`
- **기능**: DB 테이블 생성, 마이그레이션, SQL 쿼리, 로그, Edge Functions, 스토리지
- **용도**: DB 관리 전반
- **필요 크레덴셜**: Supabase Project URL + Service Role Key

### 2. Prisma MCP (공식)
- **문서**: prisma.io/docs/postgres/integrations/mcp-server
- **기능**: 스키마 설계, 마이그레이션 생성, DB 워크플로우
- **용도**: Prisma 스키마 관리 (Raw SQL 금지 원칙과 완벽 호환)
- **필요 크레덴셜**: DATABASE_URL

### 3. GitHub MCP (공식)
- **패키지**: `github/github-mcp-server`
- **기능**: Issue/PR 관리, 코드 검색, 리뷰, 댓글
- **용도**: 개발 워크플로우 자동화
- **필요 크레덴셜**: GitHub Personal Access Token

### 4. Cloudflare MCP (공식)
- **문서**: developers.cloudflare.com/agents/model-context-protocol/
- **기능**: R2 스토리지, Workers, DNS 관리
- **용도**: 이미지 스토리지 (프로필, 커뮤니티 글)
- **필요 크레덴셜**: Cloudflare API Token

### 5. Context7 (Upstash)
- **패키지**: `@upstash/context7-mcp`
- **기능**: 최신 공식 문서 실시간 참조하여 코드 생성
- **용도**: Next.js 14 / NextAuth v5 / Prisma 정확한 코드 보장
- **필요 크레덴셜**: 없음

### 6. Sequential Thinking (Anthropic 공식)
- **패키지**: `@modelcontextprotocol/server-sequential-thinking`
- **기능**: 단계적 추론, 분기, 수정 지원
- **용도**: 아키텍처 결정, 복잡한 디버깅
- **필요 크레덴셜**: 없음

---

## Tier 2 — 강력 추천

### 7. Next.js DevTools MCP (Vercel 공식)
- **패키지**: `vercel/next-devtools-mcp`
- **기능**: 빌드/런타임/타입 에러 감지, 자동 수정 제안
- **필요 크레덴셜**: 없음 (로컬 dev 서버 연결)

### 8. Figma MCP (Figma 공식) — 디자인 시스템 핵심

**두 가지 방식:**

| 구분 | Remote MCP (권장) | Desktop MCP |
|:---|:---|:---|
| 엔드포인트 | `https://mcp.figma.com/mcp` | `http://127.0.0.1:3845/sse` |
| 실행 | Figma 호스팅 (설치 불필요) | Figma Desktop 앱 필요 |
| 인증 | OAuth 브라우저 인증 | 로컬 자동 인증 |
| 플랜 | 모든 플랜 (Starter: 월 6회 제한) | Dev/Full 시트 필요 |

**기능:**
- Figma 파일 구조·프레임·컴포넌트 읽기
- 디자인 토큰(Variables) 추출
- 선택 프레임 → 코드 변환 (85~90% 정확도)
- 접근성 정보 확인

**설치:**
```bash
# Remote (권장)
claude mcp add --transport http figma https://mcp.figma.com/mcp

# Desktop (로컬)
claude mcp add --transport sse figma-desktop http://127.0.0.1:3845/sse
```

**보조 MCP — claude-talk-to-figma-mcp (쓰기 가능):**
- GitHub: `arinspunk/claude-talk-to-figma-mcp`
- AI가 Figma에 직접 디자인 생성/수정 가능
- 무료 계정에서도 동작
- 상세: `docs/design/DESIGN_WORKFLOW.md` 참조

### 9. Playwright MCP (Microsoft 공식)
- **패키지**: `microsoft/playwright-mcp`
- **기능**: 크로스 브라우저 자동화 테스트
- **용도**: 5060 UI 검증 (터치 52px, 폰트 17px, 반응형)
- **필요 크레덴셜**: 없음

### 10. Sentry MCP (Sentry 공식)
- **패키지**: `getsentry/sentry-mcp`
- **기능**: 에러 모니터링, 성능 추적
- **필요 크레덴셜**: Sentry DSN + Auth Token

---

## Tier 3 — 필요 시 추가

### 11. Telegram MCP (커뮤니티) ⭐ 운영 알림용
- **패키지**: `qpd-v/mcp-communicator-telegram`
- **기능**: 텔레그램 봇으로 알림 전송, 파일 공유
- **용도**: 운영 알림 (에러, 신고 급증, 에이전트 상태 등)
- **필요 크레덴셜**: Telegram Bot Token + Chat ID

### 12. Brave Search MCP (Anthropic 공식)
- **패키지**: `@anthropic-ai/mcp-server-brave-search`
- **기능**: 웹 검색
- **필요 크레덴셜**: Brave Search API Key

### 13. Memory MCP (Anthropic 공식)
- **패키지**: `@modelcontextprotocol/server-memory`
- **기능**: 지식 그래프 기반 영구 메모리
- **용도**: 에이전트 간 컨텍스트 공유

### 14. Filesystem MCP (Anthropic 공식)
- **패키지**: `@modelcontextprotocol/server-filesystem`
- **기능**: 안전한 파일 읽기/쓰기

---

## 설치 시점

| Phase | MCP 서버 |
|:---|:---|
| **B1 (프로젝트 초기화)** | Context7, Sequential Thinking, Filesystem, GitHub MCP |
| **B3 (DB 환경)** | Supabase MCP, Prisma MCP |
| **B5 (스토리지)** | Cloudflare MCP |
| **B6 (CI/CD)** | Next.js DevTools MCP |
| **B7 (테스트)** | Playwright MCP |
| **C9 (어드민)** | Telegram MCP |
| **프로덕션** | Sentry MCP |
| **A0 (디자인 시스템)** | Figma MCP (Remote) |
| **B2 (디자인 기반)** | Figma MCP (검증용) |

---

## Claude Code 설정 예시

```json
// ~/.claude/settings.json 또는 프로젝트 .claude/settings.json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "supabase": {
      "command": "npx",
      "args": ["-y", "supabase-mcp-server"],
      "env": {
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/mcp-server-playwright"]
    }
  }
}
```
