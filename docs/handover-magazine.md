# 매거진 시스템 인수인계서

> 작성일: 2026-05-12 | 대상: 우나어(age-doesnt-matter.com) 매거진 영역 전체
> 작성 기준: 코드 전수검사 + 실측 로그 분석

---

## 1. 시스템 개요

매거진은 **AI 자동 발행** 시스템으로, 인간 개입 없이 하루 2회 기사를 생성·발행합니다.

```
launchd (macOS 스케줄러)
  └─ 11:00 KST (morning 세션) → 기사 생성 + DB 발행
  └─ 14:00 KST (late 세션)   → 기사 생성 + Slack 알림
```

**담당 DB 테이블**: `Post` (boardType = 'MAGAZINE')
**봇 작성자 ID**: editorUserId (매거진 전용 봇 계정 — 정순씨)
**Slack 채널**: #매거진 (C0ARZET1X63)

---

## 2. 파일 구조

```
agents/cafe/
├── local-magazine-runner.ts      # launchd 진입점 (오케스트레이터)
├── magazine-generator.ts         # 기사 선정 + 생성 + DB 발행
├── image-generator.ts            # 이미지 라우팅 (Gemini → Unsplash → null)
├── local-image-generator.ts      # Playwright 기반 Gemini/ChatGPT 스크래퍼
├── sanitize.ts                   # HTML 새니타이제이션 + 이미지 프록시
└── preload-eagain-retry.cjs      # EAGAIN 에러 방어 (Node.js 파일시스템)

agents/magazine/
└── series-plan.ts                # 48개 시리즈 연간 계획

scripts/
└── launchd-alert.sh              # launchd 실패 시 Slack 알림 래퍼

~/Library/LaunchAgents/
├── com.unaeo.magazine-morning.plist   # 11:00 KST (ACTIVE)
├── com.unaeo.magazine-late.plist      # 14:00 KST (ACTIVE)
└── com.unaeo.magazine-afternoon.plist # INACTIVE (비활성 보존)

src/app/(main)/magazine/
├── page.tsx                      # 목록 페이지
└── [id]/page.tsx                 # 상세 페이지 (JSON-LD, og 태그)

src/lib/queries/posts/
└── posts.magazine.ts             # getMagazineList, getRelatedMagazinePosts
```

---

## 3. 실행 파이프라인 (코드 흐름)

### 3-1. 전체 흐름

```
launchd 트리거
  → launchd-alert.sh (래퍼: 실패 시 Slack 알림)
    → tsx local-magazine-runner.ts
        1. dotenv 로드 (.env.local, 85개 변수)
        2. R2 dynamic import (dotenv 이후 — S3Client 초기화 보장)
        3. SESSION_TIME 정규화: late → evening, 나머지 → morning
        4. magazine-generator.ts 호출 → PostId[] 반환
        5. daily JSON 관리 (morning: 저장, evening: 합산 후 삭제)
        6. Slack 알림 (evening 세션만 전송)
```

### 3-2. 기사 선정 우선순위 (magazine-generator.ts)

```
1순위: 시리즈 편 (score=10, 월요일만)
2순위: GEO 시드 주제 (지오시드 에이전트 결과)
3순위: 트렌드 분석 주제 (카페 트렌드 에이전트 결과)
4순위: 욕망 지도 폴백 (1~3 모두 없을 때 — HEALTH/MONEY/RELATIONSHIP 등)
```

**필터 조건:**
- score ≥ 7점
- isSimilarTitle() 통과 (최근 30일 제목 첫 3단어 중 2개 미만 겹침)
- 일일 3편 한도 미초과 (`prisma.post.count` 기준)

### 3-3. 기사 생성 모델

| 요일 | 모델 |
|------|------|
| 월~토 | claude-sonnet-4-6 (HEAVY) |
| 일요일 | claude-opus-4-6 (STRATEGIC) |

### 3-4. 이미지 생성 흐름

```
IMAGE_GENERATOR=gemini (plist 환경변수)
  → local-image-generator.ts
    → gemini-scraper.js (Playwright, Chrome 프로필: ~/.chrome-gemini-profile)
      → 성공: buffer → R2 업로드 → r2.dev URL 반환
      → 실패/타임아웃(120초): null 반환
  → Unsplash 폴백 (PERSON_REAL, FOOD_PHOTO, SCENE_PHOTO, OBJECT_PHOTO만)
    → fetchUnsplashPhoto() → R2 업로드 (2회 재시도) → r2.dev URL
    → 실패: null
  → null 반환 → 히어로 이미지 없음 → 기사 발행 보류
```

