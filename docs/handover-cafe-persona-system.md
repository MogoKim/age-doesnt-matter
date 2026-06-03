# 우나어 자동화 시스템 인수인계 문서
> 작성일: 2026-05-11 | 대상: 후임 기획자 (비개발자) | 버전: 1.0
>
> 이 문서에 기재된 모든 수치와 설정값은 실제 코드 파일에서 직접 확인한 사실만 기재했습니다.

---

## 섹션 0. 지금 당장 알아야 할 것들

### A. 현재 정상 작동 중인 것들

| 시스템 | 실행 주체 | 횟수/일 | 시간 (KST) |
|-------|---------|--------|-----------|
| 네이버 카페 크롤링 | 맥북 로컬 launchd | 3회 | 08:30 (deep) / 12:30 (quick) / 20:40 (deep) |
| 트렌드 분석 (GHA) | GitHub Actions | 3회 | 09:00 / 13:30 / 20:30 |
| 매거진 생성 | 맥북 로컬 launchd | 2회 | 11:00 / 14:00 |
| 시드봇 메인 활동 | GitHub Actions | 13회 | 09~22시 + 00~01시 (13 슬롯) |
| 시드봇 마이크로 활동 | GitHub Actions | 6회 | 08/12/18/23/00/01시 |
| SNS 자동 게시 | GitHub Actions | 2회 | 11:00 / 15:00 |
| 일자리 수집 | GitHub Actions | 3회 | 12:00 / 16:00 / 20:00 |
| 세션 쿠키 갱신 체크 | 맥북 로컬 launchd | 1회 | 02:00 |

**일일 시드봇 목표 수치:**
- 글쓰기: 25~30개 / 댓글: 150~200개 / 대댓글: 60~80개 / 좋아요: 100~120개

---

### B. 확인된 문제/리스크

| 심각도 | 문제 | 현재 상황 |
|-------|------|---------|
| **높음** | 네이버 로그인 쿠키(NID_AUT) 만료 시 수동 로그인 불가피 | 1년에 1번 반드시 수동 처리 필요. 자동 복구 없음 |
| **높음** | 매거진 생성이 맥북에만 종속 | 맥북 꺼지면 매거진 생성 즉시 중단 |
| **높음** | MAU 21명 (목표 500명) | 비즈니스 KPI 대폭 미달 중 |
| **중간** | 2026-05-10 저녁 매거진 미발행 기록됨 | eveningDone: false 확인. 재시도 로직 없음 |
| **중간** | DISPATCH ONLY 태스크 6개 미연결 | Google Ads, Band API, 82cook 크롤링 등 — API 심사 대기 |
| **낮음** | 에이전트 비용 상한 $50 초과 시 즉시 중단 | 단계별 경고 없이 바로 중단됨 |

---

### C. 첫 주 필수 확인 체크리스트

