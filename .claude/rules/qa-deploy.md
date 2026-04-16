---
globs: ["src/components/ad/**", "src/app/layout.tsx", "agents/**/*.ts", ".github/workflows/**"]
description: 배포 QA 규칙 — 광고/에이전트/워크플로우 변경 시 자동 안내
---

# 배포 QA 규칙 (필수, 예외 없음)

## QA 자동 트리거 (요청 없이 자동 실행)

### Layer 0: 코드 편집 후 즉시 (Hook — settings.json)
- Write/Edit으로 `.ts/.tsx` 수정 → `auto-typecheck.sh` 자동 실행
- 타입 에러 발견 시 Claude 대화창에 즉시 표시 (블로킹 없음)

### Layer 2: CI 변경 감지 (dorny/paths-filter — ci.yml)
| 변경 파일 | 실행 QA |
|-----------|---------|
| `src/**`, `public/**` | @smoke E2E (smoke-fast 프로젝트) |
| `src/components/ad/**`, `next.config.js` | @smoke + @ads E2E 추가 |
| `agents/**`, `.github/workflows/agents-*.yml` | cron-links 검증만 |
| `src/app/(admin)/**` | qa-admin E2E |
| `docs/**`, `*.md`, `.claude/**` | QA 스킵 |

### Layer 3: 배포 후 자동 (deployment_status — post-deploy-qa.yml)
- Smoke Test → 광고 렌더링 → **Visual QA (Claude Haiku)** → **Lighthouse CI** → Gate 2 에이전트
- 모든 결과 Slack #qa 자동 보고

### 변경 유형별 QA 매핑
| 변경 | Layer 0 | Layer 2 | Layer 3 |
|------|---------|---------|---------|
| 단어/스타일 수정 | tsc ✅ | @smoke | Smoke+Visual |
| 광고 컴포넌트 | tsc ✅ | @smoke @ads | Smoke+Visual+Lighthouse |
| 에이전트 코드 | tsc ✅ | cron-links | Smoke |
| Prisma 스키마 | tsc ✅ | @smoke | Smoke+Visual |
| docs만 수정 | 스킵 | 스킵 | Smoke |

---

## 모든 코드 변경 시
- `npx tsc --noEmit` 통과 확인
- 변경한 페이지/API 최소 1개 curl/WebFetch 200 확인

## 광고 컴포넌트 변경 시 (src/components/ad/)
- smoke test 필수: `npm run smoke-test -- --url https://age-doesnt-matter.com`
- SSR HTML에 광고 마커 포함 확인 (adsbygoogle 클래스, coupang 배너 URL)
- CSP 도메인 추가 필요 여부 확인 (next.config.js connect-src/script-src/img-src)

## 에이전트 스크립트 변경 시 (agents/)
- 크론 연결 검증 필수: `npx tsx scripts/check-cron-links.ts`
- `.claude/rules/agent-lifecycle.md` 체크리스트 준수 확인
- **새 핸들러 → 워크플로우 case문 추가 확인**
- **새 크론 → cron expression이 KST 의도 시간과 맞는지 확인 (UTC-9)**
- **runner.ts 우회 금지**: 워크플로우에서 직접 `npx tsx agents/파일.ts` 실행하지 말고 반드시 `runner.ts` 통해 실행 (automation_status 체크 보장)

## 워크플로우 변경 시 (.github/workflows/)
- 크론 연결 검증 필수: `npx tsx scripts/check-cron-links.ts`
- runner.ts HANDLERS와 워크플로우 case문 정합성 확인
- `gh workflow list`로 워크플로우 활성화 상태 확인

## 서비스 코드 변경 시 (src/app/(main)/, src/components/, prisma/)
- 어드민 영향도 한 줄 명시 ("어드민 영향: 없음" 또는 구체 내용)

## 배포 후 프로덕션 검증 (커밋+푸시 후)
- `npm run smoke-test -- --url https://age-doesnt-matter.com` 실행
- 에이전트 변경 시: `gh run list --workflow=해당워크플로우.yml --limit=3`으로 최근 실행 확인
- 실패 시 즉시 사용자에게 보고 + 롤백 여부 확인
