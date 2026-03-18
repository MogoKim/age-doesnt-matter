# 우리 나이가 어때서 — 자체 플랫폼 PRD (Final v4.0)

# Part D. AI 에이전트 운영 시스템

> v5.0 | 2026.03.16 — 헌법 실제 내용 동기화 (NORTH_STAR 기반) + Phase 1 KPI 반영 + automation_status LOCKED

---

## D1. 아키텍처

```
[창업자] ← 텔레그램 알림 + 어드민 대시보드만 확인
    │
[🏛️ CEO 에이전트] ← 회사 헌법
    │
    ├── 🔧 CTO ← DevOps봇, 모니터링봇
    ├── 📢 CMO ← SEO봇, SNS봇(스레드), 트렌드봇
    ├── 🎯 CPO ← UX분석봇, 기능제안봇
    ├── 💰 CFO ← 비용추적봇, 수익분석봇
    ├── ⚙️ COO ← 일자리봇, 유머봇, 이야기봇, 모더레이션봇
    ├── 📊 CDO ← 데이터봇, KPI봇
    └── 👥 알바생팀 ← 시드 유저봇 5종 (초기 커뮤니티 활성화)
```

**기술 스택**: Claude API `claude-sonnet-4-6` (전략 판단) + `claude-haiku-4-5` (빠른 작업) + MCP (외부 연결 표준) + GitHub Actions Cron (스케줄) + Supabase (DB) + Vercel (호스팅) + **CLAUDE.md** (Claude Code 통합 지시사항)

**알림 채널**: ~~Slack~~ → **어드민 대시보드 알림 패널 + 텔레그램 (창업자)**

---

## D2. 회사 헌법

> **정식 파일**: [`agents/core/constitution.yaml`](../../agents/core/constitution.yaml) (Single Source of Truth, 현재 v3.1)
> **사람이 읽는 원본**: [`docs/constitution/NORTH_STAR.md`](../constitution/NORTH_STAR.md) (v3.1)
> **룰 유지 설계**: [`docs/constitution/RULE_MAINTENANCE.md`](../constitution/RULE_MAINTENANCE.md)
>
> **이 PRD에 사본을 두지 않습니다.** 동기화 실패 방지를 위해 항상 위 원본 파일을 참조하세요.
> CEO 에이전트 System Prompt에 constitution.yaml 전문이 주입됩니다. 모든 에이전트는 이 헌법을 기준으로 판단합니다.

### 헌법 핵심 요약 (상세는 원본 파일 참조)

| 영역 | 핵심 내용 |
|:---|:---|
| **Mission** | 50·60대가 다시 사회와 연결되고, 자신만의 속도로 새로운 삶을 시작할 수 있도록 돕는다 |
| **Core Values** | 실용, 따뜻함, 연결, 용기, 존중, 현실성 |
| **ABSOLUTE_ZERO** | 정치·종교·혐오·성인·도박·비방·의학진단 — 예외 없이 즉시 차단 |
| **Phase 1** | 사용자 사이트 + 어드민 완성. automation_status: LOCKED |
| **알림 채널** | 텔레그램 (긴급) + 어드민 대시보드 (중요/정보) |
| **비용 상한** | $50/월 — 초과 시 즉시 차단 + 텔레그램 알림 |
| **DB write** | COO만 가능. 나머지 읽기 전용 |
| **메뉴 구조** | ⭐베스트, 💼내일찾기, 💬사는이야기, ⚡활력충전소, 📖매거진 |
| **글쓰기 권한** | 사는이야기·활력충전소: 사용자(🌱+) / 일자리·매거진: 운영자만 |

---

## D3. C-Level 에이전트

### 🔧 CTO — 기술/안정성

| 태스크 | 주기 | 액션 | MCP |
|:---|:---|:---|:---|
| 헬스체크 | 매 1시간 | Vercel+Supabase 상태 → 이상 시 어드민 알림 | supabase, vercel |
| 에러 모니터링 | 실시간 | 500에러 감지 → GitHub Issue 자동 생성 | github |
| 성능 리포트 | 매일 23시 | Core Web Vitals + API 응답시간 → 어드민 리포트 | analytics |
| 보안 스캔 | 매주 월 | `npm audit` → 취약점 리포트 | github |
| 배포 후 검증 | main merge 시 | 스모크 테스트 (주요 페이지+API) | vercel |

### 📢 CMO — 마케팅/트래픽