**이미지 타입별 처리:**
- `PERSON_REAL`: 한국 여성 4050 실사 프롬프트
- `FOOD_PHOTO / SCENE_PHOTO / OBJECT_PHOTO`: 카테고리별 프롬프트
- `ILLUSTRATION`: local-image-generator에서 null 반환 (DALL-E 폴백 비활성화)

### 3-5. DB 발행 (publishMagazine)

```typescript
prisma.post.create({
  boardType: 'MAGAZINE',
  source: 'BOT',
  status: 'PUBLISHED',
  slug,          // 한글 키워드 기반 유니크
  seoTitle,      // og:title 소스
  seoDescription,// og:description 소스
  thumbnailUrl,  // R2 URL (og:image 소스)
  seriesId,      // 시리즈 편일 때만
  seriesOrder,   // 시리즈 순서 (1, 2, ...)
  seriesCount,   // 시리즈 총 편수
})
```

---

## 4. 스케줄 설정

### 현재 활성 스케줄

| plist 파일 | 실행 시각 | SESSION_TIME | 역할 |
|-----------|---------|------------|------|
| magazine-morning | 11:00 KST | morning | 기사 생성 + JSON 저장, Slack 없음 |
| magazine-late | 14:00 KST | late (→ evening) | 기사 생성 + Slack 통합 알림 + JSON 삭제 |
| magazine-afternoon | **비활성** | — | 파일 보존, launchctl 미등록 |

### plist 공통 설정

```xml
ProgramArguments:
  /bin/bash → launchd-alert.sh magazine-{name} → tsx → local-magazine-runner.ts

EnvironmentVariables:
  PATH: .../node_modules/.bin:/...nvm.../bin:/usr/local/bin:...
  HOME: /Users/yanadoo
  SESSION_TIME: morning | late
  IMAGE_GENERATOR: gemini
  NODE_OPTIONS: --require .../preload-eagain-retry.cjs

StandardOutPath: /Users/yanadoo/Documents/New_Claude_agenotmatter/logs/magazine-{name}.log
```

### 스케줄 변경 방법

```bash
# Hour 값 변경 후
launchctl unload ~/Library/LaunchAgents/com.unaeo.magazine-{name}.plist
# (plist 편집)
launchctl load ~/Library/LaunchAgents/com.unaeo.magazine-{name}.plist

# 주의: Mac 시간대 KST → Hour 값 = KST 시각 그대로 (UTC 변환 불필요)
```

---

## 5. 일일 상태 파일

**경로**: `agents/cafe/.magazine-daily-YYYY-MM-DD.json`
**gitignore**: ✅ (버전 관리 제외)

```json
{
  "date": "2026-05-12",
  "morningDone": true,
  "morningArticles": [
    { "title": "베란다 상추 한 잎의 위로", "category": "요리", "postId": "cmoy0n...", "engine": "gemini" }
  ],
  "eveningDone": false,
  "eveningArticles": []
}
```

- morning 세션: morningArticles 저장
- evening(late) 세션: eveningArticles 추가 → Slack 전송 → 파일 삭제

---

## 6. 프론트엔드 구조

### 목록 페이지 (`/magazine`)

- 캐시: 60초 (검색/카테고리 필터 시 bypass)
- 레이아웃: Featured 카드(1건) + 광고 + Grid(나머지)
- 광고: 8번째 카드 뒤 쿠팡 배너
- JSON-LD: CollectionPage

### 상세 페이지 (`/magazine/[id]`)

- SSG: 상위 50건 사전 생성 (viewCount DESC)
- Slug 기반 canonical URL (`/magazine/{slug}`)
- id로 접근 시 slug로 308 permanent redirect

**SEO 메타 태그 소스:**

| 태그 | 소스 필드 | fallback |
|------|---------|---------|
| og:title | `seoTitle` | `title` |
| og:description | `seoDescription` | 본문 첫 150자 → `preview` |
| og:image | `thumbnailUrl` | 본문 첫 img src → /logo.png |
| canonical | `/magazine/{slug}` | `/magazine/{id}` |

**JSON-LD 3종:**
1. **Article** — headline, description, datePublished, publisher, author, image
2. **BreadcrumbList** — 홈 > 매거진 > 글 제목
3. **FAQPage** — `<!-- FAQ_START/END -->` 마커 기반 추출

**누락 중인 Article 필드 (미구현):**
- `inLanguage: 'ko'`
- `articleSection` (카테고리)
- `keywords` (태그/seoTitle)
- `wordCount`

---

## 7. 이미지 처리 (sanitize.ts)

```typescript
// 렌더링 파이프라인
post.content
  → sanitizeMagazineHtml()  // XSS 방지 + 마크다운 아티팩트 제거
  → proxyMagazineImages()   // R2/Unsplash URL → /_next/image 프록시
  → dangerouslySetInnerHTML
```

