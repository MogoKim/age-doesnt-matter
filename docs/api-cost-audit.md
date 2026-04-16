# API 비용 & 에이전트 전수 감사 보고서
> 최초 작성: 2026-04-16 | 다음 업데이트: 분기별 또는 신규 API 추가 시

---

## 핵심 요약

| 항목 | 현황 | 상태 |
|------|------|------|
| 월 예상 비용 | $80~105 (Claude 위주) | 🔴 헌법 한도 $50 초과 |
| 일일 API 호출 | ~80회 (Claude 기준) | — |
| 실제 작동 에이전트 | 54개 (크론 자동 실행) | ✅ |
| 고아 에이전트 | 8개 (코드만 있음) | ⚠️ |
| 환경변수 미사용 | 68개 중 15개 선언만 됨 | ⚠️ |
| CFO 자동 차단 | 정책 있음, **구현 없음** | 🔴 구조적 공백 |
| -$0.17 원인 | 일 $4 소비 → $27.50 grant 소진 초과 | — |
| 에이전트 멍청해진 이유 | 크레딧 0 → API 실패 → 빈 콘텐츠 발행 | — |

---

## 1. 외부 AI/유료 API 전체 목록

### ① Anthropic Claude ← 가장 비싼 항목

| 모델 | 환경변수 | 용도 | 일 실행 | 일비용 | 월비용 |
|------|---------|------|--------|--------|--------|
| claude-haiku-4-5 | CLAUDE_MODEL_LIGHT | 모니터링·데이터 집계 | ~50회 | $0.40 | $12 |
| claude-sonnet-4-6 | CLAUDE_MODEL_HEAVY | 콘텐츠 생성·분석 | ~28회 | $2.80 | $84 |
| claude-opus-4-6 | CLAUDE_MODEL_STRATEGIC | 주간 전략 (월 2~3회) | 0.1회/일 | $0.57 | $17 |
| **합계** | | | **~80회** | **$3.77** | **$74~90** |

**크레딧 부족 시 에러:**
```
400 "Your credit balance is too low to access the Anthropic API"
```
→ BaseAgent try/catch → BotLog FAILED + Slack #긴급  
→ **콘텐츠 생성 안 됨 = "멍청한 에이전트" 현상**  
→ 재시도 없음 — 다음 크론까지 대기

**에러 처리:** ✅ 감지는 됨 | 재시도: ❌ 없음

---

### ② OpenAI (DALL-E 3 + Whisper)

| 서비스 | 환경변수 | 용도 | 실행 빈도 | 단가 | 월비용 |
|--------|---------|------|----------|------|--------|
| DALL-E 3 | OPENAI_API_KEY | 매거진 이미지 생성 | 로컬 수동 실행만 | $0.04~0.08/장 | ~$5 |
| **Whisper** (`whisper-1`) | OPENAI_API_KEY | **자막 생성** (`agents/design/video-director/subtitle.ts`) | 수동 실행만 | **$0.006/분** | ~$1 (사용량 따라) |

**DALL-E 크레딧 부족 시:** HTTP 429 → MAX_ATTEMPTS=3 재시도  
**에러 처리:** ✅ 있음 | **플랫폼:** platform.openai.com 별도 관리 (Anthropic과 무관)

> ⚠️ **Whisper 주의**: 현재 수동 실행이지만 video-director 자동화 시 비용 급증 가능. 10분짜리 영상 = $0.06/편.

---

### ③ Google Gemini (TTS + Playwright 스크래핑)

| 서비스 | 환경변수 | 용도 | 실행 빈도 | 비용 |
|--------|---------|------|----------|------|
| **Gemini TTS** (`gemini-2.5-flash-preview-tts`) | GEMINI_API_KEY | **영상 나레이션 음성 생성** (`agents/design/video-director/`) | 수동 실행만 | **$0.10/1M chars** (thinking: $3.50/1M tokens) |
| Gemini Imagen (스크래핑) | GEMINI_API_KEY | Graphic Designer 이미지 생성 | 로컬 수동 실행만 | 무료 (Google One 구독) |

