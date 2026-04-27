# launchd 로컬 스케줄러 운영 기획서 (I01)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

GHA에서 실행 불가한 에이전트(네이버/Cloudflare IP 차단, Playwright 탐지)를  
Mac launchd로 스케줄링해 완전 자동화를 달성한다.

---

## 배경

- 네이버 카페 크롤러, 펨코 스크래퍼는 GitHub Actions IP에서 차단됨
- Gemini/ChatGPT Playwright 이미지 생성은 GUI 환경 필요 (headless 탐지)
- Mac에서 24시간 항상 켜두는 구조로 로컬 자동화 운영

---

## 세부 기획

### 등록된 Plist 전체 목록 (7개)

| 파일명 | 실행 스크립트 | KST 시간 | 목적 |
|--------|-------------|---------|------|
| `com.unaeo.cafe-crawler-morning.plist` | `run-pipeline.ts deep` | 08:30 | 아침 딥크롤 + 심리분석 + 욕망지도 |
| `com.unaeo.cafe-crawler-lunch.plist` | `run-pipeline.ts quick` | 12:30 | 점심 퀵크롤 (HIGH 게시판만) |
| `com.unaeo.cafe-crawler-evening.plist` | `run-pipeline.ts deep` | 20:40 | 저녁 딥크롤 |
| `com.unaeo.magazine-morning.plist` | `local-magazine-runner.ts` | 10:00 | 매거진 아침 발행 (Gemini) |
| `com.unaeo.magazine-afternoon.plist` | `local-magazine-runner.ts` | 15:00 | 매거진 오후 발행 (Gemini) |
| `com.unaeo.magazine-late.plist` | `local-magazine-runner.ts` | 17:00 | 매거진 저녁 발행 (Gemini) |
| `com.unaeo.session-refresh.plist` | `session-manager.ts` | 02:00 | NID_SES 갱신 (5일 이내 만료 시) |

> plist 저장 위치: `launchd/` (프로젝트 내) + `~/Library/LaunchAgents/` (실제 로드)

---

### launchd vs GHA 역할 분담

**LOCAL ONLY (launchd)**

| 에이전트 | 이유 |
|---------|------|
| 카페 크롤러 (run-pipeline) | 네이버 GHA IP 차단 + headless 탐지 |
| 매거진 생성 (local-magazine-runner) | Playwright Gemini/ChatGPT 이미지 생성, GUI 환경 필요 |
| 펨코 스크래퍼 (fmkorea-scraper) | Cloudflare GHA IP 차단 |
| 네이버 세션 갱신 (session-manager) | NID_SES/NID_AUT 직접 갱신 필요 |

**GHA 전용**

| 에이전트 | 이유 |
|---------|------|
| 시드봇, SNS 포스팅, 일자리봇 등 대부분 | 네이버/Cloudflare 미사용, 클라우드 환경 충분 |

---

### LOCAL ONLY 상세 이유

**1. 네이버 카페 크롤러**
- GitHub Actions IP는 네이버 차단 목록에 포함
- 개인 Mac IP(집/사무실) → 정상 접근
- headless 브라우저 탐지: GHA 완전 headless, Mac은 GUI 환경

**2. Gemini/ChatGPT Playwright 이미지 생성**
- `IMAGE_GENERATOR=gemini` → Playwright로 Gemini 웹UI 조작
- 인터랙티브 GUI 환경 필요 → GHA 불가
- 비용 통제 목적 (Gemini 무료 플랜 활용)

**3. 펨코(FMKorea) 스크래퍼**
- Cloudflare Bot Management → GHA IP 차단
- 로컬 Mac IP만 정상 접근

---

### 환경변수 주입 방식

**방식 A: `EnvironmentVariables` 직접 지정 (크롤러)**
```xml
<key>EnvironmentVariables</key>
<dict>
  <key>PATH</key>
  <string>/Users/yanadoo/.nvm/versions/node/v24.14.0/bin:...</string>
</dict>
```

**방식 B: `.env.local` 로드 (매거진)**
```xml
<key>ProgramArguments</key>
<array>
  <string>/bin/zsh</string>
  <string>-c</string>
  <string>cd /path && set -a && source .env.local && set +a && SESSION_TIME=morning npx tsx agents/cafe/local-magazine-runner.ts</string>
</array>
```

- `set -a`: 모든 변수 자동 export
- `source .env.local`: 환경변수 파일 로드
- `SESSION_TIME=morning|afternoon|late` 인라인 지정

**npx 경로**: `/Users/yanadoo/.nvm/versions/node/v24.14.0/bin/npx`  
(시스템 `/usr/local/bin/npx` 미사용 — nvm 환경)

---

### 로그 경로

```
logs/cafe-crawler.log        (stdout)
logs/cafe-crawler-error.log  (stderr)
```

---

### 세션 갱신 (session-manager.ts)

- NID_SES 만료 5일 전: 자동 갱신 시도
- NID_AUT(~1년 만료) 사용 → headless Playwright로 naver.com 접속 → 새 NID_SES 획득
- 실패 시: `SESSION_HALTED` 플래그 + Slack 3채널 긴급 알림 (`#대시보드`, `#시스템`, `#qa`)

---

### 매거진 로컬 실행 특이사항

- 일일 추적 파일: `.magazine-daily-YYYYMMDD.json` (gitignore)
- 멱등성 보장: `{ morningDone, afternoonDone, lateDone }` 플래그로 중복 발행 방지
- Slack 채널: `#매거진 (C0ARZET1X63)`

---

## 관련 링크

- plist 파일: `launchd/` 폴더
- 실제 로드 위치: `~/Library/LaunchAgents/com.unaeo.*.plist`
- 카페 크롤러: `agents/cafe/run-pipeline.ts`
- 매거진 러너: `agents/cafe/local-magazine-runner.ts`
- 세션 관리: `agents/cafe/session-manager.ts`
- 펨코 스크래퍼: `agents/community/fmkorea-scraper.ts`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |
| 2026-04-27 | npx 경로 `/usr/local/bin/npx` → nvm 경로로 수정 | launchd exit 127 |
| 2026-04-27 | `/bin/zsh` Full Disk Access 추가 | .env.local Documents 폴더 접근 차단 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04-27 | magazine-morning exit 127 | `/usr/local/bin/npx` 존재 안 함 | nvm 경로로 변경 |
| 2026-04-27 | .env.local 읽기 실패 | macOS FDA Documents 폴더 접근 제한 | `/bin/zsh` FDA 추가 |
| 진행중 | NID_SES 주기적 만료 | 네이버 세션 쿠키 5일 유효 | session-manager.ts 02:00 자동 갱신 |
