# 운영 마스터 핸드오프 — 다음 세션용 (2026-06-24)

> **이 문서를 가장 먼저 끝까지 읽고 시작하라.** 이건 단순 작업 로그가 아니라 **운영 마스터 인수인계서**다.
> 너(Codex/Claude Code)는 단순 코더가 아니라 **운영 마스터**다. 모든 작업을 **CTO/CPO/COO 관점**으로 본다 —
> 목적 / AS-IS / 운영 리스크 / 사용자 경험 / 데이터 신뢰성 / 배포 경로를 먼저 확인하고 움직여라.

---

## 1. 다음 세션 첫 프롬프트 (시작 시 반드시 실행)

**시작 전 무조건:**
1. 이 문서(`docs/handoff-operating-master-next-session-2026-06-24.md`)를 끝까지 읽는다.
2. 아래를 read-only로 확인한다 — 추측 금지:
   - `git status --short --branch`
   - `git rev-parse --short HEAD`
   - `git rev-parse --short origin/main`
   - `git worktree list`
3. 역할 인식: **운영 마스터**. 목적·AS-IS·운영 리스크·UX·데이터 신뢰성·배포 경로를 먼저 점검한다.

**절대 금지(세션 내내):**
- ❌ `poc/admob-test` 전체를 main에 merge — diff가 매우 큼(AdMob/매거진/poc 섞임)
- ❌ `git add .` / `git add -A`
- ❌ force push
- ❌ env / cookie / storage-state / keystore / private key / full token 값 출력
- ❌ raw SQL write, DB write
- ❌ 매거진 worktree(`mag-revalidate-wt`)·매거진 파일 수정
- ❌ 기존 untracked/dirty 삭제

---

## 2. Codex의 정확한 역할 (운영 마스터)

- **검증 우선**: Claude Code의 보고를 그대로 믿지 마라. **코드 / DB / 로그 / 화면 / 콘솔**로 직접 확인한다.
- **문제 처리 순서**: 목적 → AS-IS → 문제 정의 → 원인 → 해결 원칙 → 검증. 추측 시행착오 금지.
- **창업자 판단 피로 최소화**: 선택지를 나열만 하지 말고 **우선순위와 추천안**을 제시한다.
- **직접 개발 트랙이 아닐 때**: Claude Code에게 **정확한 read-only / 수정 프롬프트**(범위·금지·검증 포함)를 내린다.
- **배포 경로 의식**: main 반영은 "필요한 커밋만 별도 worktree cherry-pick/ff push". launchd는 로컬 파일을 직접 실행한다(§4 참조).

---

## 3. 프로젝트 배경 / 목적 / 목표

- **서비스**: 우리 나이가 어때서 / 우나어
- **도메인**: age-doesnt-matter.com
- **대상**: 40·50·60대 한국인 커뮤니티 + 일자리(내일찾기) / 생활 / 매거진 정보
- **현재 목표**:
  - 앱 유입 안정화
  - 가입 전환 측정 신뢰 확보
  - 리텐션 개선
  - 내부 순환 / PV 증가
  - 커뮤니티 자동 운영 안정화
  - 매거진 SEO 자동발행 고도화
  - AdMob / Google Ads 수익화 준비
  - iOS는 주요 운영 정리 후 진행

---

## 4. 현재 Git / 배포 상태 (2026-06-24 기준, 실측)

| 항목 | 값 |
|---|---|
| origin/main | `0cddd0a` chore(session): remove stale NID_AUT alert comments |
| local HEAD | `d1cb3e6` chore(session): remove stale NID_AUT alert comments |
| 현재 브랜치 | `poc/admob-test` |
| ahead (vs origin/poc/admob-test) | **10** |
| ahead (vs origin/main) | **29 — diff 매우 큼** |

- **`poc/admob-test`의 ahead에는 launchd 로컬 반영용 cherry-pick + 매거진/AdMob/poc 작업이 섞여 있다.**
- ⚠️ **절대 `poc/admob-test` 전체를 main에 merge하지 마라.**
- main 반영은 **필요한 커밋만 origin/main 기준 별도 worktree에서 cherry-pick → ff push** 방식.
- **launchd는 로컬 `New_Claude_agenotmatter` worktree의 파일을 직접 실행**한다(에이전트 `.ts`를 tsx로). → 에이전트 변경은 **main 반영 후 로컬(poc/admob-test)에도 cherry-pick** 해야 launchd가 새 코드를 돈다.

**남은 worktree:**
- `New_Claude_agenotmatter` = poc/admob-test (메인 작업, launchd 실행 경로)
- `mag-revalidate-wt` = 매거진 타세션 영역, **미접촉 유지**

