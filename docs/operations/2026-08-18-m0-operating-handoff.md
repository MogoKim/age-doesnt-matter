# M0 운영 인수 문서 — 검색 생존 모드

> **작성**: 2026-08-18 13:30 KST · Claude [1] (기존 사이트 실행/검증 담당)
> **기준 커밋**: origin/main = `b0fef1aa` (PR #385 merge 직후)
> **용도**: 다음 세션/다음 에이전트가 맥락 손실 없이 이 국면을 이어받기 위한 **인수 기준 문서**.
>   요약이 아니라 의사결정 기준이다. 여기 적힌 완료/관찰/보류/금지 분류가 단일 진실이며,
>   이 문서와 실측이 어긋나면 **실측을 믿고 이 문서를 정정**하라.

---

## 1. 한 줄 결론

지금 우리는 **"기존 사이트 복구 실험"과 "새 브랜드 전환 준비"를 동시에 관리하는 생존 국면**이다.
검색 복구는 목표가 아니라 **생존 조건**이고, North Star는 **40대 중반~60대 중반 여성이
"나만 이런 게 아니구나"를 느끼고 반복 방문하며 글/댓글을 남기는 커뮤니티**다.

---

## 2. North Star (판단의 뿌리 — 절대 흔들지 않는다)

- DAU 1,600 복구가 최종 목표가 **아니다**. DAU 1만/10만/100만도 숫자만으로는 목표가 아니다.
- 목표는 타깃 여성이 "나만 이런 게 아니구나"를 느끼고 **다시 와서 글과 댓글을 남기는** 것.
  공식 지표: **주간 재방문 참여 유저 수** (`docs/constitution/NORTH_STAR.md`).
- SEO·title rewrite·seoDescription·rescue·원문 품질 gate는 전부 이 목적의 **수단**이다.
- 헷갈리면 묻는다: **"이 작업이 회원이 댓글을 쓰게 만드는 데 기여하는가?"**
- 검색 생존 작업의 상위 목표: DAU 복구가 아니라 **"단순 원문 재게시 사이트가 아니라
  40~60대 여성 커뮤니티 문서를 우리 관점으로 재맥락화한 사이트"라는 신호**를 만드는 것.

---

## 3. 현재 위기 (2026-08-18 창업자 수동 확인 기준)

- **Naver Search Advisor**: 홈/주요 문서가 **수집은 되지만 색인 완료가 안 되는** 상태.
  기술 차단이라기보다 **색인/품질 보류** 가능성이 크다.
- **Google**: 색인 미생성/품질 문제 장기 누적 (sitemap 10,261 URL ↔ googlebot noindex 약 6,465건 모순 별도 관리 — §9 P1).
- **GA4/Naver 트렌드**: 유입 붕괴. 8/18 어드민 실측 — UV 28 (7일 평균 대비 -91%), 신규가입 0,
  WAU 10, D7 재방문 0.5%. **사이트 생존 위기다.**
- 단, **서버가 기술적으로 막힌 문제는 아니다** — production 4경로(/, /community/stories,
  /community/menopause, /api/health/auth) HTTP 200, 일반 robots `index,follow` 유지 실측.
- **증거**: `naver_google/` 폴더 (2026-08-18 09:59~10:05 KST, Naver SA·GSC·GA4 캡처 16장).
  창업자 수동 확인 결과로 취급한다. **수정·이동·커밋 금지. 미추적 상태 그대로 둔다.**

---

## 4. 주요 가설 (우선순위 순 — 확정 아님, 반증 환영)

| 가설 | 상태 |
|---|---|
| SEO title/description 변경이 재평가 트리거가 됐을 가능성 | 관찰 중 |
| 외부 원문 기반 큐레이션의 중복/원본성 부족이 구조적 리스크 | **유력** — P0-3~5가 이걸 줄이는 작업 |
| duplicate description/title 누적이 품질 신호 악화 | 유력 — 신규 발행분 98%가 본문 앞 복사였다(실측) |
| 브랜드명 "우리 나이가 어때서" 대표성 혼선 | 새 브랜드 트랙(Codex [3])에서 다룸 |
| Naver 내부 인덱스/알고리즘 배치 변화 | 통제 불가 — 관찰만 |
| 기술 차단(robots·noindex·canonical·HTTP) | **핵심 원인 가능성 낮음** (전부 실측 정상) |

sitemap ↔ googlebot noindex 모순은 가설이 아니라 **확인된 불일치**이며 별도 P1로 관리한다.

---

## 5. 완료된 작업 (전부 origin/main 반영 + 운영 실측 PASS)

| PR | SHA | 내용 | 운영 실증 |
|---|---|---|---|
| #378 | `9d26de1a` | popular-curator shadow guard | yeowooya 발행 0 유지 |
| #379 | `75218c82` | daily count createdAt·KST (updatedAt 데드락 해소) | limit 정상 리셋 |
| #380 | `13a2dd96` | title rewrite → seoTitle 동기 반영 | HTML `<title>` 반영 확인 |
| #381 | `29c5a704` | source gate `['wgang']` 하드코딩 → PUBLISHABLE 기준 | 5 source applied 실측 |
| #382 | `6c21ff04` | 큐레이션 원문 품질 gate (인물 비방·국적 비하) | 정탐 1건, 오탐 0 |
| #383 | `080ff0c8` | 신규 발행글 seoDescription 고유화 (P0-3) | MODEL_KEEP desc-only 포함 실증 |
| #384 | `cf9655f8` | rejected desc logging (P0-4) | len/preview 로깅 실증 |
| #385 | `b0fef1aa` | MAX_DESC_LENGTH 130→140 완화 | **len=134 applied 즉시 등장** |

그 외 완료:

- **SEO rescue 1차 50건** DB 반영 (2026-08-16) — seoTitle/seoDesc/slug 50/50 유지 지속 확인.
  rollback 백업: scratchpad `seo-rescue-rollback-backup-50-20260816.jsonl`
- **SHEET 의료광고 글 1건** (`cmsxhcuj40005a52yp401vqrt`, 서진성형외과) HIDDEN 처리 —
  sitemap 제외·목록 제외·HTML 광고 콘텐츠 소멸·robots noindex·조회수 정지. R2 이미지는 보존.
  ⚠️ HTTP status는 200(soft-404) — §9 P2 기술 부채
- **2026-08-17~18 통합 감사 PASS** — 발행 실패 0 · slug/canonical 회귀 0 · applied 사실 오류 0
  · validator 실차단 실증(NUMBER_NOT_IN_SOURCE "숫자 10"·BANNED_WORD "어르신")
- **P0-4 관찰 완결** — desc skip 표본 10건: DESC_TOO_LONG 8 (131~140: 5 / 141~160: 3 / 160+: 0)
  + ENTITY 1 + NUMBER 1 (둘 다 표기 변환 오탐 계열)

## 6. 닫은 항목

- **P0-4** (rejected desc logging → 표본 10건 → 130→140 완화 → post-merge runtime PASS). **닫힘.**
  - 단, **141+ 거부 샘플은 자연 발생 시 기록만 계속**한다 (조치 아님).
- **SHEET 광고 개별 글 처리** — 창업자 PASS 선언으로 닫힘 (soft-404는 P2로 분리).

---

## 7. 관찰 중 (조치 없이 데이터만 쌓는다)

| 항목 | 확인 방법 | 다음 확인 |
|---|---|---|
| Naver 색인 회복 | Search Advisor (창업자 수동, `naver_google/` 방식) | 창업자 재량 |
| GSC 색인 생성/미생성 수 변화 | GSC (창업자 수동) | 창업자 재량 |
| 신규 rewrite 글 URL 검사 상태 | GSC URL 검사 (창업자 수동) — **색인 요청 버튼은 누르지 않는다** | 〃 |
| 131~140자 desc의 네이버 스니펫 절단 | 검색 결과 수동 확인 | **8/25경 (완화 1주 후)** |
| ENTITY/NUMBER 표기 오탐 3번째 | `[TitleRewrite]` 로그의 desc=skipped preview | 발생 시 |
| SEO rescue 1차 색인 반응 | 대조군 = 제외한 50건 | 8/19~23 (3~7일차) |
| 8/18 기한이던 WAIT 2건 (시리즈 허브 GSC · Google-only noindex E0) | 창업자 콘솔 판정 대기 | 판정 결과 수신 시 |

---

## 8. 보류/금지 (다음 세션이 가장 흔하게 어길 위험이 있는 것들)

```
🚫 MAX_DESC_LENGTH 140 초과 완화        — 141~160 표본 3건의 품질이 미검증
🚫 prompt 수정                           — 160+ 표본 0건, 압축 근거 없음
🚫 validation 완화 (ENTITY/NUMBER 정규화 포함) — 오탐 표본 2건뿐, 3번째 발생 시 별도 태스크
🚫 DB write (원칙적으로 전면 금지)        — raw SQL 금지(AGENTS.md 원칙). 예외적으로 필요하면
                                           창업자 명시 승인 + 백업/rollback 계획 + 영향 범위 +
                                           검증 방법이 먼저 있어야 하며, 가능한 경우 Prisma/기존
                                           운영 스크립트/정해진 에이전트 경로를 쓴다.
                                           단독 판단으로 실행하지 않는다
🚫 SEO rescue 2차 즉시 반영              — 1차 색인 반응(3~7일) 판정 전
🚫 sitemap/robots/canonical/noindex 수정  — 네이버 유입 보호 (CI seo-guard). P1 진단도 read-only 먼저
🚫 Naver/GSC 수집·색인 요청 버튼          — 재평가 중 반복 요청은 역효과 위험
🚫 기존 글 대량 backfill                  — P0-3는 신규 발행분만. 소급은 별도 승인
🚫 crawler/launchd 조작 · vars/env 변경   — HANDOFF 대상
🚫 naver_google/ 수정·이동·커밋           — 창업자 증거 폴더, 미추적 상태 유지
🚫 SHEET gate 즉흥 구현                   — dry-run 없는 패턴은 갱년기·병원후기 글을 죽인다
                                           (오탐 대조군 실측: "건강검진 간에 혹"·"실손보험" 글)
```

---

## 9. 남은 우선순위

### P1
1. **Naver/GSC 상태 관찰 + 수동 증거 반영** — `naver_google/` 방식으로 창업자가 캡처,
   Claude [1]이 read-only 판독. WAIT 2건 판정 포함.
2. **sitemap ↔ googlebot noindex 모순 진단** — 10,261 URL vs noindex 약 6,465건.
   read-only 진단 → 설계 → 승인 순서. WAIT 판정 결과가 선행 조건.
3. **SHEET 의료광고 gate dry-run 설계** — 브랜딩형 광고(상호+수상, 가격 없음)는 기존
   MEDICAL_AD 필터도 통과함을 실측. 최근 30일 SHEET 전량 dry-run으로 오탐 0 확인 후 PR.

### P2
4. **soft-404 개선** — `revalidate-deleted` API가 `revalidatePath`만 호출,
   `revalidateTag(postDetailCacheTag(id))` 미호출 → HIDDEN 글이 HTTP 200(내용은 404+noindex).
5. **ENTITY/NUMBER 표기 변환 validator 정규화 후보** — 시엄니↔시어머니 · 3천↔3000.
   3번째 오탐 발생 시 승격.
6. **네이버 스니펫 절단률 확인** (131~140자 desc, 8/25경).

### P3
7. SEO rescue 2차 (1차 판정 후. 후보에 P0-2 이전 리라이팅 10건의 seoTitle 잔재 포함)
8. 기존 글 backfill 여부 (별도 판단)
9. **새 브랜드 전환 설계와 기존 실패 교훈 연결** — Codex [3] 트랙. 이 문서의 §4 가설,
   §5 실증 자산(고유화 파이프라인·gate·validator)이 이전 대상 자산이다.

---

## 10. 역할 정의 (멀티 세션 충돌 방지)

| 레인 | 역할 | 경계 |
|---|---|---|
| **Codex [1]** | 기존 사이트 **운영 마스터** — North Star 고정, Claude 보고 검증, 우선순위/금지선/승인 기준 관리, 두 트랙 충돌 방지 | 승인 권한. 직접 구현하지 않음 |
| **Claude [1]** | 기존 사이트 **실행/검증** — read-only 감사 또는 명시된 좁은 범위 구현, PASS/PARTIAL/위험 + 근거로 보고 | **임의 개발 금지.** merge·배포·dispatch는 창업자 승인 후 |
| **Codex [3]** | **새 브랜드 전환 전략 마스터** — 기존 실패/성공 자산을 새 브랜드 설계로 이전 | 기존 사이트 코드에 write 하지 않음 |
| **Claude [3]** | Codex [3] 지휘 하의 **read-only 조사** | 기존 사이트에 write 하지 않음 |

공통 규칙 (`.claude/rules/session-isolation.md` · `docs/ops/OPERATING_MASTER_HARNESS.md`):
- `git add .` 절대 금지 — 항상 파일명 명시. stage 직후 즉시 커밋.
- 새 브랜치는 `git switch -c <name> origin/main` (로컬 main은 admob-min worktree 점유).
- PR은 `[merge 금지]` prefix, merge는 창업자 승인 후, `--delete-branch` 미사용.
- 이전 보고와 실측이 어긋나면 **정정부터** 하고 진행.

---

## 11. 의사결정 원칙 (새 작업 제안 시 전부 통과해야 착수)

1. 검색 생존에 직접 도움이 되는가?
2. 커뮤니티 본질(North Star)에 맞는가?
3. 새 브랜드에도 가져갈 수 있는 자산인가?
4. 되돌릴 수 있는가? (rollback 경로·백업 먼저)
5. 검색엔진 신호가 큰 변경인가? (크면 실험 문서 + 관찰 계획 선행 — P0-3 방식)
6. 모델 오판 가능성이 있으면 기계 검증이 붙었는가? (validator 실차단 2건이 그 증거)
7. 발행 실패보다 title/description 개선이 우선되지 않는가? (발행이 항상 우선 — 안전한 축퇴)

---

## 12. 다음 세션 시작 절차 (순서대로)

```
1  git status --short                        → naver_google/ 미추적은 정상. 건드리지 않는다
2  git fetch origin main && git rev-parse origin/main
                                             → b0fef1aa 이후 커밋이 있으면 그 diff부터 읽는다
3  gh run list --workflow=agents-cafe-hourly-curation.yml --limit 3
                                             → 최신 회차 headSha·conclusion 확인
4  이 문서(§5~§9)로 완료/관찰/보류/금지 분류 확인
5  Claude/Codex 중 누가 write 권한을 갖는지 먼저 정한다 (§10)
6  North Star와 연결되지 않는 작업은 보류한다 (§11-2)
7  상태 주장은 실측 후에만 한다 — 이 문서도 작성 시점(8/18 13:30)의 스냅샷이다
```

### 참조 문서 지도

```
헌법/북극성   docs/constitution/NORTH_STAR.md · AGENTS.md
운영 계약     docs/ops/OPERATING_MASTER_HARNESS.md · .claude/rules/autonomy.md
SEO 마스터    docs/seo/SEO_OPERATING_MASTER.md
실험 기록     docs/seo/experiments/2026-08-17-p0-3-seo-description-rewrite.md  ← P0-3/4/5 전체 이력
과거 진단     docs/analysis/seo-organic-diagnosis-2026-06-15.md
             docs/analysis/seo-cluster-menopause-marriage-2026-07-06.md
전략          docs/strategy/content-growth-roadmap.md · docs/strategy/title-rewrite-guide.md
기능 원장     docs/features/REGISTRY.md (I04·A09·F17 등)
수동 증거     naver_google/ (2026-08-18 캡처 16장 — 수정 금지)
```

---

## 13. 다음 액션

- 이 문서는 **커밋하지 않고 승인 대기** 상태로 보고됐다.
- 창업자 승인 후에만 stage(파일명 명시)/commit/PR을 진행한다.
- 승인 후 Claude [1]의 다음 후보 작업(§9 순서): P1-1 창업자 증거 판독 → P1-2 sitemap/noindex
  read-only 진단 → P1-3 SHEET gate dry-run 설계. 어느 것도 지시 없이 착수하지 않는다.