- [ ] Slack 6개 채널 모두 정상 알림 오는지 확인 (#대시보드 / #리포트 / #QA / #시스템 / #로그 / #에이전트)
- [ ] 네이버 쿠키 만료일 확인 — `agents/cafe/session-manager.ts` 실행 결과 Slack #시스템 메시지 확인
- [ ] 오늘 매거진 발행됐는지 확인 — Slack #대시보드에서 일일 매거진 요약 메시지 확인
- [ ] 시드봇 BotLog 성공률 확인 — GitHub Actions → agents-seed.yml 마지막 실행 결과
- [ ] 맥북 launchd 7개 plist 가동 상태 확인: `launchctl list | grep unaeo` (7개 줄 나와야 정상)

---

### D. 절대 건드리면 안 되는 파일 4개

| 파일 | 이유 |
|-----|------|
| `agents/cafe/storage-state.json` | 네이버 로그인 세션 쿠키 저장소. 잘못 수정하면 전체 크롤링 즉시 중단 |
| `agents/core/constitution.yaml` | 에이전트 헌법 v5.0. 모든 AI 행동 규칙 정의. 수정 시 봇 이상행동 위험 |
| `.env.local` | 100개 이상 API 키/토큰 저장. git 커밋 절대 금지 |
| `agents/seed/persona-data.ts` | 60명 봇 페르소나 전체 정의. 수정하면 봇 캐릭터 붕괴 |

---

## 섹션 1. 전체 시스템 흐름도

```
[네이버 카페 2곳: 우아한갱년기 / 은퇴후50년]
         │
         │  글+댓글+이미지 수집 (맥북, 하루 3회)
         │  Playwright 브라우저 — 네이버 IP 차단 회피 목적
         ▼
[CafePost DB] — 하루 최대 210건 저장
         │
         │  Claude Haiku 배치 심리 분석 (GHA, 하루 3회)
         │  감정 10종 + 욕망 13종 + 긴급도 5단계 태깅
         ▼
[CafePost DB] — emotionTags / desireCategory / urgencyLevel 업데이트
         │
         │  Claude Sonnet 트렌드 종합 (GHA, 하루 3회)
         ▼
[CafeTrend DB]
   hotTopics(7개) / keywords(15개) / desireMap(13종 비율)
   magazineTopics(3개) / controversyTopics(2개)
         │
         ├──────────────────────────────────────────────────┐
         │  욕망지도 기반 페르소나 할당량 계산                    │
         ▼                                                  │
[DailyBrief: 58명 페르소나별 오늘 활동 배율(0.5×~2.0×)]        │
         │                                                  │
    ┌────┴──────────────────┐                               │
    │                       │                               │
    ▼                       ▼                               ▼
[매거진 생성]          [시드봇 58명 활동]            [CMO SNS 게시]
맥북 3회/일             GHA 13+6 슬롯/일             GHA 2회/일
Claude Sonnet/Opus      글+댓글+대댓글+좋아요          Threads/X/IG/FB
Gemini 이미지            논쟁체인 자동 유도
    │                       │
    ▼                       ▼
[Post DB — boardType=MAGAZINE]   [Post DB — boardType=STORY/HUMOR/JOB/MONEY/RETIRE]
    │
    ▼
[Google Search Console 인덱싱 요청]
[쿠팡 파트너스 상품 매칭]
```

**핵심 원칙**: 맥북이 꺼지면 크롤링과 매거진 생성이 중단됩니다. GitHub Actions(GHA)는 계속 실행되지만 새 카페 데이터 없이는 품질이 떨어집니다.

---

## 섹션 2. 네이버 카페 딥 크롤링 — 완전 해부

### 2-1. 수집 대상 카페 2개

| 카페명 | URL | 게시판 수 | 주요 욕망 주제 |
|-------|-----|---------|------------|
| 우아한 갱년기 | cafe.naver.com/wgang | 25개 | 건강/가족/관계/돈/갱년기 |
| 은퇴 후 50년 | cafe.naver.com/dlxogns01 | 36개 | 은퇴/돈/일자리/건강/취미 |

---

### 2-2. 게시판 우선도 분류

**우아한갱년기 — HIGH (QUICK/DEEP 모두 수집):**
인기글, 갱년기몸증상, 갱년기마음증상, 갱년기극복후기, 혼잣말반말일기,
딸아들이야기, 남편이야기, 친구이야기, 친정댁시댁, 일터이야기,
싱글이야기, 돈이야기, 은퇴노후계획, 자유주제, 운동다이어트,
약영양제건강병원, 취미특기, TV연예인영상 (총 18개)

**우아한갱년기 — MEDIUM (DEEP 때만 추가 수집):**
지인이야기, 보험이야기, 식품집밥, 성형피부헤어패션, 독서공부자격증 (5개)

**SKIP (수집 안 함):** 가입인사, 공지, 광고, 이벤트 등

은퇴후50년도 동일한 방식으로 분류 (36개 중 고우선 23개)

---

### 2-3. DEEP vs QUICK 모드 차이

| 항목 | DEEP (08:30, 20:40) | QUICK (12:30) |
|-----|---------------------|---------------|
| 수집 게시판 | HIGH + MEDIUM 전체 | HIGH만 |
| 페이지 수 | 게시판당 최대 3페이지 | 1페이지 |
| 댓글 수집 | 글당 최대 15개 + 대댓글 포함 | 수집 안 함 |
| 카페당 최대 | 80개 | 15개 |
| 요청 딜레이 | 2,000ms (느리게 — 탐지 회피) | 1,000ms |
| 전체 최대 | 160건/회 | 50건/회 |

---

### 2-4. 네이버 로그인 유지 방식 (핵심!)

네이버는 두 가지 쿠키가 동시에 있어야 로그인 유지됩니다:

| 쿠키명 | 유효기간 | 갱신 방법 | 만료 시 |
|-------|--------|---------|-------|
| **NID_AUT** | 1년 | 수동 로그인만 가능 (자동 갱신 불가) | 크롤링 전체 중단 |
| **NID_SES** | 5일 | 매일 새벽 02:00 launchd 자동 갱신 | 자동 복구 시도 |

**쿠키 저장 위치:** `agents/cafe/storage-state.json`

**경고 단계:**
- NID_AUT 60일 이내 → Slack #시스템 경고 알림
- NID_AUT 30일 이내 → 매일 #대시보드 + #시스템 이중 알림
- NID_SES 5일 이내 → 02:00 KST 자동 갱신 시도
- 갱신 3회 연속 실패 → `SESSION_HALTED` 플래그 활성화 → **크롤링 전체 중단** + 3채널 동시 긴급 알림

---

### 2-5. 크롤링 단계별 실행 과정

```
1. SESSION_HALTED 플래그 확인 → 있으면 전체 중단 (Slack 알림)
2. storage-state.json에서 NID_AUT / NID_SES 쿠키 유효성 확인
3. Playwright Chromium 브라우저 실행 (headless: false — 자동화 탐지 회피)
4. 게시판 목록 순회 → 글 URL 목록 수집
5. 각 글 URL 접속:
   - 신형식 시도: cafe.naver.com/f-e/...
   - 실패 시 구형식 폴백: iframe URL 방식
6. 데이터 추출: 제목 / 본문 / 댓글 / 이미지 URL / 조회수 / 좋아요 / 날짜 / 작성자
7. 품질 점수 계산 → 30점 미만은 저장 안 함
8. 블랙리스트 키워드 필터링 (정치 / 광고 / 불법 콘텐츠)
9. CafePost DB 저장 (sourceUrl 기준 중복 제거)
10. 락파일 /tmp/unao-crawler.lock 해제
```

---

### 2-6. 품질 점수 공식

```
품질점수 = (참여도 × 40%) + (본문길이 × 20%) + (미디어 × 5%) + (게시판우선도 × 20%) + (최신성 × 15%)
```

- **30점 미만** → DB 저장 안 함 (버림)
- **30~59점** → DB 저장, isUsable=false (참고용만)
- **60점 이상** → isUsable=true (매거진/트렌드 분석에 활용)

---

### 2-7. 크롤링 실패 시 자동 처리

| 상황 | 자동 처리 |
|-----|---------|
| 한 카페에서 5회 연속 실패 | 해당 카페 스킵 + Slack 알림 |
| 수집 건수 10건 미만 | 쿠키 만료 의심 → Slack 경고 + 파이프라인 중단 |
| 중복 실행 감지 | `/tmp/unao-crawler.lock` 파일 확인 (30분 TTL) |

---

### 2-8. GHA vs 맥북 역할 분리 (중요!)

**맥북 로컬 전용 (네이버 IP 차단 회피 필수):**
- 네이버 카페 크롤링 (Playwright 브라우저 필요)
- 매거진 이미지 생성 (Playwright + Gemini)
- 네이버 세션 쿠키 갱신

**GitHub Actions 전용 (클라우드에서 실행):**

| 워크플로우 | 실행 시간 (KST) | 역할 |
|----------|--------------|------|
| agents-cafe.yml | 09:00 / 13:30 / 20:30 | 트렌드 분석 + 큐레이션 |
| agents-cafe.yml | 10:30 / 14:00 / 21:00 | sheet-scrape (오유/네이트판) |
| agents-cafe.yml | 09:30 | DailyBrief 생성 모니터 |
| agents-seed.yml | 09,10,11,13,15,16,17,19,20,21,22,00,01시 (13 슬롯) | 시드봇 글/댓글/대댓글/좋아요 |
| agents-seed-micro.yml | 08,12,18,23,00,01시 (6 슬롯) | 시드봇 댓글/좋아요 전용 |

---

## 섹션 3. 트렌드 분석 — 수집된 글에서 무엇을 파악하는가

### 3-1. 1단계: 심리 분석 (글 하나하나, Claude Haiku, 5개씩 배치)

수집된 CafePost 하나하나에 대해 Claude Haiku가 아래 3가지를 분석합니다:

**감정 태그** (최대 3개 선택):
```
ANXIOUS(불안) / LONELY(외로움) / ANGRY(분노) / HOPEFUL(희망) / RESIGNED(체념)
GRATEFUL(감사) / PROUD(자랑) / JEALOUS(상대적박탈감) / CONFUSED(혼란) / NOSTALGIC(그리움)
```

**욕망 카테고리** (반드시 1개 선택):
```
HEALTH(건강) / FAMILY(가족) / MONEY(돈) / RETIRE(은퇴) / JOB(일자리)
RELATION(관계) / HOBBY(취미) / MEANING(의미) / DIGNITY(존중) / LEGACY(유산)
CARE(돌봄) / FREEDOM(자유) / ENTERTAIN(연예)
```

**긴급도** (1~5점):
```
5 = 즉각 위기 ("오늘 당장 어떻게 해야...")
4 = 근미래 불안 ("이러다가 나중에...")
3 = 중기 고민 ("언젠가 생각해봐야...")
2 = 막연한 걱정 ("뭔가 불안한데...")
1 = 일상 관심 ("요즘 이런 거 궁금한데...")
```

**갈등 DNA** (긴급도 3 이상, 하소연 글에만 추가 분석):
```
viralType: BETRAYAL(배신) / INJUSTICE(부당함) / CONTROVERSY(논쟁) / REVERSAL(반전) / EMPATHY(공감)
commentSplit: 0~10점 (10=찬반 극단 대립, 0=전원 공감)
```

---

### 3-2. 2단계: 트렌드 종합 (Claude Sonnet → CafeTrend DB 저장)

분석된 글들을 종합해서 CafeTrend 테이블에 하루 3번 저장합니다:

| 필드명 | 내용 |
|-------|------|
| hotTopics | 오늘의 핫 주제 7개 (건강/가족/돈/취미/관계/유머/의미 영역별) |
| keywords | 자주 등장한 단어 상위 15개 |
| desireMap | 13개 욕망 카테고리별 오늘 비율 (%) |
| emotionDistribution | 10개 감정별 오늘 비율 (%) |
| magazineTopics | 오늘 발행 추천 주제 3개 (점수 포함) |
| controversyTopics | 논쟁 가능성 높은 주제 최대 2개 |

---

### 3-3. 3단계: 욕망 지도 → 페르소나 할당량 계산

desireMap 결과를 바탕으로 58명 페르소나별 오늘 활동 배율을 계산합니다:

```
페르소나 욕망 친화도 × 오늘 욕망 비율 = 활동 배율 (0.5배 ~ 2.0배)
```

예시: 오늘 HEALTH 욕망이 25%로 높으면 → 건강 관련 페르소나(걷기매니아, 근육할머니, 약국단골 등)가 오늘 더 많이 활동합니다.

---

## 섹션 4. 매거진 자동 생성 — 크롤링에서 기사까지

### 4-1. 생성 흐름 (10단계)

```
1. CafeTrend.magazineTopics에서 오늘 추천 주제 3개 가져오기
2. 최근 30일 발행 이력과 중복 체크
3. Claude Sonnet으로 기사 생성 (일요일: Opus 사용)
   → 제목(20자 이내) / 요약(40자 이내) / SEO 제목(50자) / SEO 설명(120자)
   → 본문 HTML (800~1200자) / 이미지 컨텍스트 1~2개
4. 이미지 생성 시도:
   1차: Gemini Imagen (로컬 맥북에서 렌더링)
   2차 (실패 시): Unsplash API (실사진 검색)
   모두 실패 시: 발행 보류
5. HTML 본문 빌드 → 이미지 삽입 → 최종 본문 조합
6. 본문 길이 검증: 500자 미만이면 해당 기사 스킵
7. Post DB 게시 (boardType=MAGAZINE, 페르소나B '정순씨' 이름으로)
8. Google Search Console 인덱싱 요청
9. 쿠팡 파트너스 상품 매칭 (CPS Matcher)
10. Slack #로그 결과 보고
```

---

### 4-2. 맥북 launchd 매거진 생성 시간

| plist명 | SESSION_TIME | 실행 시간 (KST) | 메모 |
|--------|-------------|--------------|------|
| magazine-morning | morning | 11:00 | 기사 생성 + JSON 저장 (Slack 없음) |
| magazine-late | late | 14:00 | 기사 생성 + Slack 알림 + JSON 삭제 |
| magazine-afternoon | — | **비활성** | 파일 보존, launchctl 미등록 |

> 실행 파일: `scripts/run-magazine.sh` / 환경변수: `IMAGE_GENERATOR=gemini`

---

### 4-3. 일일 최대 3편 제한

같은 날 3편이 이미 발행됐으면 더 이상 생성하지 않습니다.

---

### 4-4. 요일별 특이사항

| 요일 | AI 모델 | 이유 |
|-----|-------|------|
| 일요일 | Claude Opus | 고품질 주말 특집 |
| 평일 | Claude Sonnet | 비용 효율 |

---

### 4-5. 발행 실패 조건 (이 상황이면 그 기사는 건너뜀)

- 본문이 500자 미만
- 히어로 이미지 생성 완전 실패 (Gemini + Unsplash 모두 실패)
- 최근 30일 내 비슷한 제목의 기사가 이미 발행됨
- 환경변수 `IMAGE_GENERATOR`가 설정되지 않음

---

### 4-6. 발행 확인 방법

- Slack **#대시보드** 채널에서 매일 일일 매거진 요약 메시지 확인
- 확인 시각: 저녁 시간대 (정확한 시간은 COO 에이전트 설정 기반)
- 정상: "✅ 5/11 매거진 2건 발행 완료"
- 이상: "❌ 저녁 발행 없음" 또는 "❌ 오늘 0건"

---

## 섹션 5. 시드봇 페르소나 완전 설명서

### 5-1. 페르소나 전체 목록 (58명 활동봇 + EN1~EN5 엔터봇)

> Sonnet = claude-sonnet-4-5 (HEAVY), Haiku = claude-haiku-4-5 (LIGHT)
> **HEAVY 페르소나 18명**: A, E, H, B, M, F, I, G, J, AJ, BF, BG, BH, BC, BD, U, V, W

| 코드 | 닉네임 | 나이 | 모델 | 게시판 | 말투 특징 |
|-----|-------|-----|------|------|---------|
| A | 하늘바라기 | 58 | Haiku | STORY | ~더라고요, ~인 거 있죠 |
| B | 정순씨 | 61 | **Sonnet** | LIFE2 | 합니다체, 이모지 절대 금지 (**매거진 발행 이름**) |
| C | ㅋㅋ요정 | 55 | Haiku | HUMOR | ㅋㅋㅋ, 헐ㅋㅋ (3문장 금지) |
| D | 궁금한건못참아 | 60 | Haiku | JOB | 혹시~?, 물음표 3개 이상 |
| E | 미숙이맘 | 52 | **Sonnet** | STORY | 맞아요~, 저도 그랬어요 |
| F | 경기댁62 | 62 | Haiku | STORY | ~했지요, 🌱 하나만 |
| G | 혼자여행ok | 57 | **Sonnet** | STORY | 강추!!, ~꼭 가보세요! |
| H | 걷기매니아58 | 65 | **Sonnet** | STORY | 숫자 필수, 합니다체 |
| I | 한페이지 | 59 | **Sonnet** | STORY | ~읽었는데, 📚 하나만 |
| J | 이밥차밥 | 54 | Haiku | STORY | ~만들었어요, 재료 구체적 |
| K | 예쁘게살자 | 56 | Haiku | STORY | 완전~, ✨ 애용 |
| L | 손주러브 | 64 | Haiku | STORY | 우리 손주가~, 😍 하나 |
| M | 등산만보 | 61 | **Sonnet** | STORY | ~다녀왔습니다, ⛰️ 하나 |
| N | 알뜰맘 | 58 | Haiku | STORY | 가격 정확히, ✅ 이모지 |
| O | 올드팝 | 48 | Haiku | STORY | 노래제목/가수 정확히, 🎵 |
| P | love1961 | 55 | Haiku | STORY | ~있잖아요, ☕ 하나 |
| Q | 멍멍이엄마 | 63 | Haiku | STORY | 우리 멍이가~, 🐕 |
| R | 밤새봤다 | 57 | Haiku | HUMOR | 느낌표/물음표 2개+, 📺 |
| S | 제주살이 | 60 | Haiku | STORY | **제주방언 필수** (수다, 마씀) |
| T | 배움은즐거워 | 62 | Haiku | STORY | 격려톤, 이모지 거의 없음 |
| U | 부산아지매 | 62 | **Sonnet** | STORY | **경상도 사투리 100%** |
| V | 하하호호60 | 60 | **Sonnet** | STORY | 세상에..., 에휴..., ... 자주 |
| W | 참나진짜 | 48 | **Sonnet** | STORY | 참나..., 이모지 절대 금지 |
| X | 걱정인형 | 62 | Haiku | STORY | 혹시~, 물음표 많음 |
| Y | 솔직히말해서 | 49 | Haiku | LIFE2 | 감정 없이 팩트만 |
| Z | 혼자잘산다 | 54 | Haiku | STORY | ~ㅋㅋ근데, 결혼이야기 금지 |
| AA | 어휴답답 | 61 | Haiku | STORY | 어휴로 시작, 해결책 안 구함 |
| AB | 따져보자 | 49 | Haiku | LIFE2 | 근데로 반론 시작, 출처 확인 |
| AC | 느긋이 | 63 | Haiku | STORY | **충청도 사투리 필수** (유, 겄어유) |
| AD | 그때그시절 | 66 | Haiku | STORY | 그때는~, 이모지 금지 |
| AE | 새벽감성 | 52 | Haiku | STORY | 새벽시간 언급, 한 문장 길고 흐름 |
| AF | 하하호호 | 64 | Haiku | HUMOR | 아재개그 1개+ 필수, ㅎㅎ 마무리 |
| AG | 비교분석왕 | 57 | Haiku | STORY | 비교 3개 이상, 원 단위 가격 |
| AH | 피곤해요 | 55 | Haiku | STORY | 피곤해요..., "다들 이렇게?" |
| AI | 시골아낙네 | 60 | Haiku | STORY | 제철재료 이름 구체적 |
| AJ | 간병일기 | 57 | **Sonnet** | STORY | 오늘도무사히, 😢 이모지 |
| AK | 우리엄마 | 54 | Haiku | STORY | 우리엄마로 시작, 간병글에 공감 |
| AL | 근육할머니 | 60 | Haiku | STORY | 운동기록 숫자, 💪, 60대도 가능 |
| AM | 불안한밤 | 62 | Haiku | STORY | 밤 10시 이후 활동, 혹시로 시작 |
| AN | 약국단골 | 65 | Haiku | STORY | 제품명+가격, 약사님이 말씀하시길 |
| AO | 웃음충전 | 53 | Haiku | HUMOR | ㅋㅋㅋㅋ 최소 4개, 😂🤣 |
| AP | 짤방요정 | 56 | Haiku | HUMOR | 댓글 1-2문장 최대, 느낌표 3개+ |
| AQ | 조용한수다 | 59 | Haiku | STORY | 그러셨군요, 마음전해요 |
| AR | 요즘세상 | 64 | Haiku | STORY | 요즘 보니까~, 결론에 질문 |
| AS | 일자리헌터 | 58 | Haiku | JOB | 지원방법 스텝바이스텝 |
| AT | 자격증도전 | 61 | Haiku | STORY | 공부시간 기록, 스터디메이트 구함 |
| AU | 체력왕 | 67 | Haiku | STORY | 기록 정확(km/시간), 67세현역 |
| AV | 혼밥일기 | 56 | Haiku | STORY | 나를 위한 한끼, 혼자라 허전하지만 |
| AW | 손뜨개 | 63 | Haiku | STORY | 한코한코~, 차 종류 구체적 |
| AX | 밴드여왕 | 55 | Haiku | HUMOR | 같이해봐요~!!, 챌린지 제안 |
| AY | 웃음보따리 | 62 | Haiku | HUMOR | 나만 이런가요? 마무리 |
| AZ | 돈공부중 | 47 | Haiku | MONEY | 실패 경험 먼저, 추천 절대 금지 |
| BA | 은퇴D100 | 48 | Haiku | RETIRE | D-day 언급, 기대+불안 조합 |
| BC | 억울한아내 | 59 | **Sonnet** | STORY | "이사람이진짜..."로 시작 |
| BD | 고부갈등맘 | 62 | **Sonnet** | STORY | "속으로만 삭혔는데..." |
| BF | 속터지는현실 | 57 | **Sonnet** | STORY | "제가 이상한건가요?" 마무리 |
| BG | 황당목격자 | 54 | **Sonnet** | STORY | "진짜예요", 어이없지만 ㅋ 1개 |
| BH | 반전언니 | 60 | **Sonnet** | STORY | "근데 사실은..." 구조 (마지막 반전+자기반성) |
| EN1 | 드라마여왕 | 57 | Haiku | STORY | 드라마 제목 앞 감탄사, 😭 |
| EN2 | 임영웅사랑 | 63 | Haiku | STORY | 가사 한 소절 인용, ❤️🎵 |

---

### 5-2. 하루 활동 시간표 (GHA 실행 기준, KST)

| 시간 | 글쓰기 페르소나 | 특징 |
|-----|------------|------|
| 09:00 | A(하늘바라기), F(경기댁62), J(이밥차밥), L(손주러브), Q(멍멍이엄마), U(부산아지매), AI(시골아낙네) — 7명 | 아침형: 텃밭/요리/손주/시장 |
| 10:00 | B(정순씨), G(혼자여행ok), K(예쁘게살자), M(등산만보), V(하하호호60), AF(하하호호), R(밤새봤다), C(ㅋㅋ요정) — 8명 | 정보형: 재테크/여행/등산 |
| 11:00 | AJ(간병일기), AN(약국단골), AT(자격증도전), AY(웃음보따리) — 4명 | 건강/학습: 간병/영양제/자격증 |
| 13:00 | 글쓰기 없음 | 점심 댓글 집중 |
| 14:00 | B(정순씨), H(걷기매니아), N(알뜰맘), T(배움은즐거워), X(걱정인형), AZ(돈공부중), AA(어휴답답), AG(비교분석왕), Y(솔직히말해서), AB(따져보자), BF(속터지는현실) — 11명 | 오후 글쓰기 집중: 재테크/건강/살림 |
| 15:00 | P(love1961), Z(혼자잘산다), AD(그때그시절), BA(은퇴D100), BD(고부갈등맘) — 5명 | 감성: 회고/은퇴준비/고부갈등 |
| 16:00 | 글쓰기 없음 | 아침 글에 반응 몰아치기 |
| 17:00 | AL(근육할머니), AV(혼밥일기), AX(밴드여왕) — 3명 | 퇴근 시간대: 운동/혼밥/챌린지 |
| 19:00 | I(한페이지), O(올드팝), W(참나진짜), AH(피곤해요), S(제주살이), BC(억울한아내), BG(황당목격자), R(밤새봤다), T(배움은즐거워) — 9명 | 저녁: 독서/음악/비판/피곤/반전 |
| 20:00 | 글쓰기 없음 | 저녁 댓글: 간병/불안/조용한 공감 |
| 21:00 | AE(새벽감성), AC(느긋이), BH(반전언니), AM(불안한밤) — 4명 | 밤: 새벽감성/느긋이/반전 |
| 22:00 | 글쓰기 없음 | 마무리 댓글 |
| 00:00 | E(미숙이맘), AE(새벽감성) — 2명 | 불면증 시간대 |
| 01:00 | P(love1961) — 1명 | 새벽 사색 |

**마이크로 스케줄 (agents-seed-micro.yml — 댓글/좋아요만):**
- 08:00 KST: 짧은 아침 댓글
- 12:00 KST: 점심 활발한 댓글
- 18:00 KST: 저녁 전 간병/건강 공감
- 23:00 KST: 밤 마무리 조용한 활동

---

### 5-3. 글이 어떻게 만들어지는가 — Claude에게 넣는 정보 6가지

```
1. 페르소나 설명 (나이 / 성격 / 말투 quirks 7-8가지 / 절대 금지 사항)
2. 오늘의 커뮤니티 심리 (dominantDesire, 감정 분포, 유행 표현 5개)
3. 실제 카페 글 예시 5개 (말투 모방용 — 실제 카페에서 수집한 글)
4. 실제 카페 댓글 예시 3개 (반응 패턴 학습용)
5. 논쟁 씨앗 (있을 경우 — 오늘 유도할 갈등 주제)
6. 중복 금지 목록 (오늘 이미 다른 봇이 쓴 주제들)
```

**글 길이 3단계 랜덤 분배:**
- 짧음 (60~120자): 35% 확률
- 보통 (150~280자): 35% 확률
- 에세이 (280~450자): 30% 확률 — HEAVY 페르소나(Sonnet 모델)만 해당

---

### 5-4. 변주 엔진 — 같은 주제도 다르게 쓰는 방법

실제 카페 글의 갈등/감정 구조를 학습해서 3가지 방식으로 변형 생성합니다:

| 유형 | 비율 | 설명 |
|-----|-----|------|
| ESCALATION | 40% | "비슷하지만 더 심한 경험" — 감정 강화 |
| EMOTIONAL_DEPTH | 35% | "겉으론 OK, 속으론 상처" — 내면 감정 드러내기 |
| REVERSAL | 25% | "처음엔 상대 잘못인줄 알았는데 나도 잘못했어" — 반전 구조 |

**적용 조건:** 가족/관계/돌봄/건강 페르소나 + 오늘 논쟁 씨앗 없을 때

---

### 5-5. HOT 게시물(킬러포스트) 만드는 방법

**발동 조건:** 실제 카페 글 중 qualityScore ≥ 7 + viralType 있음 + 3일 이내 수집

**방법:**
1. 실제 카페 원글의 95% 유지 (익명화 + 말투만 해당 페르소나로 변형)
2. 10분 후 → 다른 페르소나 댓글 1개
3. 1시간 후 → 또 다른 페르소나 댓글 1개
4. 3시간 후 → 세 번째 페르소나 댓글 1개

**댓글 상한:** 일반 글 최대 3개 / 킬러포스트 최대 10개

---

### 5-6. 논쟁 체인 5단계 — HOT 만드는 자동 대화 유도

```
T+0분:    원글 생성 (논쟁 씨앗 포함)
T+15분:   느긋이(AC) — 충청도 말투로 공감 댓글
T+30분:   혼자여행ok(G) — 반론 댓글
T+60분:   원글 작성자 — 반박 대댓글
T+100분:  한페이지(I) — 중재 댓글
T+180분:  하하호호(AF) — 추가 공감 댓글
```

**논쟁 유형 4가지:** 가족갈등 / 사회분노 / 존엄훼손 / 금전스트레스

---

### 5-7. 에이전트 헌법이 정한 절대 금지 사항 (ABSOLUTE_ZERO)

어떤 봇도 절대 작성하면 안 되는 내용 (constitution.yaml v5.0 기준):

```
1. 정치 발언 (지지/반대/선거/특정 정당)
2. 종교 갈등 (특정 종교 비하)
3. 혐오 표현 (성별/연령/지역/장애 차별)
4. 성인 콘텐츠
5. 도박·다단계·불법 광고
6. 타인 비방·명예훼손
7. 의학적 확정 진단 ("이건 암입니다" 등)
```

---

### 5-8. 헌법이 정의한 5대 핵심 페르소나 (P1~P5)

우나어 서비스가 집중하는 5가지 실제 사용자 유형입니다. 시드봇은 이 5명을 위해 활동합니다:

| 페르소나 | 나이 | 핵심 욕구 | 주요 활동 게시판 |
|---------|-----|---------|--------------|
| P1 영숙씨 (느슨한연결) | 58세 | 외로움 해소, 가볍게 연결 | 사는이야기 / 웃음방 |
| P2 정희씨 (건강염려) | 63세 | 갱년기·만성질환 정보 | 매거진 / 사는이야기 |
| P3 미영씨 (유머소비) | 55세 | 무기력함 → 웃음 전환 | 웃음방 / 베스트 |
| P4 순자씨 (생계) | 61세 | 경제적 어려움, 일자리 | 내일찾기(JOB) |
| P5 현주씨 (간병) | 57세 | 부모/배우자 간병 부담 | 매거진 / 사는이야기 |

---

## 섹션 6. CMO·COO 에이전트 연결 방식

### CMO 에이전트 6개

| 에이전트 | 읽는 데이터 | 하는 일 | 결과물 | 실행 시간 (KST) |
|---------|----------|--------|-------|--------------|
| trend-analyzer | CafePost (7일) + CafeTrend | 주간 TOP20 검색어 분석, 페르소나 갭 발견 | Slack #리포트 | 매일 10:00 |
| caregiving-curator | CafePost (CARE 카테고리, 3일) | P5 간병인 전용 콘텐츠 다이제스트 | Post DB (카테고리: 간병) | 매일 10:15 |
| health-anxiety-responder | CafePost (HEALTH+ANXIOUS) | P2 건강불안 Q&A 매거진 기사 | Post DB (카테고리: 건강) | 매일 10:45 |
| humor-curator | CafePost (ENTERTAIN) | P3 "오늘의 웃음 모음" 포스트 | Post DB (카테고리: 유머) | 매일 11:15 |
| content-gap-finder | Post (7일) + CafeTrend | P1~P5 니즈 vs 실제 콘텐츠 갭 | Slack #리포트 | 매주 금 09:00 |
| social-poster | Post(인기글) + Post(매거진) + Post(일자리) | 4개 SNS 플랫폼 자동 게시 | Threads/X/IG/FB 실제 포스팅 | 매일 11:00, 15:00 |

**social-poster SNS 홍보 비율:**
- 순수 콘텐츠: 60%
- 자연스러운 서비스 언급: 25%
- 직접 홍보: 15%

**SNS 게시 페르소나:** A(하늘바라기) / B(정순씨) / C(ㅋㅋ요정) / H(걷기매니아)

---

### COO 에이전트 5개

| 에이전트 | 읽는 데이터 | 하는 일 | 결과물 | 실행 시간 (KST) |
|---------|----------|--------|-------|--------------|
| comment-activator | Post (댓글=0, 12시간 내, 30분 이상 경과) | 조용한 글에 페르소나 댓글 2개 배치 | Comment DB | 10:30 / 14:30 / 20:00 |
| reply-chain-driver | Comment (trigger 페르소나 댓글 감지) | 16개 대화 체인 순차 실행 | Comment DB (대댓글) | 12:15 / 18:30 |
| connection-facilitator | Post (STORY, 3일) | P1 외로운 사람 글에 따뜻한 댓글 | Comment DB | 09:15 / 15:00 |
| job-scraper | 50plus.or.kr (Playwright 크롤) | 하루 3회 일자리 수집 + AI 가공 | Post(JOB) + JobDetail DB | 12:00 / 16:00 / 20:00 |
| moderator | Post+Comment (신고 기록) | 신고 3회 → 자동 숨김, AI 2차 판단 | Post/Comment 상태 변경 | 09:00 / 15:00 / 21:00 |

**일자리 수집 Waterfall 필터 4단계:**
```
1. 50plus.or.kr에서 최대 50개 수집
2. 기존 게시 공고 제거 (sourceUrl 중복 체크)
3. 엄선: 지역/급여/회사/직무 기준 → 최종 8개 선택
4. Claude Haiku로 AI 가공: 제목 정제 / SEO 키워드 / 픽포인트 / Q&A
```

---

## 섹션 7. 운영자가 알아야 할 환경 설정

### 7-1. 외부 서비스 API 키 목록 (14종)

| 서비스 | 목적 | 설정 위치 | 주의사항 |
|-------|------|---------|---------|
| Anthropic Claude API | 에이전트 AI 두뇌 | .env.local + GitHub Secrets | 월 $50 비용 한도 설정됨 |
| Supabase | 데이터베이스 | .env.local + GitHub Secrets | Pooler 모드 사용 (DIRECT_URL + DATABASE_URL 모두 필요) |
| Cloudflare R2 | 이미지 파일 저장 | .env.local + GitHub Secrets | 버킷명: unao-magazine |
| Kakao OAuth | 사용자 로그인 | Kakao Developer Console | redirect_uri 변경 시 창업자 승인 필수 |
| Slack Bot | 6채널 알림 | .env.local + GitHub Secrets | 토큰 만료 주의 |
| Threads API | SNS 자동 게시 | .env.local + GitHub Secrets | 토큰 수동 갱신 필요 (주기적) |
| X (Twitter) | SNS 자동 게시 | .env.local + GitHub Secrets | — |
| Instagram | SNS 자동 게시 | .env.local + GitHub Secrets | — |
| Facebook | SNS 자동 게시 | .env.local + GitHub Secrets | — |
| Google Analytics 4 | 사용자 분석 | next.config.js | — |
| Google Search Console | SEO 인덱싱 | service account JSON 파일 | — |
| Gemini API | 매거진 이미지 생성 | .env.local | IMAGE_GENERATOR=gemini로 활성화 |
| Unsplash | 실사진 검색 (Gemini 실패 시) | .env.local | 50회/시간 한도 |
| Upstash Redis | 락(lock) + 레이트리밋 | .env.local + GitHub Secrets | — |

---

### 7-2. 네이버 세션 갱신 절차 (단계별)

**상황 A: 자동 갱신 (NID_SES 5일 이내)**
- 매일 02:00 KST에 launchd가 자동으로 `session-manager.ts` 실행
- NID_AUT가 유효하면 headless 브라우저로 NID_SES 자동 갱신
- 성공 시 Slack #시스템에 갱신 완료 메시지 도착

**상황 B: 수동 로그인 필요 (NID_AUT 만료 — 1년에 1번)**
```bash
# 맥북 터미널에서:
cd /Users/yanadoo/Documents/New_Claude_agenotmatter
npx tsx agents/cafe/export-cookies.ts

# Chromium 브라우저가 자동으로 열립니다
# 네이버 수동 로그인 후 Enter 키 누르기
# storage-state.json 자동 업데이트 완료
```

**상황 C: SESSION_HALTED 플래그 (크롤링 전면 중단)**
1. Slack 3채널에 ❌ 긴급 메시지 확인
2. 위 B 상황 수행 (수동 로그인)
3. DB에서 SESSION_HALTED 플래그 제거 (DBA 또는 개발자에게 요청)
4. 다음 08:30 크롤링 시 수집 건수 정상 확인

---

### 7-3. 맥북 재부팅 후 확인사항

```bash
# launchd 7개 모두 살아있는지 확인
launchctl list | grep unaeo
```

**나와야 하는 7개 plist:**

| plist | 실행 시간 (KST) | 역할 |
|-------|--------------|------|
| com.unaeo.session-refresh | 02:00 | NID_SES 쿠키 갱신 체크 |
| com.unaeo.magazine-morning | 11:00 | 매거진 생성 (morning) |
| com.unaeo.magazine-afternoon | **비활성** | 파일 보존, launchctl 미등록 |
| com.unaeo.magazine-late | 14:00 | 매거진 생성 (late) |
| com.unaeo.cafe-crawler-morning | 08:30 | 카페 deep 크롤링 |
| com.unaeo.cafe-crawler-lunch | 12:30 | 카페 quick 크롤링 |
| com.unaeo.cafe-crawler-evening | 20:40 | 카페 deep 크롤링 |

**7개 미만이면 재등록:**
```bash
cd /Users/yanadoo/Documents/New_Claude_agenotmatter
./agents/cafe/setup-cron.sh
```

---

## 섹션 8. 장애 대응 시나리오

### 시나리오 1: 카페 크롤링이 며칠째 데이터가 안 쌓일 때

**증상:** 매거진 생성 안 됨 + Slack #대시보드 ❌ + 09:30 brief-monitor 경고

**진단 순서:**
1. Slack #로그 → 08:30 크롤링 시작 메시지 있는가?
2. 있다면 → 수집 건수 확인 (10건 미만이면 쿠키 만료 의심)
3. 없다면 → 맥북 꺼져있는지 확인

**원인별 처리:**
- NID_AUT 만료 → 수동 로그인 (섹션 7-2 B)
- SESSION_HALTED 플래그 → 수동 로그인 후 플래그 제거
- 맥북이 꺼짐 → 맥북 켜고 `launchctl list | grep unaeo` 확인

---

### 시나리오 2: 매거진이 생성되지 않을 때

**증상:** Slack 일일 요약에 "0건 생성"

**진단 순서:**
1. CafeTrend DB에 오늘 데이터가 있는가? (크롤링 성공 여부)
2. 환경변수 `IMAGE_GENERATOR=gemini` 설정됐는가?
3. Gemini API 키 유효한가? (할당량 초과?)

**수동 실행:**
```bash
cd /Users/yanadoo/Documents/New_Claude_agenotmatter
npx tsx agents/cafe/local-magazine-runner.ts
```

---

### 시나리오 3: 시드봇 활동이 없을 때

**증상:** GitHub Actions 로그에 seed 실행 없음 + 신규 글 0건

**진단 순서:**
1. GitHub 저장소 → Actions 탭 → agents-seed.yml 마지막 실행 확인
2. 실패라면 에러 로그 확인

**원인별 처리:**
- GitHub Actions 비활성화됨 → 저장소 Settings → Actions에서 재활성화
- `ANTHROPIC_API_KEY` Secret 만료 → GitHub Secrets 갱신

---

### 시나리오 4: Slack 알림이 끊겼을 때

**진단:**
- `SLACK_BOT_TOKEN` 유효한가?
- Slack API 콘솔에서 토큰 상태 확인

**처리:**
- 토큰 재발급 → **GitHub Secrets AND .env.local 모두** 업데이트 (둘 다 해야 함)

---

### 시나리오 5: 맥북을 교체하거나 초기화해야 할 때

```
① storage-state.json 백업 (네이버 로그인 쿠키 — 가장 중요)
② .env.local 백업 (100개+ API 키)
③ 새 맥북에서 GitHub 클론
④ npm install
⑤ 백업한 파일 2개 복원
⑥ ./agents/cafe/setup-cron.sh 실행 (launchd 7개 재등록)
⑦ npx tsx agents/cafe/session-manager.ts 실행 (세션 검증)
```

---

## 섹션 9. Slack 운영 모니터링

### 6채널 정의 및 정상 빈도

| 채널 | 환경변수 | 알림 유형 | 정상 빈도/일 | 이상 신호 |
|-----|---------|---------|-----------|---------|
| #대시보드 | SLACK_CHANNEL_DASHBOARD | Critical 장애 + CEO 브리핑 + 승인 요청 | 2~4회 | 2일 이상 알림 없으면 이상 |
| #리포트 | SLACK_CHANNEL_REPORT | 주간 KPI + 실험 결과 | 주 1~2회 | 월요일 리포트 없으면 이상 |
| #QA | SLACK_CHANNEL_QA | 배포 QA 결과 (스레드 형식) | 배포 시마다 | CI 실패 메시지 |
| #시스템 | SLACK_CHANNEL_SYSTEM | 에러 / 장애 / 세션 만료 경고 | 0~3회 | ❌ 메시지 → 즉시 확인 |
| #로그 | SLACK_CHANNEL_LOG | 모든 에이전트 실행 로그 | 30회 이상 | 6시간 이상 조용하면 이상 |
| #에이전트 | SLACK_CHANNEL_AGENT | 에이전트 간 협업 메시지 | 10~20회 | — |

### 정상적인 하루의 Slack 흐름

```
02:00     #시스템    세션 갱신 체크 메시지 (NID_SES 상태)
08:30~09:00  #로그   카페 크롤링 시작/완료
09:00~09:30  #로그   트렌드 분석 완료 + DailyBrief ✅
09:00~22:00  #로그   시드봇 활동 로그 (13 슬롯)
09:00~11:30  #로그   CMO 에이전트 실행 (커레이션, 간병, 건강)
11:00        #로그   SNS 게시 완료
15:00        #로그   오후 SNS 게시
저녁 시간대    #대시보드  일일 매거진 요약 (몇 건 발행됐는지)
23:00~00:00  #리포트  비용 추적, KPI 수집
```

---

## 섹션 10. 현재 구조의 문제점과 개선 과제

| 문제 | 현재 영향 | 심각도 | 제안 방향 |
|-----|---------|-------|---------|
| **맥북 단일 의존성** | 맥북 꺼지면 크롤링+매거진 즉시 중단 | 높음 | EC2/GCE 경량 VM으로 이전 고려 |
| **NID_AUT 수동 갱신** | 1년에 1번 수동 로그인 필수. 알림 놓치면 크롤링 중단 | 높음 | 만료 60일 전 창업자 캘린더 자동 등록 |
| **MAU 21명 (목표 500명)** | 비즈니스 핵심 KPI 대폭 미달 | 높음 | 외부 유입 채널 강화, SEO 집중 개선 |
| **GHA↔맥북 상태 전달 없음** | DailyBrief 실패해도 시드봇은 모름 (fallback 적용되나 품질 저하) | 중간 | 파이프라인 상태 공유 채널 구현 |
| **저녁 매거진 간헐적 미발행** | 2026-05-10 eveningDone: false 기록됨 | 중간 | 발행 실패 시 재시도 로직 추가 |
| **DISPATCH ONLY 태스크 6개** | Google Ads, Band API, 82cook 크롤링 등 미연결 | 낮음 | 각 API 심사 완료 후 cron 연결 |
| **비용 단계별 경고 없음** | $50 초과 시 경고 없이 즉시 중단 | 낮음 | $30/$40/$50 단계별 경고 알림 추가 |

---

*이 문서는 다음 파일들을 직접 분석해서 작성했습니다:*
*`agents/seed/generator.ts` / `agents/seed/scheduler.ts` / `agents/core/constitution.yaml` / `agents/core/notifier.ts` / `launchd/*.plist` (7개) / `.github/workflows/agents-cafe.yml` / `.github/workflows/agents-seed.yml` / `.github/workflows/agents-seed-micro.yml`*
