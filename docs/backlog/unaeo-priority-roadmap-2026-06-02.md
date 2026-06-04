# 우나어 운영 지휘판

기준: 2026-06-04 KST  
용도: Codex/Claude Code 병렬 세션의 공통 기준판  
짝 문서: `docs/backlog/unaeo-priority-roadmap-2026-06-02.html`

## 현재 결론

| 구분 | 판정 | 근거 |
|---|---|---|
| 운영 안정성 | PARTIAL | Cafe/Prewarm/Gate2는 성공. 다만 BotLog에 AUTH_FAILURE/EMAXCONN 과거 흔적과 CONTENT_CURATE 실패가 남아 있음 |
| MAGAZINE/JOB 봇 engagement 차단 | PASS | `e01ed14` 이후 MAGAZINE/JOB 신규 bot comment/like 0건, STORY/HUMOR/LIFE2 bot comment는 계속 발생 |
| SHEET v1.5 댓글 품질 | 검증 대기 | `d1861dd` 이후 신규 SHEET 글 0건 |
| 속도 | PARTIAL | 목록/로그인/글쓰기 redirect는 HIT/STALE. 상세 첫 MISS는 계속 병목 후보 |
| 측정 | PARTIAL | `post_cta_shown`, `kakao_button_click`, PostView 1건 확인. click/share/scrap/comment_create는 아직 실제 고객 이벤트 부족 |
| SEO/Lighthouse | PASS | Gate2 Lighthouse success. robots/sitemap 정상 |

## 1. 완료됨

| 작업 | 상태 | 다음 액션 | 트리거/PASS 기준 |
|---|---|---|---|
| USER Wave Engine v2 | 완료 | 없음 | wave1~5 E2E PASS |
| USER wave anchor 반복 방지 | 완료 | 없음 | 재검증 anchor 반복 0건 |
| seed bot 글쓰기 retired | 완료 | 없음 | 신규 seed bot 글 생성 없음 |
| P1-1B AZ/BA LIFE2 | 종료 | 없음 | seed post retired로 검증 대상 없음 |
| curator suffix 닉네임 재발 방지 | 완료 | 없음 | suffix 계정 0건 |
| PostCTA 가입/앱 설치 CTA | 완료 | 없음 | 게시글/매거진 ActionBar 아래 CTA 배포 |
| PostCTA/홈 chip 가+ 반응 | 완료 | 없음 | 창업자 눈검수 완료 |
| 비회원 댓글 UX v1 | 완료 | 운영 E2E 선택 | textarea 우선, 닉네임/번호 단계형 노출, 성공 후 가입 유도 |
| Prewarm Detail Pages | 완료 | 없음 | schedule success 2회 이상 |
| MAGAZINE/JOB 봇 engagement 차단 | 완료 | 신규 batch 관찰만 | MAGAZINE/JOB 신규 bot comment/like 0건 |
| EventLog 측정 v1 | 배포 완료 | 실제 이벤트 축적 관찰 | `post_cta_shown`, `kakao_button_click`, PostView 기록 확인 |
| Lighthouse/SEO Gate2 | 완료 | 없음 | Gate2 `QA_ALL_PASSED=true` |

## 2. 배포 완료, 적용 확인만 남음

| 우선순위 | 작업 | 상태 | 다음 액션 | 트리거/PASS 기준 |
|---:|---|---|---|---|
| 1 | SHEET v1.5 신규 댓글 운영 검증 | 배포 완료, 신규 글 대기 | 다음 SHEET 게시 후 봇댓글 전문 확인 | source-only fact 0건, anchor 3회 반복 0건 |
| 2 | Agent DB 포화 재발 방지 | PARTIAL | Cafe/Sheet/Seed 2~3회 추가 관찰 | EMAXCONN/timeout 없음 또는 retry 후 success |
| 3 | Ops Daily Report 자동 스케줄 | 수동 success, schedule 대기 | 다음 08:30 KST 자동 실행 확인 | summary/artifact 정상 생성 |
| 4 | EventLog 전환 측정 | 일부 기록 확인 | 실제 고객 이벤트 축적 대기 | post_cta_clicked/share/scrap/comment_create 기록 발생 |
| 5 | 비회원 댓글 UX 실제 E2E | 배포 완료 | 비회원 모바일에서 실제 댓글 작성은 창업자 승인 후 | 댓글 등록 → 가입 유도 카드 정상 |
| 6 | 카카오 가입 시작 속도 | 코드상 내부 지연 없음 | 실제 클릭 체감 확인 | 클릭 직후 `/api/login/kakao` 이동 |
| 7 | 글쓰기 진입 속도 | 기본 redirect 빠름 | 로그인 상태 체감 확인 필요 | editor 진입 지연 완화 |