> 💡 **Gemini TTS 비용 예시**: 60초 나레이션 ≈ 300자 → $0.00003/편. 월 100편 생성해도 $0.003. **현재는 무시 가능한 수준**.

**⚠️ Playwright 스크래핑 취약점:**
- Chrome 로컬 프로필 로그아웃 → 무한 대기
- Cloudflare CAPTCHA 감지 시 자동 복구 불가
- CI/GitHub Actions에서 실행 불가

---

### ④ OpenAI ChatGPT (Playwright 스크래핑) ← 무료, 로컬 전용

| 용도 | 실행 빈도 | 비용 |
|------|----------|------|
| Graphic Designer 이미지 (대안) | 로컬 수동 실행만 | 무료 (ChatGPT Plus $20/월 구독 포함) |

**취약점:** Cloudflare 감지 시 수동 개입 필요

---

### ⑤ Perplexity AI

| 환경변수 | 용도 | 실행 빈도 | 비용 |
|---------|------|----------|------|
| PERPLEXITY_API_KEY | 카드뉴스 트렌드 리서치 | 주 1~2회 (수동) | **미추적** ← 확인 필요 |

**크레딧 부족 시:** null 반환 → Claude-only 모드로 자동 폴백  
**에러 처리:** ✅ 우수 (폴백 있음)

---

### ⑥ Google APIs (모두 무료)

| API | 환경변수 | 용도 | 한도 |
|-----|---------|------|------|
| GA4 Data API | GOOGLE_SERVICE_ACCOUNT_JSON, GA4_PROPERTY_ID | CEO 모닝 사이클, CDO 분석 | 일 1천만 행 |
| Search Console | SEARCH_CONSOLE_SITE_URL | CDO SEO 리포트 | 일 200요청 |
| Google Indexing | GOOGLE_INDEXING_CLIENT_EMAIL/PRIVATE_KEY | 새 글 즉시 색인 | **일 200요청** ← 한도 주의 |
| Google Ads API | GOOGLE_ADS_* | 마케팅 (비활성) | — |
| Google Sheets | SHEETS_SCRAPER_ID, JISIK_SHEETS_ID | 커뮤니티 데이터 | 무제한 |

**에러 처리:** ✅ 모두 null 폴백  
> ⚠️ **Indexing API 한도**: 매거진 다발 발행 시 200회 초과 가능. 초과 후 색인 지연 발생.

---

### ⑦ Cloudflare R2 (스토리지, 유료)

| 환경변수 | 용도 | 비용 |
|---------|------|------|
| CLOUDFLARE_R2_* | 이미지/영상 업로드 저장 | 월 $0~5 (트래픽별) |

---

### ⑧ SNS APIs (모두 무료)

| 플랫폼 | 환경변수 | 실행 빈도 | 상태 | 만료 주의 |
|--------|---------|----------|------|---------|
| Instagram | INSTAGRAM_USER_ID, FACEBOOK_PAGE_ACCESS_TOKEN 등 | 하루 3회 | ✅ 활성 | 60일마다 갱신 필요 |
| Threads | THREADS_ACCESS_TOKEN 등 | 하루 3회 | ✅ 활성 (갱신 자동화됨) | 60일 |
| **Facebook** | FACEBOOK_PAGE_ACCESS_TOKEN 등 | — | **🔴 비활성** (`FACEBOOK_POSTING_ENABLED !== 'true'`로 코드 차단됨) | — |
| X (Twitter) | X_CONSUMER_KEY 등 | 하루 2회 | ✅ 활성 | — |
| **Band** | BAND_ACCESS_TOKEN, BAND_KEY | — | **🟡 비활성** (API 심사중 — DISPATCH ONLY) | 심사 통과 후 활성화 |

**X 에러 처리:** ⚠️ 미흡 — 재시도 로직 없음  
**Facebook 비활성 이유:** 환경변수 `FACEBOOK_POSTING_ENABLED`가 설정되지 않아 의도적으로 차단됨. Instagram은 별도 경로로 정상 운영.

---

### ⑨ Bot API Keys (4종 — 무료)