| 태스크 | 주기 | 액션 | MCP |
|:---|:---|:---|:---|
| 트렌드 분석 | 매일 10시 | 네이버 트렌드 + 검색어 → COO에 콘텐츠 주제 전달 | analytics |
| SEO 점검 | 매주 수 | 사이트맵+메타+검색노출 → 리포트 | analytics |
| 유입 분석 | 매일 22시 | 유입 채널별 성과 → 리포트 | analytics |
| 스레드 운영 | 기존 스케줄 | 콘텐츠 생성+발행 | — |
| 검색어 갭 | 매주 | search_empty 분석 → 매거진 기획 제안 | supabase |

### 🎯 CPO — 프로덕트/UX

| 태스크 | 주기 | MCP |
|:---|:---|:---|
| UX 이슈 발견 (이탈률 높은 페이지) | 매일 11시 | supabase |
| 기능 사용률 분석 | 매주 금 | supabase |
| 등급 전환 분석 (새싹→단골 병목) | 매주 | supabase |
| 신규 기능 제안 (**창업자 승인 필수**) | 데이터 기반 | — |
| 접근성 감사 (Lighthouse) | 격주 | — |

### 💰 CFO — 재무/비용

| 태스크 | 주기 | MCP |
|:---|:---|:---|
| 일일 비용 체크 (Vercel+Supabase+R2+API) | 매일 23시 | supabase |
| CPS 수익 집계 | 매일 23시 | supabase |
| 광고 수익 집계 | 매일 23시 | supabase |
| 예산 경고 ($40 도달 시) | 실시간 | 텔레그램 |
| 월간 결산 | 매월 1일 | — |

### ⚙️ COO — 운영/콘텐츠

| 태스크 | 주기 | MCP |
|:---|:---|:---|
| 봇 오케스트레이션 (일자리/유머/이야기) | Cron 스케줄 | supabase |
| 콘텐츠 검수 (AI 필터 걸린 건 2차 판단) | 봇 실행 후 | supabase |
| 모더레이션 (신고 3회 자동숨김 + 판단) | 실시간 | supabase |
| 수다방 발제 (CMO 트렌드 반영) | 매주 월 9시 | supabase |
| 에디터스 픽 후보 (**창업자 승인 후 핀**) | 매일 14시 | supabase |
| **알바생팀 관리** (시드 콘텐츠 품질/빈도) | 매일 | supabase |

### 📊 CDO — 데이터/분석

| 태스크 | 주기 | MCP |
|:---|:---|:---|
| 데일리 KPI 집계 | 매일 22시 | supabase |
| 위클리 딥다이브 (코호트+리텐션+등급) | 매주 월 9시 | supabase |
| 이상 감지 (DAU 30%↓ 등) | 실시간 | 텔레그램 |
| 월간 대시보드 | 매월 1일 | supabase |

---

## D4. 👥 알바생 시드 콘텐츠 에이전트 (핵심 신규)

> **목적**: 초기 서비스에 사용자가 없으므로, AI "알바생"이 실제 5060 사용자처럼 글/댓글을 작성하여 **커뮤니티가 활발한 것처럼** 운영. 실제 UGC가 충분해지면 점진적으로 축소.

### 페르소나 5종

| ID | 닉네임 | 나이/성별 | 성격 | 주 게시판 | 글 스타일 |
|:---|:---|:---|:---|:---|:---|
| **A** | 영숙이맘 | 58/여 | 따뜻, 수다 많음 | 사는이야기 | 일상 수다, 손주 자랑, 시장 이야기 |
| **B** | 은퇴신사 | 63/남 | 차분, 정보형 | 사는이야기 | 퇴직 후 생활, 건강, 재테크 |
| **C** | 웃음보 | 55/여 | 유쾌, 밝음 | 활력충전소 댓글 | 짧은 리액션, 이모지 多, 유머 댓글 |
| **D** | 꼼꼼이 | 60/여 | 꼼꼼, 질문 多 | 일자리 댓글 | "이거 나이 제한 있나요?" 류 질문 |
| **E** | 동네언니 | 52/여 | 다정, 공감 잘 | 수다방 | 발제글에 긴 댓글, 공감, 응원 |

### 카테고리별 콘텐츠 패턴