## 3. 지금 바로 할 수 있음

| 우선순위 | 작업 | 상태 | 다음 액션 | PASS 기준 |
|---:|---|---|---|---|
| 1 | Cafe/Sheet 최신 run 완료 확인 | 가능 | 진행 중 run 종료 여부 확인 | success + EMAXCONN 없음 |
| 2 | SHEET 신규 글 유무 확인 | 가능 | DB read-only 재조회 | 신규 글 있으면 댓글 품질 분석 |
| 3 | `/magazine`, `/jobs`, 상세 속도 재측정 | 가능 | 운영 curl 반복 측정 | 기본 URL HIT/STALE, 상세 병목 분리 |
| 4 | 글쓰기 속도 2차 진단 | 가능 | editor chunk, draft API, upload, submit action 분리 | 안전한 개선안 확정 |
| 5 | EventLog click 유실 원인 진단 | 가능 | CTA click, Kakao click, sendBeacon/redirect 경로 확인 | 유실 원인 또는 “데이터 부족” 판정 |
| 6 | CONTENT_CURATE 실패 원인 분류 | 가능 | BotLog skipReason 집계 | 진짜 장애와 의도된 skip 분리 |
| 7 | 운영 리포트 v2 설계 | 가능 | BotLog/스크래퍼/댓글 품질 요약 범위 확정 | 매일 볼 수 있는 리포트 포맷 |
| 8 | Search Advisor 점검 준비 | 가능 | sitemap/canonical/meta 상태 정리 | 수동 Search Advisor 확인 항목 도출 |

## 4. 백로그 — 고객 임팩트/리텐션 기준 우선순위

| 우선순위 | 작업 | 상태 | 다음 액션 | PASS 기준 |
|---:|---|---|---|---|
| 1 | 온보딩 임시 닉네임 `user_` 통과 문제 | 중요 | 자동 닉네임과 정규식 충돌 해결안 설계 | 가입 step1 이탈 감소 |
| 2 | 게시글 상세 첫 요청 MISS 비용 절감 | 중요 | 상세 DB/API/댓글/추천글 비용 분리 | 상세 TTFB 안정 감소 |
| 3 | 첫 활동 유도 강화 | 중요 | 가입 직후 댓글/공감/저장 유도 설계 | 첫 활동률 상승 |
| 4 | 비회원 댓글 → 가입 전환 측정 | 중요 | 댓글 성공 후 가입 카드 이벤트 분석 | 가입 전환율 확인 |
| 5 | 비회원 readPercent 측정 | 백로그 | 익명 식별자 설계 | 비회원 읽기 깊이 기록 |
| 6 | 글쓰기 UX/속도 2차 | 중요 | 에디터/이미지/등록 action 개선 | 글쓰기 이탈 감소 |
| 7 | SHEET 순수 hallucination 방지 v2 | 보류 | 본문/sc 모두 없는 창작 사례 축적 | 창작성 이상댓글 감소 |
| 8 | SHEET 말투/어미 반복 개선 v2 | 보류 | 반복 어미/상투구 검출 설계 | 동일 말투 반복 감소 |
| 9 | 이미지/초단문 글 댓글 정책 강화 | 관찰 | skip 증가/이상 댓글 재발 시 조정 | 이상 댓글보다 skip 우선 |
| 10 | 운영 리포트 자동화 v2 | 가능 | sourceSite 품질, failed/partial, 댓글 품질 포함 | 매일 운영 판단 가능 |
| 11 | SEO/Search Advisor 운영 점검 | 가능 | 색인/메타/중복 URL 점검 | 검색 노출 오류 감소 |
| 12 | TWA 첫 진입 A/B 테스트 | 백로그 | 지표/분기 방식 설계 | 가입/재방문 개선 |
| 13 | A/B 테스트 어드민 | 백로그 | 실험 모델/히스토리 설계 | 실험 누락 방지 |
| 14 | 댓글 per-user cache 분리 | 성능 백로그 | 댓글 목록/개인 상태 분리 | 인기글 DB 부하 감소 |
| 15 | 페르소나 2차 정비 | 후순위 | STORY 편중/성별/중복 정리 | 장기 품질 개선 |