| 키 | 환경변수 | 용도 |
|----|---------|------|
| JOB Bot | BOT_API_KEY_JOB | 일자리 콘텐츠 게시용 봇 인증 |
| HUMOR Bot | BOT_API_KEY_HUMOR | 유머·재미 콘텐츠 게시용 봇 인증 |
| STORY Bot | BOT_API_KEY_STORY | 스토리·인생 경험 콘텐츠 게시용 봇 인증 |
| SEED Bot | BOT_API_KEY_SEED | 시드봇(페르소나) 게시용 봇 인증 |

> 내부 API(`/api/bots/*`) 호출 시 헤더 인증에 사용. 외부 비용 없음.

---

### ⑩ 기타 무료 API

| API | 환경변수 | 용도 | 한도 |
|-----|---------|------|------|
| Unsplash | UNSPLASH_ACCESS_KEY | 매거진 사진 | 월 50회 (초과 시 DALL-E 폴백) |
| Coupang 파트너스 | COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY | 제휴 광고 링크 생성 | — |
| Kakao OAuth | KAKAO_CLIENT_ID/SECRET | 회원 로그인 | — |
| Slack | SLACK_BOT_TOKEN | 에이전트 알림 발송 (6채널) | — |

> 💡 **Coupang 인증**: HMAC-SHA256 방식. 헤더 `Authorization: CEA <accessKey>:<signature>` 형식. 토큰 만료 없음 (서명 기반).

---

## 2. 월 비용 전체 요약

| API | 월 비용 | 관리 위치 | 비고 |
|-----|---------|---------|------|
| **Anthropic Claude** | **$74~90** | console.anthropic.com | 가장 큰 항목 |
| OpenAI DALL-E | ~$5 | platform.openai.com | 수동 실행만 |
| OpenAI Whisper | ~$1 | platform.openai.com | 수동 실행만 |
| Gemini TTS | ~$0 | — | 수동, 현재 무시 가능 |
| Perplexity | **미추적** | — | 확인 필요 |
| Cloudflare R2 | ~$0~5 | dash.cloudflare.com | 트래픽 따라 |
| 나머지 모두 | $0 | — | 무료 |
| **총합 추정** | **$80~105/월** | — | 🔴 헌법 한도 $50 초과 |

---

## 3. 에이전트 작동 현황 전수

### ✅ 실제 작동 중 (54개 — 크론 자동 실행)