| 게시판 | 글 유형 | 톤 | 예시 |
|:---|:---|:---|:---|
| **사는이야기** | 일상/고민/자랑/건강 | 따뜻, 구어체, 맞춤법 살짝 틀림 | "오늘 시장가서 옥수수 샀는데 세상에 이렇게 맛있을수가" |
| **활력충전소** | **봇이 올린 유머에 댓글만** | 순수 리액션 | "ㅋㅋㅋ 너무 웃겨요~😂" "아 이거 우리 남편이네 ㅎ" |
| **수다방** | 발제글에 의견 댓글 | 솔직, 공감형 | "맞아요 저도 그래요~ 특히 비오는 날은 더 그러더라구요" |
| **일자리** | 공고에 질문 댓글 | 정보 요청형 | "이거 출퇴근 시간이 어떻게 되나요?" |

### 활동 패턴 시뮬레이션

```
[일일 스케줄]
09:00  영숙이맘: 사는이야기 글 1개 + 다른 글에 댓글 2개
10:00  웃음보: 유머글에 댓글 3~4개
11:00  은퇴신사: 사는이야기 글 1개 (정보형)
14:00  동네언니: 수다방 발제에 긴 댓글 1개 + 공감 5개
15:00  꼼꼼이: 일자리 글에 질문 댓글 2개
16:00  영숙이맘: 다른 글에 댓글 2~3개 + 공감 3개
19:00  동네언니: 사는이야기에 댓글 2개
21:00  웃음보: 유머글에 댓글 2개

→ 일일 총: 글 2~3개 + 댓글 15~20개 + 공감 10~15개
```

### 안전장치

| 규칙 | 구현 |
|:---|:---|
| **자연스러움** | 글마다 미세하게 다른 맞춤법, 띄어쓰기, 이모지 패턴 |
| **겹침 방지** | 같은 글에 알바생 2명 이상 댓글 금지 |
| **일관성** | 각 페르소나의 관심사/톤은 항상 일정 |
| **축소 계획** | UGC 비율 50% 돌파 시 알바생 빈도 50% 감소 → 70% 시 중단 |
| **구분 표시** | DB에 `source: SEED`로 기록 (외부 노출 안 됨) |
| **실제 사용자와 구분** | 어드민에서 알바생 콘텐츠 별도 필터 가능 |

---

## D5. 문제정의→가설→액션→회고 사이클

```
[CDO 이상 감지] "DAU 3일 연속 하락"
    ↓
[CEO 모닝 사이클에서 의제]
    ↓
[문제정의] CEO가 CTO/CMO/CPO/COO/CDO 소집
  CDO: "DAU 342→310→285. 검색 유입 30%↓"
  CMO: "네이버 검색 알고리즘 변경"
  CPO: "일자리 상세 이탈률 60%↑"
    ↓
[가설] CEO 정리
  H1: "네이버 SEO 순위 하락"
  H2: "일자리 상세 UX 문제"
    ↓
[액션 배정]
  CMO → SEO 메타태그 최적화
  CPO → 이탈 지점 히트맵 분석
  CTO → 페이지 성능 확인
    ↓
[실행] 각 에이전트 수행
    ↓
[회고] 48시간 후 CEO 주도
  결과 정리 → 다음 액션 또는 **기능 개선 제안 → 창업자 승인 → Claude Code 구현**
```

모든 미팅/사이클은 DB `AgentMeeting` 테이블에 기록:

| 컬럼 | 타입 |
|:---|:---|
| type | MORNING / PROBLEM / WEEKLY / RETRO |
| participants | String[] |
| agenda, discussion, conclusion | Text/JSON |
| actions | JSON [{assignee, task, deadline}] |
| status | OPEN / IN_PROGRESS / CLOSED |

---

## D6. MCP 서버

| MCP 서버 | 연결 | 에이전트 용도 |
|:---|:---|:---|
| **supabase-mcp** | PostgreSQL | DB 읽기/쓰기 (COO만 Post write) |
| **github-mcp** | GitHub Repo | Issue 생성, PR 확인, Actions 로그 |
| **analytics-mcp** | EventLog 집계 | DAU/MAU, 유입, 전환 계산 |
| **r2-mcp** | Cloudflare R2 | 이미지 업로드, 스토리지 사용량 |

**권한**: COO만 DB write(Post, BotLog). 나머지는 **읽기 전용**.

---

## D7. Cron 스케줄

