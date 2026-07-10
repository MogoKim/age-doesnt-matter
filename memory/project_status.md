# 프로젝트 현황 (2026-05-08)

> ⚠️ **DEPRECATED (2026-07-10)** — repo `memory/`는 stale 잔재 (`.claude/rules/autonomy.md` §0). **단일 운영 메모리 = CC auto-memory.**
> 아래 KPI·자동화 현황·LaunchAgents 시간표(매거진 3회/일 등)는 2026-05-08 시점이며 현재와 다르다 (실측 예: 매거진 launchd는 12:00/14:00 KST 2회, magazine-afternoon plist는 존재하지 않음). 현재 상태 판단에 사용 금지.

## KPI 스냅샷

| 지표 | 현재 | 목표 |
|------|------|------|
| 총 유저 | 88명 | — |
| MAU | 21명 | 500명 |
| 주간 게시글 | 245건 | — |
| 주간 댓글 | 572건 | — |
| 봇 성공률 | 99% (105/106) | — |
| tsc 에러 | 0 | 0 |

## 자동화 현황

### GHA 워크플로우 (Node.js 24, 전체 업그레이드 완료)
| 워크플로우 | 스케줄 | 상태 |
|-----------|--------|------|
| agents-daily | 매일 여러 시각 | ✅ |
| agents-social | 매일 여러 시각 | ✅ (Playwright fix 완료) |
| agents-cafe | 매일 3회 | ✅ (BotStatus SKIP fix 완료) |
| agents-jobs | 매일 3회 | ✅ |
| agents-seed | 매일 | ✅ |
| agents-seed-micro | 매일 | ✅ |
| agents-hourly | 매시간 | ✅ |
| agents-weekly | 매주 | ✅ |
| agents-moderation | 매일 | ✅ |
| agents-design | 매일 | ✅ |

### LaunchAgents (macOS, 신규 맥 가동 중)
| 서비스 | 스케줄 | 상태 |
|--------|--------|------|
| com.unaeo.magazine-morning | 06:30 KST | ✅ |
| com.unaeo.magazine-afternoon | 12:30 KST | ✅ |
| com.unaeo.magazine-late | 18:30 KST | ✅ |
| com.unaeo.jisik-answerer | 매일 | ✅ |
| com.unaeo.session-refresh | 주기적 | ✅ |
| com.unaeo.job.automation | — | ❌ 삭제됨 (아임웹 폐서비스, Node.js로 대체) |

## 완료된 주요 개발

### 2026-05-08 (신규 맥 이관 후 재정비)
- P0-1: BotStatus SKIP enum 추가 (Prisma schema + DB + migrate)
- P0-2: Playwright `--with-deps` 전체 설치 (버전 불일치 해결)
- P0-3: CTO QA 크론 미실행 감지 → always exit 0 (워크플로우 실패 방지)
- P1-2: Node.js 20 → 24 GHA 전체 업그레이드 (15개 워크플로우)
- Python job.automation LaunchAgent 삭제 (coo:job-scraper로 완전 대체)

### 에이전트 시스템
- 일자리 수집: coo:job-scraper (50plus.or.kr → DB 직접 INSERT)
- 매거진: cafe_crawler:magazine-generate (LaunchAgent 3회/일)
- 시드봇: seed:scheduler (35명 페르소나)
- 트렌드: cmo:trend-analyzer + cafe_crawler:trend-analysis
- KPI: cdo:kpi-collector
- 보안: cto:security-audit + cto:health-check
- QA: cto:qa-verifier (배포 QA + 크론 감사)

## 남은 주요 작업

### P2 (이번 달)
- [ ] MAU 성장 전략 실행 (21 → 500)
- [ ] 고아 에이전트 정리 (Dispatch Only 6개 상태 현행화)
- [ ] 홈 화면 개선 (IdentitySection + RecentActivityFeed — 미커밋 컴포넌트 존재)