**proxyMagazineImages가 처리하는 URL 패턴:**
- `*.r2.dev` / `*.r2.cloudflarestorage.com` (Cloudflare R2)
- `img.age-doesnt-matter.com` (R2 커스텀 도메인)
- `images.unsplash.com` (Unsplash 원본)

**og:image는 프록시 미적용** — DB `thumbnailUrl` 값을 직접 사용 (R2 URL이어야 정상)

---

## 8. 시리즈 연재 계획

**규모**: 48개 시리즈 × 5편 = 240편 연간 계획
**파일**: `agents/magazine/series-plan.ts`
**발행 조건**: 월요일만 (`getActiveSeriesToday` — dayOfWeek === 1)

**2026년 시리즈 목록 (일부):**

| 분기 | 시리즈명 | 카테고리 |
|------|---------|---------|
| Q1 | 50대 갱년기 완벽 가이드 | 건강 |
| Q1 | 국민연금 완전 정복 | 재테크 |
| Q1 | 중년에 진짜 친구 만들기 | 관계 |
| Q1 | 50대 건강 식단 기본기 | 요리 |
| Q2 | 퇴직 후 6개월 생존 가이드 | 은퇴준비 |
| Q2 | 50대 재취업 성공 스토리 | 일자리 |
| Q2 | 자녀 떠난 집, 나만의 공간 | 생활 |
| Q2 | 50대 필수 건강검진 완전 정복 | 건강 |
| Q3 | 50대 무릎·관절 완전 가이드 | 건강 |
| Q3 | 우리 또래 국내여행 추천 | 여행 |
| Q4 | 50대 가을·겨울 스타일링 | 패션 |
| Q4 | 연말 노후 준비 점검 | 재테크 |

---

## 9. 환경변수 (필수)

| 변수명 | 용도 | 출처 |
|-------|------|------|
| `ANTHROPIC_API_KEY` | Claude API (기사 생성) | .env.local |
| `DATABASE_URL` | Prisma DB 연결 | .env.local |
| `SLACK_BOT_TOKEN` | Slack 알림 전송 | .env.local |
| `SLACK_CHANNEL_MAGAZINE` | 매거진 발행 알림 채널 | .env.local (기본: C0ARZET1X63) |
| `SLACK_CHANNEL_ALERT_SYSTEM` | launchd 실패 알림 채널 | .env.local |
| `IMAGE_GENERATOR` | gemini \| chatgpt (plist에서 설정) | LaunchAgents plist |
| `SESSION_TIME` | morning \| late (plist에서 설정) | LaunchAgents plist |
| `CLOUDFLARE_ACCOUNT_ID` | R2 업로드 | .env.local |
| `CLOUDFLARE_R2_ACCESS_KEY` | R2 인증 | .env.local |
| `CLOUDFLARE_R2_SECRET_KEY` | R2 인증 | .env.local |
| `CLOUDFLARE_R2_BUCKET` | R2 버킷명 | .env.local |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | R2 공개 URL 프리픽스 | .env.local |
| `UNSPLASH_ACCESS_KEY` | Unsplash 이미지 폴백 | .env.local |

---

## 10. 로그 위치

| 로그 | 경로 | 비고 |
|------|------|------|
| morning 실행 | `logs/magazine-morning.log` | plist StandardOutPath |
| late 실행 | `logs/magazine-late.log` | plist StandardOutPath |
| 실시간 확인 | `/tmp/magazine-*.log` | 이전 실행 잔여 |
| 일일 상태 | `agents/cafe/.magazine-daily-YYYY-MM-DD.json` | 세션 간 중간 상태 |

```bash
# 실시간 로그 확인
tail -f logs/magazine-morning.log

# 오늘 발행 현황
cat agents/cafe/.magazine-daily-$(date +%Y-%m-%d).json
```

---

## 11. 알려진 이슈 및 제약

### 운영 이슈

| 이슈 | 상태 | 설명 |
|------|------|------|
| Slack `not_in_channel` | ✅ 해결 (2026-05-12) | 봇(@agedoesntmatter) #magazine 채널 초대 완료 |
| Gemini 로그인 세션 만료 | ⚠️ 간헐적 | Chrome 프로필 세션 만료 시 Unsplash 폴백으로 처리 |
| Claude API 타임아웃 | ⚠️ 간헐적 | 3번째 기사 생성 중 간헐적 발생 |
| Coupang API 401 | ❌ 미해결 | CPS 매칭 실패 (기사 발행에는 영향 없음) |

### 구조적 제약