| 카테고리 | 에이전트 | 스케줄 (KST) | 모델 |
|---------|---------|-------------|------|
| **CEO** | morning-cycle | 매일 09:00 | Sonnet |
| | morning-sns-briefing | 매일 08:30 | Haiku |
| | weekly-report | 월 10:00 | Opus |
| | approval-reminder | 매일 09:30 | Haiku |
| **CTO** | health-check | 4시간마다 | Haiku |
| | error-monitor | 4시간마다 | Haiku |
| | security-audit | 매일 06:00 | Haiku |
| | crawler-health | 매일 07:00 | Haiku |
| | qa-verify | 매일 23:45 | Haiku |
| | arch-review | 일 07:00 | Haiku |
| | garbage-collect | 월 09:30 | Haiku |
| **CMO** | trend-analyzer | 화~일 10:00 | Sonnet |
| | caregiving-curator | 매일 10:15 | Sonnet |
| | health-anxiety-responder | 매일 10:45 | Sonnet |
| | humor-curator | 매일 11:15 | Sonnet |
| | content-gap-finder | 금 09:00 | Haiku |
| | source-expander | 월 09:00 | Haiku |
| | social-poster | 매일 07:00, 12:00 | Sonnet |
| | social-poster-visual | 매일 15:00 | Sonnet |
| | social-metrics | 매일 20:00 | Haiku |
| | social-reviewer | 월·목 10:00 | Haiku |
| | social-strategy | 월·목 10:15 | Opus |
| | channel-seeder | 매일 11:30 | Sonnet |
| | knowledge-responder | 화·목·토 12:00 | Sonnet |
| | seo-optimizer | 일 08:00 | Haiku |
| | threads-token-refresh | 수 10:00 | (API만) |
| **CPO** | ux-analyzer | 매일 11:00 | Sonnet |
| | feature-tracker | 월 11:30 | Haiku |
| | journey-analyzer | 월 12:00 | Haiku |
| | persona-diversity-checker | 수 09:00 | Haiku |
| **CFO** | cost-tracker | 매일 23:00 | Haiku |
| | revenue-tracker | 매일 23:30 | Haiku |
| **COO** | moderator | 매일 09:00/15:00/21:00 | Haiku |
| | content-scheduler | 매일 14:00 | Sonnet |
| | job-scraper | 매일 12:00/16:00/20:00 | Haiku |
| | trending-scorer | 매일 12:00/18:00 | Sonnet |
| | connection-facilitator | 매일 09:15/15:00 | Sonnet |
| | comment-activator | 매일 10:30/14:30/20:00 | Sonnet |
| | job-matcher | 매일 11:45 | Sonnet |
| | reply-chain-driver | 매일 12:15/18:30 | Sonnet |
| **CDO** | kpi-collector | 매일 22:00 | Haiku |
| | anomaly-detector | 4시간마다 | Haiku |
| | engagement-optimizer | 매일 22:30 | Haiku |
| **Strategist** | user-deep-analysis | 목 09:00 | Opus |
| **Seed** | scheduler | 매일 9~22시 중 12슬롯 | Sonnet |
| | micro-scheduler | 매일 08/12/18/23시 | Haiku |
| **QA** | content-audit | 매일 08:20 | Haiku |
| **Design** | ads-loop | 매일 09:05 | Haiku |
| **Cafe** | trend-analysis | 매일 09:00/13:30/20:30 | Sonnet |
| | content-curate | 매일 09:00/13:30/20:30 | Sonnet |
| **Community** | sheet-scrape | 매일 11:00/21:00 | (스크래핑) |

### ⚠️ 고아 에이전트 (코드는 있으나 실행 안 됨, 8개)

| 에이전트 | 이유 | 조치 |
|---------|------|------|
| CMO:google-ads-report | DISPATCH ONLY, refresh_token 미설정 | 설정 완료 후 크론 연결 또는 제거 |
| CMO:upload-creatives | DISPATCH ONLY, 1회성 수동 실행 | 현재 상태 유지 OK |
| CMO:create-campaigns | DISPATCH ONLY, 1회성 수동 실행 | 현재 상태 유지 OK |
| Cafe:cafe-pipeline | LOCAL ONLY, 네이버 IP 차단 | Mac launchd에서만 실행 |
| Cafe:external-crawler | 스케줄 제거됨 (2026-04-13) | 의도적 비활성화 확인 필요 |
| CMO:jisik-answerer | LOCAL ONLY, 네이버 IP 차단 | Mac launchd에서만 실행 |
| QA:code-gate | /done 스킬 내부 호출 (독립 실행 불필요) | 현재 상태 유지 OK |
| QA:deploy-audit | post-deploy-qa.yml 내부 호출 | 현재 상태 유지 OK |

### 📍 LOCAL ONLY (Mac launchd, CI 불가, 6개)

| 에이전트 | 이유 |
|---------|------|
| Cafe:cafe-pipeline | 네이버 카페 딥크롤 (headless 탐지) |
| Cafe:local-magazine-runner | 로컬 이미지 생성 포함 |
| CMO:jisik-answerer | 네이버 지식iN (headless 탐지) |
| Community:run-local-fmkorea | 펨코 크롤링 (법적 리스크 검토 중) |
| Cafe:daily-brief | 로컬 전용 |
| Graphic Designer | Playwright → Gemini/ChatGPT 자동화 |

---

## 4. API 장애 시 상세 영향

각 API가 **완전히 중단**되면 어떤 일이 벌어지는지 정리.