| 시간 | 에이전트/태스크 |
|:---|:---|
| 04:00 | COO: 일자리봇 ① |
| 08:00 | COO: 일자리봇 ② |
| 09:00 | **CEO: 모닝 사이클** (전체 KPI + 문제 감지) |
| 09:00 | COO: 유머봇 ① + **알바생 A,C 활동** |
| 10:00 | CMO: 트렌드 분석 / COO: 이야기봇 ① + 알바생 B |
| 11:00 | CPO: UX 분석 |
| 12:00 | COO: 일자리봇 ③ |
| 14:00 | COO: 유머봇 ② + 에디터스 픽 + **알바생 D,E 활동** |
| 15:00 | COO: 이야기봇 ② + 알바생 꼼꼼이 |
| 16:00 | COO: 일자리봇 ④ + **알바생 A 추가 댓글** |
| 18:00 | COO: 유머봇 ③ |
| 19:00 | COO: 이야기봇 ③ + **알바생 E 추가** |
| 19:37 | CMO: 스레드 포스팅 |
| 20:00 | COO: 일자리봇 ⑤ |
| 21:00 | **알바생 웃음보 마지막 활동** |
| 22:00 | CDO: 데일리 분석 / CMO: 유입 분석 |
| 23:00 | CFO: 비용 체크 / CTO: 성능 리포트 |
| 24:00 | COO: 일자리봇 ⑥ |
| 매1시간 | CTO: 헬스체크 |
| 매주 월 | CEO: 주간 전략 미팅 |
| 매월 1일 | CFO: 월간 결산 / CDO: 월간 대시보드 |

---

## D8. 알림 체계 (Slack 대체)

| 긴급도 | 채널 | 내용 |
|:---|:---|:---|
| 🔴 긴급 | **텔레그램** (창업자) | 서버장애, 비용초과, 보안이슈 |
| 🟠 중요 | **어드민 대시보드 알림 패널** | 신고급증, 봇장애, KPI이상 |
| 🟢 정보 | **어드민 에이전트 로그** | 모닝리포트, 성능, 유입, 비용, 미팅 |
| ⚪ 승인 | **어드민 승인 요청 큐** | 기능제안, 에디터스픽, 진화제안 |

---

## D9. 스킬 시스템 (에이전트 자체 진화)

에이전트가 반복 작업에서 패턴을 발견하면 **스킬**을 제안:

```
[스킬 제안 프로세스]
1. 에이전트가 반복 패턴 감지
   → "매주 '검색어 갭 분석' 후 같은 형식으로 매거진 주제 제안하고 있음"
2. 스킬 정의서 자동 생성
   → skill_name: "search_gap_to_magazine"
   → input: search_empty 키워드 목록
   → output: 매거진 주제 + 제목 초안 + 타겟 카테고리
3. 어드민 '진화 제안' 큐에 등록
4. 창업자 승인
5. Claude Code로 스킬 구현 → 에이전트에 장착
```

---

## D10. 안전장치

| # | 규칙 |
|:-:|:---|
| 1 | UI 코드 변경 금지 — 제안만, 구현은 창업자 승인 + Claude Code |
| 2 | DB 스키마 불변 — ALTER TABLE 에이전트 권한 밖 |
| 3 | 비용 상한 $50/월 — 초과 시 자동 차단 + 알림 |
| 4 | 파괴적 액션 로그 필수 + 텔레그램 알림 |
| 5 | 긴급 중지 — 어드민에서 1클릭 전체 Cron 정지 |
| 6 | 에이전트가 에이전트를 만들 수 없음 — 스킬 제안만 |

---

## D11. 구현 구조 (TypeScript)

> 웹(Next.js)과 동일한 TypeScript로 통일. 모노레포 또는 `/agents` 독립 패키지.