| 항목 | 내용 |
|------|------|
| **일일 한도** | 3편 hardcoded (magazine-generator.ts:318) |
| **macOS 전용** | launchd + Playwright Chrome — Linux 실행 불가 |
| **GHA 비활성** | agents-daily.yml 150-152행 주석 처리 (로컬 전담) |
| **ILLUSTRATION 폴백 없음** | DALL-E 연동 주석 처리 → 히어로 없으면 발행 보류 |
| **히어로 필수** | 이미지 없으면 기사 발행 보류 (magazine-generator.ts:455) |

### SEO 미완성 항목

| 항목 | 상태 | 파일 |
|------|------|------|
| Article JSON-LD `inLanguage` | ❌ 미구현 | `src/app/(main)/magazine/[id]/page.tsx` |
| Article JSON-LD `keywords` | ❌ 미구현 | 동일 |
| Article JSON-LD `wordCount` | ❌ 미구현 | 동일 |
| Article JSON-LD `articleSection` | ❌ 미구현 | 동일 |
| 구형 글 FAQPage JSON-LD | ❌ 5/5 이전 글 | 재발행 필요 |

---

## 12. 운영 체크리스트 (일상)

```bash
# 1. 오늘 발행 현황 확인
cat agents/cafe/.magazine-daily-$(date +%Y-%m-%d).json

# 2. 최근 실행 로그
tail -50 logs/magazine-morning.log
tail -50 logs/magazine-late.log

# 3. launchd 상태
launchctl list | grep magazine

# 4. 최근 3일 발행 편수 (DB 직접)
# Supabase 콘솔 → SELECT COUNT(*), DATE(publishedAt) FROM Post
# WHERE boardType='MAGAZINE' AND source='BOT' GROUP BY DATE(publishedAt) ORDER BY 2 DESC LIMIT 3
```

---

## 13. 장애 대응

### 매거진이 하루 종일 0편 발행된 경우

1. `launchctl list | grep magazine` — 상태 확인
2. `tail -50 logs/magazine-morning.log` — 에러 확인
3. **exit 127 / "can't open input file"**: launchd TCC 이슈 → plist 재확인
4. **dotenv 미로드**: `local-magazine-runner.ts` 상단 dotenv 로드 확인
5. **R2 미설정**: `[R2] CLOUDFLARE_ACCOUNT_ID 미설정` 로그 확인 → dotenv 순서 문제
6. 수동 실행: `launchctl start com.unaeo.magazine-morning`

### Gemini 로그인 만료 시

1. Chrome 완전 종료
2. Gemini 프로필로 Chrome 열기: `open -a "Google Chrome" --args --user-data-dir=$HOME/.chrome-gemini-profile`
3. gemini.google.com 로그인
4. Chrome 종료
5. 다음 스케줄 자동 실행 (또는 수동 실행)

### 이미지 없어서 발행 보류 반복 시

1. Gemini 로그인 확인
2. 로그에서 `[ImageGen] 이미지 수급 불가` 확인
3. `IMAGE_GENERATOR` 환경변수를 plist에서 제거 → DALL-E API 폴백 복구 (OPENAI_API_KEY 필요)

---

## 14. 코드 변경 시 주의사항

### local-magazine-runner.ts 수정 시
- dotenv 로드가 **모든 static import 이후, R2 dynamic import 이전** 위치 유지 필수
- `await import('../../src/lib/r2.js')` — top-level await, ESM 전용

### magazine-generator.ts 수정 시
- `isSimilarTitle()` 로직 변경 시 중복 발행 위험
- 일일 한도(3편) 변경 시 비용 영향 계산 필수: Sonnet 약 $0.03/편 × 3 = ~$0.09/일

### plist 수정 시
- 반드시 `launchctl unload` → 수정 → `launchctl load` 순서
- Mac 시간대 KST → Hour 값 = KST 시각 (UTC 변환 불필요)
- 새 plist 추가 시 `agents-daily.yml`에 `// LOCAL ONLY` 주석 명시

### 이미지 프록시 수정 시 (sanitize.ts)
- `proxyMagazineImages()`는 `<img>` 태그만 처리 — `og:image` meta 태그 미처리
- 새 이미지 소스 추가 시 패턴 배열에 추가 필요

---

## 15. 향후 개선 과제

| 우선순위 | 과제 | 예상 공수 |
|---------|------|---------|
| ✅ 완료 | Slack 봇 #magazine 채널 초대 | 2026-05-12 완료 |
| P2 | Coupang API 키 갱신 | 30분 (기사 발행 무영향) |
| P2 | Article JSON-LD 필드 보강 (inLanguage 등) | 15분 |
| P2 | 구형 글 FAQPage 재생성 (5/5 이전) | 1~2시간 |
| P2 | Gemini 로그인 체크 로직 개선 | 30분 |
| P3 | ILLUSTRATION 타입 DALL-E 폴백 재활성화 | 1시간 |
| P3 | 매거진 발행 Admin 대시보드 | 3시간 |