## 5. 제외/무시

| 항목 | 상태 | 이유 |
|---|---|---|
| 카카오 공유 P0 | 제외 | 사용자 지시로 우선순위 계산 제외 |
| 홈 편성 수동 조정 MVP | 제외 | 사용자 지시로 제외 |
| seed bot 신규 글쓰기 | 종료/제외 | `9c98ad7` retired |
| P1-1B AZ/BA 신규 글 검증 | 종료 | seed post가 없어 검증 대상 없음 |
| 기존 어색 댓글 삭제/숨김 | 제외 | 신규 유입 차단이 우선, 과거 데이터 삭제는 별도 정책 필요 |
| STORY 편중/성별 분포/중복 페르소나 | 후순위 | 즉시 고객 임팩트 낮음 |

## 병렬 세션 운영 전략

Antigravity 창을 여러 개 쓰는 것은 가능하다. 단, 같은 폴더를 두 세션이 동시에 수정하면 충돌 위험이 크다.  
권장 방식은 `git worktree`로 작업 폴더를 분리하는 것이다.

| 세션 | 역할 | 허용 파일 | 금지 파일 | 우선 업무 |
|---|---|---|---|---|
| 세션 A | 운영/Agent/댓글 품질 | `agents/**`, `.github/workflows/**`, 운영 리포트 문서 | `src/components/**`, 일반 UI, 제품 UX | Cafe/Sheet run, MAG/JOB 차단 관찰, SHEET v1.5 검증, 리포트 v2 |
| 세션 B | 제품/속도/리텐션 | `src/app/**`, `src/components/**`, `src/lib/**`, `docs/analysis/**` | `agents/**`, workflow, 댓글 generator | 속도 2차, 글쓰기, PostCTA/EventLog, 리텐션 UX |
| Data 세션 | 분석 전용 | read-only DB/EventLog/BotLog, `docs/analysis/**` | 코드 수정, DB write, workflow | 고객 행동, 전환, sourceSite 품질, 리포트 설계 |

## 세션 시작 프롬프트 템플릿

```text
너는 [세션 A/B/Data] 담당이다.
현재 목표:
- ...

허용 파일:
- ...

금지:
- git add .
- git add -A
- DB write
- 다른 세션 파일 수정
- 허용 파일 밖 수정

먼저 할 일:
1. git status --short --branch
2. 현재 브랜치/커밋 보고
3. 수정 예정 파일 보고
4. read-only 진단
5. 구현 필요 시 범위와 검증 방법 보고

완료 보고:
- 변경 파일
- 실행한 검증
- 운영 QA 결과
- 충돌 가능성
- 다음 액션
```

## 커밋 안전 규칙

```bash
git status --short --branch
git diff --name-only
git diff --cached --name-only
```

- `git add .` 금지.
- `git add -A` 금지.
- 반드시 명시 파일만 `git add`.
- 커밋 전 staged 파일 목록 보고.
- 다른 세션이 수정 중인 파일이 있으면 중단.

## dirty 파일 판단표

| 파일/경로 | 현재 판단 | 처리 |
|---|---|---|
| `docs/backlog/unaeo-priority-roadmap-2026-06-02.html` | 이번 goal 대상 | 최신화 후 커밋 후보 |
| `docs/backlog/unaeo-priority-roadmap-2026-06-02.md` | 이번 goal 대상 | 신규 기준판, 커밋 후보 |
| `docs/analysis/customer-behavior-2026-06.md` | 분석 자산 후보 | Data 세션 검토 후 커밋 여부 결정 |
| `agents/scripts/_*.ts` | 일회성 read-only 진단 스크립트 | 삭제 후보. 지금 삭제하지 않음 |