| API | 즉각 영향 (0~1시간) | 누적 영향 (1일 이상) | 사용자가 느끼는 증상 | 자동 복구 |
|-----|------------------|------------------|------------------|---------|
| **Anthropic Claude** | 에이전트 전체 콘텐츠 생성 중단. BotLog에 FAILED 기록. Slack #긴급 알림 발송 | 매거진 공백, 시드봇 조용해짐, 트렌드 분석 없음, SNS 포스팅 중단 | "새 글이 안 올라온다", "시드봇이 갑자기 조용해졌다" | ❌ 없음. 크레딧 충전 후 다음 크론부터 재개 |
| **Supabase DB** | 모든 페이지 500 에러. 로그인 불가. 에이전트 전부 중단 | 서비스 완전 마비 | 사이트 자체가 열리지 않음 | ❌ Supabase 측 복구 필요 |
| **Cloudflare R2** | 이미지/영상 업로드 실패. 기존 저장 이미지는 정상 | 신규 매거진 이미지 없음, 사용자 프로필 사진 업로드 불가 | 매거진 이미지 깨짐 (신규 글만), 프로필 변경 오류 | ❌ 없음. Cloudflare 복구 필요 |
| **OpenAI (DALL-E)** | 이미지 생성 실패. Unsplash 폴백 자동 시도 | 매거진 이미지 품질 하락 (Unsplash 재고 이미지로 대체) | 매거진 이미지가 일관성 없어짐 | ✅ Unsplash → 없으면 이미지 없이 발행 |
| **OpenAI (Whisper)** | 자막 생성 실패 (수동 실행만이므로 즉각 영향 없음) | 영상 자막 없이 발행됨 | 자막 없는 영상 | ✅ 없음 (수동 프로세스) |
| **Gemini TTS** | 나레이션 음성 생성 실패 (수동 실행만) | 영상 나레이션 없음 | 무음 영상 또는 외부 TTS 수동 대체 | ✅ 없음 (수동 프로세스) |
| **Perplexity AI** | 트렌드 리서치 실패 | Claude만으로 트렌드 생성 (품질 소폭 하락) | 매거진 주제가 덜 트렌디해짐 | ✅ Claude-only 자동 폴백 |
| **Google GA4** | CDO/CEO 리포트에 트래픽 데이터 없음 | KPI 대시보드 공백 | Slack 리포트에 데이터 없음 | ✅ null 폴백 (리포트는 발송됨) |
| **Google Indexing** | 새 매거진 색인 요청 실패 | 검색 노출 지연 (며칠~1주) | 신규 글이 검색에 잘 안 잡힘 | ❌ 다음 발행 때 재시도 없음 |
| **Instagram/Threads** | SNS 포스팅 실패. BotLog FAILED | 소셜 채널 침묵 | SNS에 글이 안 올라옴 | ❌ 재시도 없음. 다음 스케줄까지 대기 |
| **Facebook** | 현재 비활성화 상태이므로 영향 없음 | — | — | — |
| **Band API** | 현재 심사중/비활성이므로 영향 없음 | — | — | — |
| **X (Twitter)** | 429 에러 시 즉시 실패. 재시도 없음 | X 채널 침묵 | X에 글이 안 올라옴 | ❌ 재시도 없음 |
| **Slack** | 에이전트 알림 전송 실패. 에이전트 자체는 계속 실행됨 | 모니터링 블라인드 (오류 발생해도 모름) | 내부적으로만. 사용자는 정상처럼 느낌 | ❌ 없음 |
| **Kakao OAuth** | 신규 로그인 불가 | 로그아웃 후 재로그인 불가. 기존 세션은 유지 | "카카오 로그인이 안 됩니다" | ❌ 카카오 측 복구 필요 |

**장애 우선순위 (빠른 조치 순서):**
1. 🔴 **DB 장애** → 서비스 완전 마비 (즉시 조치)
2. 🔴 **Claude 크레딧 소진** → 콘텐츠 생성 전체 중단 (즉시 충전)
3. 🟠 **Slack 장애** → 모니터링 블라인드 (다른 방법으로 확인)
4. 🟠 **SNS API 장애** → 채널 침묵 (다음 날까지 허용 가능)
5. 🟡 나머지 → 폴백 있거나 영향 제한적

---

## 5. CFO 자동 차단 부재 — 구조적 공백

### 문제

**헌법(`agents/core/constitution.yaml`)에는 이렇게 쓰여 있다:**
```yaml
cost_policy:
  monthly_hard_limit: 50  # USD
  action_on_exceed: "immediately_lock_all_agents"
```