```
/agents
├── CLAUDE.md                     # Claude Code 전용 지시사항 (D12 참조)
├── package.json                  # ts-node, @anthropic-ai/sdk, @modelcontextprotocol/sdk
├── tsconfig.json
│
├── core/
│   ├── agent.ts                  # BaseAgent 클래스 (Claude API 통신)
│   ├── constitution.yaml         # 회사 헌법 (D2)
│   ├── mcp-client.ts             # MCP 연결 (supabase/github/analytics/r2)
│   ├── notifier.ts               # 텔레그램 + 어드민 DB 알림
│   └── types.ts                  # 공통 타입 (AgentResult, MCPContext 등)
│
├── ceo/
│   ├── morning-cycle.ts          # 모닝 사이클 (KPI 수집 → 문제감지 → 에이전트 소집)
│   └── meeting-manager.ts        # 미팅 오케스트레이터 (AgentMeeting DB 기록)
│
├── cto/
│   ├── health-check.ts           # Vercel + Supabase 상태 체크
│   ├── error-monitor.ts          # 500에러 감지 → GitHub Issue 자동 생성
│   └── security-scan.ts          # npm audit → 취약점 리포트
│
├── cmo/
│   ├── trend-analyzer.ts         # 네이버 트렌드 분석 → COO에 주제 전달
│   ├── seo-checker.ts            # 사이트맵 + 메타 + 검색노출
│   └── thread-poster.ts          # 스레드 콘텐츠 생성 + 발행
│
├── cpo/
│   ├── ux-analyzer.ts            # 이탈률 높은 페이지 감지
│   └── feature-proposer.ts       # 기능 제안 → AdminQueue 등록
│
├── cfo/
│   ├── cost-tracker.ts           # Vercel+Supabase+R2+API 비용 집계
│   └── revenue-analyzer.ts       # CPS + 광고 수익 집계
│
├── coo/
│   ├── bot-orchestrator.ts       # 일자리/유머/이야기봇 Cron 관리
│   ├── moderator.ts              # AI 필터 2차 판단 + 신고 처리
│   └── content-scheduler.ts      # 에디터스픽 후보 + 수다방 발제
│
├── cdo/
│   ├── kpi-collector.ts          # 데일리 KPI 집계 + DB 저장
│   └── anomaly-detector.ts       # DAU 급락 등 이상 감지 → 즉시 알림
│
├── seed/                         # 알바생 시드 콘텐츠 에이전트
│   ├── personas.yaml             # 5종 페르소나 정의 (D4)
│   ├── generator.ts              # Claude API로 자연스러운 글/댓글 생성
│   ├── scheduler.ts              # 일일 활동 패턴 스케줄러
│   └── templates/
│       ├── story.yaml            # 사는이야기 템플릿
│       ├── humor.yaml            # 활력충전소 댓글 템플릿
│       └── jobs.yaml             # 일자리 질문 댓글 템플릿
│
├── skills/
│   ├── registry.ts               # 스킬 레지스트리 (이름→실행함수 매핑)
│   └── index.ts                  # 스킬 목록 export
│
├── mcp-servers/
│   ├── supabase-mcp.ts           # PostgreSQL 읽기/쓰기 (COO만 write)
│   ├── github-mcp.ts             # Issue 생성, Actions 로그 조회
│   ├── analytics-mcp.ts          # EventLog 집계 (DAU/MAU/유입/전환)
│   └── r2-mcp.ts                 # Cloudflare R2 이미지 업로드
│
└── cron/
    ├── schedules.yaml            # Cron 스케줄 정의 (D7)
    └── runner.ts                 # GitHub Actions 진입점
```

### BaseAgent 패턴 (TypeScript)

```typescript
// core/agent.ts
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { MCPClient } from './mcp-client'
import { notifyAdmin, notifyTelegram } from './notifier'

const constitution = readFileSync('./core/constitution.yaml', 'utf-8')

export abstract class BaseAgent {
  protected client: Anthropic
  protected model: string
  protected mcp: MCPClient

  constructor(useHeavyModel = false) {
    this.client = new Anthropic()
    this.model = useHeavyModel
      ? process.env.CLAUDE_MODEL_HEAVY!   // claude-sonnet-4-6
      : process.env.CLAUDE_MODEL_LIGHT!   // claude-haiku-4-5
    this.mcp = new MCPClient()
  }

  protected getSystemPrompt(role: string, tasks: string): string {
    return `
당신은 "우리 나이가 어때서" 커뮤니티의 ${role}입니다.
아래 회사 헌법을 항상 준수하세요:

${constitution}

당신의 역할: ${role}
담당 업무: ${tasks}

규칙:
- 모든 판단은 회사 헌법 기준으로
- 창업자 승인 필요 사항은 AdminQueue에 등록만
- 모든 액션은 AgentLog에 기록
- 불확실한 경우 실행 금지, 승인 요청
    `
  }

  abstract run(): Promise<void>
}
```

---

## D12. CLAUDE.md 설계 (Claude Code 통합)

> CLAUDE.md는 Claude Code가 프로젝트 작업 시 **항상 자동으로 참조**하는 지시사항 문서.
> 루트(웹사이트용)와 `/agents`(에이전트용) 2개 배치.

### 루트 CLAUDE.md — 웹사이트 개발용

