# 매거진 운영 기획서 (F05 + A02)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

50~60대 욕망 기반 콘텐츠를 매일 자동 생성해 SEO 유입과 체류시간을 확보한다.
연간 48개 시리즈 × 5편 = 240편 예약 콘텐츠로 장기 키워드 커버리지를 구축한다.

---

## 배경

- 직접 콘텐츠 제작 불가 → AI 자동생성으로 운영 부담 없이 콘텐츠 지속 공급
- 네이버 카페 크롤링 → 실제 50~60대 욕망/관심사 실시간 파악 → 주제 자동 선택
- 이미지 생성: Gemini/ChatGPT 웹 UI Playwright 자동화 → **비용 $0**
- 비용: ~$1.5/월 (Anthropic API + R2 저장)

---

## 세부 기획

### 하루 흐름

```
08:30 KST — Mac launchd (로컬)
  crawler.ts → psych-analyzer.ts → trend-analyzer.ts → daily-brief.ts
  └─ 카페 딥크롤 → 욕망/감정 분류 → CafeTrend + DailyBrief DB 저장

09:00 KST — GHA 폴백
  daily-brief-fallback.ts → Mac 미실행 시 어제 DailyBrief 복사

15:00 KST — Mac launchd (SESSION_TIME=morning, IMAGE_GENERATOR=gemini)
  local-magazine-runner.ts → magazine-generator.ts → 1~2편 발행

17:00 KST — Mac launchd (SESSION_TIME=late, IMAGE_GENERATOR=gemini)
  local-magazine-runner.ts → magazine-generator.ts → 최종 Slack 알림
```

### 주제 선택 우선순위

```
1순위: 시리즈 편 (score=10, 월요일만, agents/magazine/series-plan.ts)
2순위: GEO_SEED 지역 주제
3순위: CafeTrend.magazineTopics (score ≥ 7)
4순위: 욕망 힌트 폴백 (DESIRE_TOPIC_HINTS[dominantDesire])
```

### 가드레일

| 조건 | 처리 |
|------|------|
| IMAGE_GENERATOR 미설정 | 발행 즉시 스킵 (클라우드 환경 감지) |
| 일일 3편 초과 | 스킵 |
| 본문 500자 미만 | 스킵 |
| 히어로 이미지 생성 실패 | 발행 보류 + Slack #시스템 경고 |
| 제목 중복 (최근 30일) | 스킵 |

### 이미지 생성 3-tier

| 순위 | 엔진 | 방식 | 비용 |
|------|------|------|------|
| 1 | Gemini/ChatGPT | Playwright 브라우저 자동화 | $0 |
| 2 | Unsplash | API (FOOD/SCENE/OBJECT만) | $0 |
| 3 | DALL-E 3 | OpenAI API (현재 비활성) | $0.04/장 |

### 카테고리 (8개)

건강 / 재테크 / 은퇴준비 / 일자리 / 생활 / 여행 / 문화 / 요리

### 연간 시리즈 계획

- `agents/magazine/series-plan.ts`: 48개 시리즈 × 5편 = 240편 예약
- 발행: 매주 월요일 자동 발행
- 예시: "50대 갱년기 완벽 가이드" (5편 연재)

### SEO 처리

- slug 자동 생성 (한글 키워드 기반)
- CUID 접근 시 slug로 308 영구 리다이렉트
- Article + FAQ + Breadcrumb JSON-LD 자동 생성
- 발행 즉시 Google Indexing API 요청

### 광고 배치

| 위치 | 광고 |
|------|------|
| 목록 FeaturedCard 아래 | AdSense IN_FEED (5592036395) |
| 목록 8번째 카드 아래 | 쿠팡 배너 320×100 |
| 상세 본문 아래 | AdSense IN_ARTICLE (2965873058) |
| 상세 CPS 아래 | 쿠팡 검색 위젯 iframe |

---

## 관련 링크