**실제 코드(`agents/cfo/cost-tracker.ts`)는:**
```typescript
// 비용을 계산하고 BotLog에 기록하고 Slack으로 알림만 보냄
// automation_status를 'LOCKED'로 변경하는 코드 없음
```

→ **$50 초과해도 에이전트는 계속 실행된다.** 정책은 선언문일 뿐, 집행자가 없다.

### 실제 발생한 일

일 $3.77 소비 × 7일 = $26.39 → $27.50 grant 소진 → -$0.17 초과 → Claude API 중단  
CFO는 이걸 감지했겠지만 자동으로 아무것도 하지 않았다.

### 해결 방안

**단기 (수동):** Anthropic Auto-reload를 $50으로 올려 중단 방지  
**중기 (구현 필요):** `cost-tracker.ts`에 실제 차단 로직 추가

```typescript
// 추가해야 할 코드
if (monthlyCost >= MONTHLY_HARD_LIMIT) {
  await db.systemSetting.upsert({
    where: { key: 'automation_status' },
    update: { value: 'LOCKED' },
    create: { key: 'automation_status', value: 'LOCKED' }
  });
  await notifySlack('system', `🚨 월 비용 $${monthlyCost} 초과 → 에이전트 자동 잠금`);
}
```

---

## 6. 에이전트 품질 문제 (발견된 버그)

### 🔴 즉시 수정 필요

**① 페르소나 불일치 (ContentCurator vs SeedGenerator)**
- `agents/cafe/content-curator.ts`: 페르소나 A~T (20개) 사용
- `agents/seed/generator.ts`: 39+EN 페르소나 사용
- **영향**: 콘텐츠 큐레이터가 없는 페르소나로 글 쓸 수 있음

**② TrendAnalyzer JSON 파싱 실패 침묵**
- max_tokens 4000이 부족하거나 AI가 포맷 어기면 빈 배열 폴백
- **영향**: 매거진 주제 없음 → 매거진 일주일 발행 안 됨
- **수정**: max_tokens 5000 + 파싱 실패 시 Slack `critical` 알림 추가

**③ 매거진 점수 임계값 하드코드**
- `score >= 7` 고정 → 조건 안 맞으면 발행 없음
- **영향**: 주간 트래픽 급감 가능
- **수정**: constitution.yaml `magazine_score_threshold: 6`으로 동적화

**④ 크롤러 쿠키 만료 자동 복구 없음**
- 만료 감지는 함, 재발급 로직 없음
- **영향**: 크롤링 완전 중단

### 🟠 1개월 내 개선

**⑤ 헬스체크가 인프라만 감시** (콘텐츠 품질 미감시)

**⑥ X (Twitter) 재시도 로직 없음**

**⑦ CFO 자동 차단 미구현** (5번 섹션 참고)

---

## 7. 환경변수 전수 조사

### ✅ 정상 사용 중 (53개)

Anthropic, OpenAI (DALL-E + Whisper), Gemini TTS, Perplexity, Database (Supabase/Prisma), Auth (NextAuth/Kakao), Cloudflare R2, SNS (X/Threads/Instagram/Band), Google (GA4/Sheets/Indexing/Ads), Slack (6채널), Bot API Keys (4종), Coupang, Unsplash 등

### ❌ 선언만 됨 / 실제 미사용 (15개)

**Slack 채널 미사용 (12개):**
- SLACK_CHANNEL_CEO_FOUNDER / DAILY_BRIEFING / WEEKLY_REPORT / AGENT_MEETING
- SLACK_CHANNEL_MEETING_LOG / ALERT_URGENT / ALERT_SYSTEM / ALERT_KPI
- SLACK_CHANNEL_LOG_JOBS / LOG_CONTENT / LOG_MARKETING / LOG_COST
- SLACK_CHANNEL_EXPERIMENT / APPROVAL_QUEUE

> **참고:** notifier.ts에서 실제 쓰이는 채널: DASHBOARD, REPORT, QA, SYSTEM, LOG, AGENT (6개)