**현재 untracked (건드리지 말 것):**
- `docs/handoff-operating-master-android-vc20-fcm-admob-magazine-2026-06-22.md`
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/`
- `mockup/`

---

## 5. 이번 세션 완료 작업 (무엇을 / 왜 / main 커밋 / 남은 것)

### A. Footer / FAQ / 채널별 가입·설치 동선
- **무엇**: Footer 정리 + 홈 FAQ Android/iPhone별 설치 안내 + 채널별 동선 분리. **Capacitor 앱에서는 설치 유도 숨김, 비회원 가입 CTA는 유지**. Android web=Play CTA, iPhone web=홈 화면 추가 안내, PWA/TWA=설치 CTA 숨김·가입 CTA 유지.
- **왜**: 이미 앱을 깐 사용자에게 "앱 설치" 권유는 모순. 단 앱 비회원도 가입 전환 대상이므로 가입 유도는 유지해야 함.
- **main 커밋**: `8bd12a1`, `68a114b`, `eac1375`, `63c948f`
- **남은 것**: 앱 마케팅 푸시 동의 UI (P1)

### B. 관련글 추천 v2
- **무엇**: `exp1_related_flow` A/B 종료 → B 방향 채택. 글상세 "📖 다음에 읽기 좋은 이야기" 3개 상시 노출. 알고리즘 = **맥락 × 흥미도**. 현재글·이번 세션에서 본 글·가입인사 제외. 서버 후보 24개 → 클라이언트 점수화(추가 DB 쿼리 0). 이벤트: `related_recommend_view`(노출), `related_post_click`(클릭, reason/rank/algoVersion 포함).
- **왜**: 모든 글에 같은 인기글만 노출 + 본 글 재추천으로 PV 손실. 내부 순환/PV 증가 목적.
- **main 커밋**: `c435ee6` (코드) / **문서 반영**: `ac8abd7`
- **남은 것**: **24~48h 이후 실유저 데이터로 효과 관찰. 지금은 관찰하지 않음** (배포 직후 smoke/봇 데이터로 결론 금지)

### C. CONTENT_CURATOR 0개 발행 문제
- **무엇 / 왜**: 원인 = **SEASON_MISMATCH sticky poison**. 크리스마스 등 계절 mismatch reference(예: "불쌍한 사람들 안타까운 사람들", 본문에 크리스마스)가 killerScore 상위라 매 실행 모든 topic의 첫 refs로 잡혀 생성 본문을 오염 → 발행 직전 SEASON_MISMATCH skip → **성공 시에만 usedAt 마킹**이라 skip 시 미마킹 → 같은 글이 영구 첫 후보(sticky poison). 15/15 topic 전부 SEASON_MISMATCH로 0개 발행 반복.
- **수정**: `getReferencePosts`의 reference 후보 필터(`filterBlocked`) 단계에서 `isSeasonMismatch(title, content)` 선제 제외 + `여름휴가` 허용월 `[7,8] → [6,7,8]`.
- **main 커밋**: `9dae9a0` (season 제외) / **로컬 launchd cherry-pick**: `47d25e8`
- **P1 Slack important 격상**: 같은 skipReason으로 연속 0개 발행 3회 이상이면 important. **main 커밋**: `249d782` / **로컬 cherry-pick**: `1536f9b`
- **운영 검증**: 이후 CONTENT_CURATE 성공 회복, `itemCount=3` 패턴 확인, 15:00 이후 BOT 글 25개 품질 스캔 문제 없음
- **남은 것**: 계절 키워드 정책표 정리 (P1)

### D. WaveProcessor Slack cap 노이즈
- **무엇 / 왜**: `global_cap`(글당 댓글 상한 도달 = 정상 동작)인데 Slack QA 경고가 계속 발송됨. bot_cap(페르소나 일일 한도 부족)만 경고해야 함.
- **수정**: 경고 조건을 `skips.includes('bot_cap')`로 변경(global_cap 단독 제외), 메시지 "cap 부족"→"bot daily cap 부족".
- **main 커밋**: `545d568`
- **남은 것**: bot_cap 실제 부족 발생 시 persona cap 분석 (P1 모니터링)

### E. NID_AUT / NID_SES 운영 정책
- **무엇 / 왜**: NID_SES는 자동 갱신 가능(`refreshNidSes`, ≤5일). **NID_AUT는 메인 카페 계정에서 "로그인 상태 유지"를 켜도 ~30일짜리만 발급됨(1년 불가, 3회 실측)**. → 1년 추구 중단, **월간 수동 쿠키 재추출 정책**으로 전환.
- **운영 절차**: founder가 Chrome 네이버 로그인 상태 확인 → **Chrome 완전 종료(Cmd+Q)** → Claude/Codex가 `export-cookies.ts` 실행(Chrome 프로필 쿠키 복호화 추출, 새 로그인 아님).
- **실제 갱신 완료**: NID_AUT/NID_SES 약 30일 확보, SESSION_HALTED 해제.
- **알림 정책**: 14일 전 준비 알림(`NID_AUT_WARNING_DAYS=14`, #시스템) / 7일 전 중요 알림(`NID_AUT_CRITICAL_DAYS=7`, 매일 #대시보드+#시스템) / `.nid-aut-alerted` 24h throttle. `.session-halted-alerted`·`.nid-aut-alerted` gitignore 추가.
- **main 커밋**: `b01406c`(throttle), `1241a3c`(월간 정책+gitignore), `0cddd0a`(레거시 주석 정리) / **로컬 cherry-pick**: `600dd7d`, `8ae332e`, `d1cb3e6`
- **남은 것**: 다음 알림(만료 14일 전) 때 founder와 월간 갱신. `refreshNidSes`·SESSION_HALTED 로직은 변경 금지.

### F. Android / Capacitor / Channel Architecture 문서
- **무엇**: `docs/android-capacitor-policy-2026-06-21.html` + `docs/channel-architecture.html` 최신화. 민감 경로/keystore/full ID/사용자 경로 제거(`<repo root>`·`<Android SDK>` 등 placeholder).
- **왜**: vc20/Capacitor 8.4/sw unao-v4/푸시(VAPID+FCM 분리)/AdMob main 미반영 등 실제 상태 반영 + 보안 보정.
- **main 커밋**: `939c788`
- **남은 것**: 앱 실기기 FCM 수신 검증 / Google Ads·GA4 app conversion 신뢰성 확인 / AdMob readiness·main 반영 판단

### G. 매거진 영역 (이 세션 후반 미접촉)
- 이 세션 후반에는 **직접 건드리지 않았다.** 매거진은 별도 세션/타 worktree(`mag-revalidate-wt`) 진행 중 — **미접촉 유지**.
- 진행된 큰 흐름만 요약(참고): keyword queue → generator 연결 / 하루 2편·세션 1편 / no_publish 이중 가드 / ChatGPT 이미지+800px 가드 / P1 탐색 링크 / editorial v2 flag 배포.
- **관련 문서**: `docs/handover-magazine-operations.html`, `docs/handoff-operating-master-android-vc20-fcm-admob-magazine-2026-06-22.md`(untracked)
- **매거진을 맡지 않는 세션에서는 건드리지 마라.**

---

## 6. 남은 업무 우선순위

| 우선순위 | 항목 | 비고 |
|---|---|---|
| **P0** | FCM 앱 푸시 실기기 수신 확인 | native 수신 핸들러(포그라운드 표시·탭 딥링크) 미구현 — 검증 대기 |
| **P0** | Google Ads app `sign_up` 0건 원인 확인 | 설치 95 vs 가입 0. 실측 = 광고 경유 가입이 실제 0에 가까움(측정 누락 아닌 전환 문제). GA4 app stream→Ads import 신뢰성도 확인 |
| **P0** | Android Capacitor 신규 가입 경로 실기기 검증 | OAuth 시스템 브라우저 handoff + FcmToken 등록 흐름 |
| **P1** | 앱 마케팅 푸시 동의 UI | 앱 FCM은 OS 권한만 받고 marketingOptIn 미기록 |
| **P1** | 관련글 추천 v2 효과 관찰 | **24~48h 뒤** (2026-06-25~26). 지금은 하지 않음 |
| **P1** | CONTENT_CURATOR 계절 키워드 정책 정리 | SEASONAL_KEYWORDS 테이블 검토 |
| **P1** | WaveProcessor bot_cap 실제 부족 모니터링 | persona cap 분석 |
| **P1** | NID_AUT 월간 갱신 운영 | 만료 14일 전 알림 시 founder와 |
| **P2** | AdMob readiness / main 반영 판단 | main 미반영(poc 브랜치 전용), 콘솔 승인·검증 대기 |
| **P2** | iOS 착수 | 주요 운영 정리 후 |

---

## 7. 절대 주의사항 (재강조)

- ❌ `poc/admob-test` 전체 main merge 금지 — `origin/main..HEAD` diff가 매우 큼(ahead 29)
- ✅ 필요한 커밋만 origin/main 기준 별도 worktree에서 cherry-pick → ff push
- ✅ launchd는 로컬 파일을 직접 실행 → 에이전트 변경은 **로컬(poc/admob-test) cherry-pick 반영도 확인**
- ❌ 매거진 worktree(`mag-revalidate-wt`)는 타 세션 영역 — 미접촉
- ❌ cookie / storage-state / env / keystore / private key / full token 출력 금지
- ❌ `git add .` 금지, force push 금지, raw SQL write 금지

---

## 8. 다음 세션 바로 쓸 Claude Code 프롬프트 (복사용)

### 8-1. FCM 앱 푸시 실기기 수신 확인 (read-only 우선)
```
Android Capacitor 앱 FCM 푸시 실기기 수신을 read-only로 진단해라.
확인: ① AppFcmRegister가 로그인 후 FCM 토큰 등록하는지(FcmToken DB row)
② 서버 발송(fcm-sender, firebase-admin)이 실제 기기로 가는지 로그/BotLog
③ native 수신 핸들러(notificationReceived/notificationActionPerformed) 구현 여부
④ 포그라운드 표시·탭 딥링크 동작 여부
금지: 코드 수정/DB write/git/매거진. 쿠키·토큰·env 값 출력 금지.
보고: 수신 구간별 PASS/FAIL + 미구현 항목 + 다음 액션.
```

### 8-2. Google Ads app sign_up 0건 진단 (read-only)
```
Google Ads의 앱 sign_up 전환 0건이 측정 누락인지 실제 전환 0인지 read-only로 확정해라.
확인: ① 최근 N일 신규 가입자 수(DB) ② 그중 앱(FcmToken android) 가입자 ③ utm/gclid로 Google Ads 경유 여부
④ GA4 app stream(481670969)에 sign_up 이벤트가 기록되어 Google Ads로 import되는지
금지: DB write/코드 수정/git/매거진. PII·토큰 출력 금지(닉네임/만료일 수준만).
보고: 측정누락 vs 실제전환 판정 + 설치→가입 깔때기 + 다음 액션.
```

### 8-3. 관련글 추천 v2 효과 관찰 (24~48h 뒤에만)
```
관련글 추천 v2(rec_v1_2026-06-23, main c435ee6) 효과를 read-only로 관찰해라. 배포 2026-06-24, 관찰 가능 시점 2026-06-25 09:00 KST 이후.
지표: ① related_recommend_view 수 ② related_post_click 중 algoVersion=rec_v1_2026-06-23 ③ inline CTR(클릭세션/노출세션)
④ 세션PV 전후 ⑤ 3화면 도달률 전후 ⑥ /api/events 4xx/5xx ⑦ 현재글/본 글 추천 제외 샘플
금지: DB write/코드/git/매거진. 봇·smoke 데이터로 결론 금지. sessionId 분절(첫 방문 분리) 주의.
보고: 전후 비교표 + 판정 + 추가 관찰 필요 여부.
```

### 8-4. CONTENT_CURATOR 재발 진단 (read-only)
```
CONTENT_CURATE 발행이 다시 0개로 떨어졌는지 read-only로 진단해라.
확인: ① 오늘 BotLog action=CONTENT_CURATE 전체(status/itemCount/skipReason 집계)
② topicResults skipReason이 SEASON_MISMATCH 등 특정 사유로 쏠리는지
③ 같은 cafePostId가 반복 첫 후보(sticky poison)인지
④ getReferencePosts의 season 선제 제외(filterBlocked) 동작 여부
금지: DB write/usedAt·isUsable 변경/수동 발행/코드 수정/git/매거진.
보고: ROOT_CAUSE 판정 + 수정 필요 시 단일 파일(agents/cafe/content-curator.ts) 범위 + 검증.
```

---

## 9. 핵심 파일 참조 (read-only 대상)

- 세션/쿠키: `agents/cafe/session-manager.ts`, `agents/cafe/export-cookies.ts`, `launchd/com.unaeo.session-refresh.plist`
- 큐레이터: `agents/cafe/content-curator.ts`, `agents/cron/runner.ts`
- 웨이브: `agents/cafe/wave-processor.ts`
- 추천: `src/components/features/community/NextPostsInline.tsx`, `TrackedPostLink.tsx`, `src/lib/recommend/related.ts`, `viewed.ts`, `src/lib/queries/posts/posts.community.ts`
- 채널/가입: `src/components/features/community/PostCTA.tsx`, `src/components/common/SignupPromptBanner.tsx`, `src/components/features/home/HomeFaqSection.tsx`, `AppInstallFaqAnswer.tsx`, `src/hooks/useAppEnvironment.ts`, `src/lib/kakao-start.ts`
- 푸시: `src/components/features/push/AppFcmRegister.tsx`, `src/lib/push/*`, `public/sw.js`
- 문서: `docs/android-capacitor-policy-2026-06-21.html`, `docs/channel-architecture.html`, `docs/home-section-policy.html`, `docs/handover-magazine-operations.html`

---

_본 문서는 2026-06-24 운영 마스터 세션 종료 시점 기준. 코드/DB가 진실의 원천이니 시작 시 실측으로 교차검증하라._