- 생성 엔진: `agents/cafe/magazine-generator.ts`
- launchd 진입점: `agents/cafe/local-magazine-runner.ts`
- 이미지 생성: `agents/cafe/local-image-generator.ts`
- 썸네일: `agents/cafe/thumbnail-generator.ts`
- AI 프롬프트: `agents/magazine/prompt.ts`
- 시리즈 계획: `agents/magazine/series-plan.ts`
- CPS 매칭: `agents/cafe/cps-matcher.ts`
- 목록 페이지: `src/app/(main)/magazine/page.tsx`
- 상세 페이지: `src/app/(main)/magazine/[id]/page.tsx`
- launchd plists: `~/Library/LaunchAgents/com.unaeo.magazine-*.plist`
- DB 모델: `prisma/schema.prisma` — Post (boardType=MAGAZINE), CpsLink, CafeTrend, DailyBrief

---

## 비용 영향

- Anthropic API: ~$1/월 (평일 Sonnet, 일요일 Opus)
- R2 이미지 저장: ~$0.5/월
- **합계: ~$1.5/월** (Constitution 상한 $50/월 대비 여유 있음)

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 | Feature Lifecycle 도입 |
| 2026-04-27 | launchd npx 경로 수정 (nvm 경로로 변경) + Full Disk Access 부여 | `/usr/local/bin/npx` 존재하지 않아 exit 127 |
| 2026-04-27 | MagazineFilter 활성탭 `text-foreground` → `text-white` | bg-primary 위 text-foreground WCAG 컨트라스트 위반 수정 |
| 2026-04-28 | SESSION_TIME 정규화 (afternoon/late → morning/evening) + notifySlack 문자열→NotifyPayload 수정 + PERSON_REAL unsplashQuery 허용 + gemini-scraper 타임아웃 스크린샷 추가 | 매거진 발행 0건 원인 4개 수정 (SESSION_TIME 불일치, Slack invalid_blocks, Unsplash 폴백 차단, 디버그 강화) |
| 2026-04-29 | 상세 H2 제목 중복 제거 / CSP GA4 도메인 추가 / favicon.ico 복구 / CPS 섹션 홀딩(CPS_ENABLED=false) / 썸네일=히어로 이미지 직접 사용 / seoTitle 50자 / maxArticles 3 / CafeTrend 없을 때 욕망지도 폴백 / 목록 카드 preview 표시 | Playwright 전방위 검수 후 기획-현실 갭 P0~P2 수정 |
| 2026-05-02 | MagazineSection.tsx Link에 `prefetch={false}` + `article.slug ?? article.id` 적용 | 홈 리스트 진입 시 동시 prefetch 폭격으로 DB connection pool 포화 → 버퍼링 해소 |
| 2026-05-04 | launchd plist ProgramArguments → `scripts/run-magazine.sh` 래퍼 스크립트로 교체 | afternoon/late exit 127 — plist PATH에 nvm node 경로 미포함 (`env: node: No such file or directory`) |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04-27 | morning exit 127 | launchd plist npx 경로 `/usr/local/bin/npx` 없음 | `/Users/yanadoo/.nvm/versions/node/v24.14.0/bin/npx`로 변경 |
| 2026-04-27 | .env.local 읽기 실패 | macOS Full Disk Access Documents 폴더 접근 제한 | /bin/zsh Full Disk Access 추가 |
| 2026-04-05 | imageHints undefined 크래시 | agents-daily 07:46 실행 시 필드 누락 | imageHints 방어 코드 추가 |
| 2026-04-28 | 매거진 0건 발행 | Gemini 로그인 만료 + SESSION_TIME 불일치 + Slack invalid_blocks + PERSON_REAL unsplashQuery 미생성 4중 복합 원인 | 3개 코드 버그 수정 + 사용자 수동 Gemini 재로그인 → 1건 발행 성공 확인 |
| 2026-05-04 | afternoon/late exit 127, morning exit 0 (미실행) | plist ProgramArguments의 `/usr/local/bin/npx` shebang이 nvm node(`~/.nvm/versions/node/v24.14.0/bin/`) 미포함 PATH 참조 | `scripts/run-magazine.sh` 절대경로 래퍼 스크립트로 교체 |