**기타 미사용 (3개):**
- META_APP_ID / META_APP_SECRET — Facebook 코드에서 page token만 사용
- SENTRY_DSN / SENTRY_AUTH_TOKEN — .env.local에 주석 처리됨
- GITHUB_TOKEN — 사용 파일 없음

---

## 8. 지속가능한 비용 관리 방안

### 단기 (지금 당장 — 1주 이내)

| 조치 | 방법 | 효과 |
|------|------|------|
| **Anthropic Auto-reload $10 → $50** | console.anthropic.com → Billing | 2.5일에서 12.5일치 버퍼 확보 |
| **Perplexity 비용 확인** | Perplexity 콘솔에서 월 청구액 조회 | 미추적 비용 파악 |
| **Facebook 상태 정리** | 활성화 예정 없으면 관련 env 정리 | 혼란 제거 |

### 중기 (1개월 이내)

| 조치 | 방법 | 예상 절감 | 리스크 |
|------|------|----------|--------|
| **CFO 자동 차단 구현** | cost-tracker.ts에 LOCKED 로직 추가 | 초과 방지 | 작업 1시간 |
| **Sonnet 일부 → Haiku 다운그레이드** | COO:moderator, CDO:kpi-collector 등 단순 작업 | ~$15/월 | 품질 소폭 하락 |
| **Opus 전략 에이전트 격주 실행** | weekly-report, social-strategy 격주로 | ~$8/월 | 전략 갱신 주기 늘어남 |
| **X 재시도 로직 추가** | 429 에러 시 exponential backoff | X 채널 안정성 | 작업 30분 |
| **Google Indexing 실패 재시도** | 색인 요청 실패 시 BotLog에 기록 + 재시도 | SEO 연속성 | 작업 1시간 |

### 장기 (분기별)

| 조치 | 목표 |
|------|------|
| **월 API 비용 $50 이하 유지** | Haiku 전환 + Opus 최소화로 헌법 한도 준수 |
| **실시간 비용 대시보드** | CFO cost-tracker → Slack #리포트에 일별 비용 표 발송 |
| **Perplexity → 자체 검색으로 교체 검토** | 비용 추적 어려운 외부 AI 의존도 감소 |
| **Band API 활성화** | 심사 통과 후 즉시 크론 연결 (Band는 50대~60대 주 플랫폼) |

---

## 9. 비상 정지 방법 (비용 폭주 또는 장애 시)

```bash
# 1. 에이전트 전체 잠금 (모니터링만 유지)
# agents/core/constitution.yaml 수정:
automation_status: "LOCKED"
# → $74/월 → $1/월 즉시 전환 (5개 모니터링 에이전트만 실행)

# 2. 개별 workflow 비활성화
gh workflow disable agents-daily.yml
gh workflow disable agents-social.yml
gh workflow disable agents-cafe.yml
gh workflow disable agents-seed.yml

# 3. 상태 확인
gh workflow list
```

**LOCKED 시 유지되는 에이전트 (5개):**
- cto:health-check / error-monitor / security-audit / qa-verify
- cdo:anomaly-detector

---

## 10. 주간 모니터링 체크리스트

### 매주 월요일 (Arch Review 실행 시)

```
[ ] Anthropic 크레딧 잔액 > $30 (console.anthropic.com/billing)
[ ] OpenAI 크레딧 잔액 > $5 (platform.openai.com/billing)
[ ] BotLog CAFE_CRAWLER 성공률 >= 80%
[ ] TrendAnalyzer hotTopics >= 5개 (일주일 평균)
[ ] 매거진 발행 >= 1건/주 (점수 미달 갭 없는지)
[ ] API 월 누적 비용 < $40 (경고 임계값)
[ ] X/Threads/Instagram 토큰 만료 확인 (Meta 60일)
[ ] 페르소나 글 다양성 확인 (한 페르소나 과도 반복 없는지)
[ ] Perplexity 월 청구액 확인
```

---

*파일 위치: `docs/api-cost-audit.md`*  
*다음 업데이트: 신규 API 추가 시 또는 분기별 비용 검토 시*