```markdown
# 우리 나이가 어때서 — Claude Code 지시사항

## 프로젝트 개요
- 5060 커뮤니티 플랫폼 (age-doesnt-matter.com)
- Next.js 14 App Router + TypeScript + Supabase + Vercel

## 기술 스택 규칙
- 컴포넌트: PascalCase / 파일: kebab-case / CSS: camelCase
- DB 접근: Prisma만 (Raw SQL 절대 금지)
- 인증: NextAuth v5 카카오 전용
- CSS: CSS Modules + CSS Variables (디자인 토큰만 사용)

## 시니어 친화 UI 원칙 (절대 준수)
- 터치 타겟: 최소 52×52px
- 폰트 최소: 17px (caption 14px)
- 브랜드 컬러: --color-primary (#FF6F61)
- 버튼: 높이 52px (모바일), 48px (데스크탑)
- 모달: 모바일=풀스크린 시트 / 데스크탑=중앙 팝업

## 코딩 원칙
- TypeScript strict 모드 (any 사용 금지)
- 서버 컴포넌트 기본, 'use client' 최소화
- 이미지: next/image 필수 (WebP + lazy load)
- 에러: AppError / NotFoundError / ForbiddenError 커스텀 클래스

## 배포 전 체크리스트
- [ ] tsc --noEmit 통과
- [ ] ESLint 통과
- [ ] 모바일 767px 반응형 확인
- [ ] 터치 타겟 52px 이상 확인
- [ ] 광고 슬롯 "광고" 라벨 확인
```

### /agents/CLAUDE.md — 에이전트 시스템용

```markdown
# 우리 나이가 어때서 — 에이전트 시스템 지시사항

## 에이전트 작성 규칙
- 모든 에이전트는 BaseAgent 클래스 상속 (core/agent.ts)
- 모델 선택: 복잡한 판단=CLAUDE_MODEL_HEAVY / 단순·빠른=CLAUDE_MODEL_LIGHT
- constitution.yaml 항상 System Prompt에 주입
- 모든 액션은 AgentLog 테이블에 기록

## 안전 규칙 (절대 준수)
- DB write는 COO만 가능 (나머지 읽기 전용)
- 창업자 승인 필요 사항 → AdminQueue INSERT만, 직접 실행 금지
- 비용 누적 $40 초과 시 즉시 중단 + 텔레그램 알림
- 에이전트가 직접 에이전트 생성 금지

## MCP 권한
- supabase-mcp: SELECT 자유 / INSERT·UPDATE는 COO만
- github-mcp: Issue 생성·PR 조회만 (push 절대 금지)
- analytics-mcp: 읽기 전용
- r2-mcp: 이미지 업로드만

## 스킬 추가 프로세스
1. 에이전트가 반복 패턴 감지
2. skills/registry.ts에 스킬 정의서 초안 작성
3. AdminQueue에 '진화 제안' 등록
4. 창업자 승인 후 Claude Code가 구현
```

---

## D13. 에이전트 모델 사용 전략

| 에이전트 | 모델 | 이유 |
|:---|:---|:---|
| CEO 모닝 사이클 | `claude-sonnet-4-6` | 복잡한 다중 KPI 종합 판단 |
| 미팅 매니저 (문제정의) | `claude-sonnet-4-6` | 맥락 길고 전략적 |
| CTO 헬스체크 | `claude-haiku-4-5` | 단순 상태 확인 |
| CMO 트렌드 분석 | `claude-sonnet-4-6` | 트렌드 해석 + 전략 제안 |
| CPO UX 분석 | `claude-sonnet-4-6` | 데이터 해석 + 기능 제안 |
| CFO 비용 집계 | `claude-haiku-4-5` | 수치 계산, 단순 |
| COO 모더레이션 | `claude-haiku-4-5` | 빠른 콘텐츠 판단 |
| CDO KPI 집계 | `claude-haiku-4-5` | 데이터 집계 단순 |
| 알바생 글 생성 | `claude-haiku-4-5` | 대량 콘텐츠, 비용 효율 |
| 알바생 댓글 생성 | `claude-haiku-4-5` | 짧은 텍스트, 빠름 |

> **비용 예상**: 하루 약 $0.5~1.5 / 월 $15~45 → $50 한도 내 운영 가능

---

**→ Part A: [고객 웹](file:///Users/yanadoo/.gemini/antigravity/brain/2d5a8b27-9e68-40f3-a9d5-d16a995a9858/PRD_Final_A_서비스_고객웹.md)** | **→ Part B: [어드민](file:///Users/yanadoo/.gemini/antigravity/brain/2d5a8b27-9e68-40f3-a9d5-d16a995a9858/PRD_Final_B_어드민_데이터.md)** | **→ Part C: [보안+DevOps](file:///Users/yanadoo/.gemini/antigravity/brain/2d5a8b27-9e68-40f3-a9d5-d16a995a9858/PRD_Final_C_보안_DevOps_QA.md)**
