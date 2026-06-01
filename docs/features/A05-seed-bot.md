# 시드봇 운영 기획서 (A05)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

커뮤니티 초기 활성화를 위해 35~40명의 가상 50~60대 페르소나가  
하루 180개+ 활동(글/댓글/좋아요)을 자동 생성한다.  
실제 50~60대처럼 보이는 자연스러운 콘텐츠로 신규 유입 회원이  
"이미 사람이 많은 커뮤니티"로 인식하게 한다.

---

## 배경

- 커뮤니티 서비스의 "콜드 스타트" 문제: 사람이 없으면 사람이 안 온다
- 50~60대 실제 관심사 기반 페르소나 → 카페 크롤링(A01) 데이터로 매일 업데이트
- Claude Haiku (최저비용 모델) 사용으로 월 ~$17 수준 유지
- GHA에서 완전 자동 실행, 개입 불필요

---

## 세부 기획

### 페르소나 구성 (총 40명)

#### 기본 35명 (항상 활성)

**긍정형 (A~T, 20명)**

| ID | 닉네임 | 나이 | 기분 | 특성 |
|----|--------|------|------|------|
| A | 하늘바라기 | 58 | 긍정 | 일상 수다, 동네 이야기 |
| B | 정순씨 | 61 | 중립 | 은퇴 일상, 재테크 |
| C | ㅋㅋ요정 | 55 | 긍정 | 초짧은 리액션 (HUMOR) |
| D | 궁금한건못참아 | 60 | 중립 | 질문 폭격 (JOB) |
| E | 봄바람 | 52 | 긍정 | 공감 천재, 긴 위로 댓글 |
| F | 텃밭언니 | 62 | 중립 | 텃밭 일지, 자연 |
| G | 여행이좋아 | 57 | 긍정 | 여행 감탄 |
| H | 매일걷기 | 65 | 중립 | 건강 데이터, 수치 중심 |
| I | 한페이지 | 59 | 중립 | 독서, 문화, 감성 |
| J | 맛있는거좋아 | 54 | 긍정 | 레시피, 맛집 |
| K | 예쁘게살자 | 56 | 긍정 | 패션, 뷰티 |
| L | 손주러브 | 64 | 긍정 | 손주 자랑 |
| M | 산이좋아 | 61 | 중립 | 등산 후기 |
| N | 알뜰맘 | 58 | 중립 | 살림 팁, 가격 비교 |
| O | 올드팝 | 48 | 중립 | 음악, 추억의 노래 |
| P | 오후세시 | 55 | 중립 | 감성 에세이 |
| Q | 멍멍이엄마 | 63 | 긍정 | 반려견, 유머 |
| R | 밤새봤다 | 57 | 긍정 | 드라마/예능 덕후 (HUMOR) |
| S | 제주살이 | 60 | 혼합 | 제주 귀촌, 사투리 |
| T | 배움은즐거워 | 62 | 긍정 | 평생교육 |

**현실/비판형 (U~AB, 8명)**

| ID | 닉네임 | 나이 | 기분 | 특성 |
|----|--------|------|------|------|
| U | 부산아지매 | 62 | 혼합 | 경상도 사투리, 직설 |
| V | 세상에나 | 60 | 부정 | 물가 한탄 |
| W | 참나진짜 | 48 | 부정 | 까칠 리뷰, 독설 |
| X | 걱정인형 | 62 | 부정 | 건강/노후 불안 |
| Y | 솔직히말해서 | 49 | 중립 | 팩폭, 현실주의 |
| Z | 혼자잘산다 | 54 | 혼합 | 자조 유머, 독신 |
| AA | 어휴답답 | 61 | 부정 | 자녀 걱정, 한탄 |
| AB | 따져보자 | 49 | 중립 | 팩트체크, 논쟁 |

**특수 캐릭터 (AC~AI, 7명)**

| ID | 닉네임 | 나이 | 기분 | 특성 |
|----|--------|------|------|------|
| AC | 느긋이 | 63 | 중립 | 충청도 사투리 |
| AD | 그때그시절 | 66 | 혼합 | 회고, 과거 비교 |
| AE | 새벽감성 | 52 | 혼합 | 새벽 감성, 불면증 |
| AF | 하하호호 | 64 | 긍정 | 아재개그 |
| AG | 비교분석왕 | 57 | 중립 | 비교 분석, 목록형 |
| AH | 피곤해요 | 55 | 부정 | TMI, 만성 피로 |
| AI | 시골아낙네 | 60 | 긍정 | 시골 자급자족 |

**검증 페르소나 (AJ~BD, 기타 — 욕망 맵 기반)**

간병(AJ 간병일기·AK 우리엄마), 건강불안(AM 불안한밤·AN 약국단골),  
유머(AO 웃음충전·AP 짤방요정), 느슨한연결(AQ 조용한수다·AR 요즘세상·AV 혼밥일기·AW 손뜨개),  
생계(AS 일자리헌터·AT 자격증도전), 초건강(AL 근육할머니·AU 체력왕),  
신규특수(AX 밴드여왕·AY 웃음보따리·AZ 돈공부중·BA 은퇴D100·BC 억울한아내·BD 고부갈등맘)

#### 엔터테인먼트 5명 (조건부 활성)

활성화 조건: `CafeTrend.entertainActive = true` (오전 크롤 ENTERTAIN 비율 ≥ 10%)

| ID | 닉네임 | 나이 | 특성 |
|----|--------|------|------|
| EN1 | 드라마여왕 | 57 | 드라마 몰입형 |
| EN2 | 임영웅사랑 | 63 | 트로트 열성팬 |
| EN3 | 연예가십퀸 | 52 | 연예 소식 |
| EN4 | 복고감성 | 60 | 80~90년대 향수 |
| EN5 | 한류입덕맘 | 55 | K-드라마 늦깎이 |

---

### 행동 유형 4가지

| 유형 | 설명 | Claude 호출 | 최대 토큰 |
|------|------|------------|---------|
| post | 글 생성 (최대 600자) | ✅ | 1,200 |
| comment | 댓글 (1~3문장) | ✅ | 200 |
| reply | 대댓글 (1~2문장) | ✅ | 150 |
| like | 좋아요 추가 | ❌ (DB만) | - |

---

### 일일 목표 활동량

```
글쓰기:  18~22개/일
댓글:    80~100개/일
대댓글:  25~35개/일
좋아요:  60~80개/일
────────────────────
합계:    ~180~237개/일
```

---

### 하루 실행 흐름

```
08:00 KST — agents-seed-micro.yml (마이크로: 댓글+대댓글+좋아요)
09:00 KST — agents-seed.yml (메인: 아침 글쓰기 7개)
10:00 KST — agents-seed.yml (메인: 정보/활발형 글 8개)
11:00 KST — agents-seed.yml (메인: 간병/건강 글 4개)
12:00 KST — agents-seed-micro.yml (마이크로: 댓글+대댓글+좋아요)
13:00 KST — agents-seed.yml (메인: 크롤링 반영 댓글 중심)
14:00 KST — agents-seed.yml (메인: 오후 글 8개)
15:00 KST — agents-seed.yml (메인: 감성+논쟁 글 7개)
16:00 KST — agents-seed.yml (메인: 댓글 집중)
17:00 KST — agents-seed.yml (메인: 오후 글 5개)
18:00 KST — agents-seed-micro.yml (마이크로: 댓글+대댓글+좋아요)
19:00 KST — agents-seed.yml (메인: 저녁 감성 글 8개)
20:00 KST — agents-seed.yml (메인: 저녁 댓글+대댓글)
21:00 KST — agents-seed.yml (메인: 밤 감성 + 집중 좋아요 — HOT 문턱 글 대상)
22:00 KST — agents-seed.yml (메인: 마무리 댓글)
23:00 KST — agents-seed-micro.yml (마이크로: 밤 마무리)
────────────────────────────────────────
총: 16개 시간대 실행
```

---

### 가드레일

| 조건 | 처리 |
|------|------|
| 같은 글에 동일 유저 중복 댓글 | 스킵 |
| 한 글에 봇 댓글 3개 이상 | 스킵 |
| 같은 댓글에 동일 봇 대댓글 | 스킵 |
| 욕망 카테고리별 글 상한 초과 | 스킵 |
| 페르소나 동일 주제 중복 | 스킵 (usedPrimaryTopics Set) |
| 쿼터 배율 < 0.9 | 글쓰기 스킵 |
| automation_status ≠ ACTIVE | 모든 활동 중단 |
| EMERGENCY_STOP BotLog | 즉시 중단 |
| 비용 $50/월 초과 | 즉시 차단 + Slack #긴급 알림 |

---

### 콘텐츠 생성 파이프라인

```
1. DailyBrief 로드 (fallback: 전날 브리프)
2. buildDailySchedule(hour) → 오늘의 브리프 기반 동적 스케줄 생성
3. 각 activity:
   a. CafeTrend 예시 조회 → buildTrendContext()
   b. 페르소나 최근 이력 조회 → 중복 주제 방지
   c. Claude Haiku 호출 → 콘텐츠 생성
   d. Prisma DB INSERT
   e. BotLog 기록
```

---

### 스케줄 / 실행 환경

| 스케줄러 | GHA 워크플로우 | UTC 크론 | KST 시간대 |
|---------|-------------|---------|-----------|
| 메인 | `agents-seed.yml` | `0 0,1,2,4,5,6,7,8,10,11,12,13 * * *` | 09~22시 (12회) |
| 마이크로 | `agents-seed-micro.yml` | `0 23,3,9,14 * * *` | 08·12·18·23시 (4회) |

**Runner Handlers**: `seed:scheduler`, `seed:micro`  
**실행 환경**: GHA ubuntu-latest, Node 20, Claude Haiku 4.5

---

### 비용 영향

| 항목 | 일일 | 월간 |
|------|------|------|
| Claude Haiku 입력 (~224K tokens) | ~$0.18 | ~$5.4 |
| Claude Haiku 출력 (~98K tokens) | ~$0.39 | ~$11.7 |
| **합계** | **~$0.57** | **~$17** |

Constitution 상한 $50/월 대비 여유 있음.

---

## 관련 링크

- 메인 스케줄러: `agents/seed/scheduler.ts`
- 마이크로 스케줄러: `agents/seed/micro-scheduler.ts`
- 콘텐츠 생성: `agents/seed/generator.ts`
- 페르소나 정의: `agents/seed/personas.ts` (또는 scheduler.ts 상단)
- Runner 핸들러: `agents/cron/runner.ts` — `seed:scheduler`, `seed:micro`
- GHA 워크플로우: `.github/workflows/agents-seed.yml`, `agents-seed-micro.yml`
- DB 모델: `prisma/schema.prisma` — Post, Comment, Like, BotLog, User

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |
| 2026-05-08 | buildSystemPrompt 상황임베딩 재설계, 폼양식 제거, 예시 220자 확대, POST_LENGTHS 장문제거, 댓글지시 교체, recentHint 오늘소재 감지, HEAVY_PERSONAS Sonnet 업그레이드, 닉네임 8개 다양화 | 창업자 "인간스럽지 않아" 피드백 반복 → 프롬프트 설계 철학 전면 개편 |
| 2026-05-09 | Y(솔직히말해서) "솔직히" 접두사 제거, AB(따져보자) 질문형 접미사 제거, B(정순씨) 보고서 주제→사건형, buildSituationLine 트리거 모먼트 추가, generatePost "방금 있었던 일부터" 지시, DNA 변주 20%→40%+HEALTH 추가, 논란형 신규 페르소나 3명(속터지는현실·황당목격자·반전언니) 추가, 스케줄러 다양화 | Playwright 60개 글 수집 7항목 OK/NG 분석 → 페르소나 정의 자체(examples/quirks)가 패턴 인코딩한 것 확인 → 근본 원인 수정 + 논란형 페르소나 신규 추가 |
| 2026-05-11 | 킬러 포스트 파이프라인 추가: generateKillerPost(원문95%유지)+generateKillerComments(topComments99%재활용)+runKillerPostCycle(qualityScore≥7 후보선택)+processPendingKillerCommentWaves(3파동 댓글투입)+focusedLikeRound 14시추가/isFeatured포함/take5+HEAVY_PERSONAS 18명+POST_LENGTHS 3단계+제목트리거강화+어드민⭐마킹 UI+agents-killer-post.yml 크론2개(09:10/21:10 KST) | CafePost 원문 감성 0% 활용 문제 → 95%유지 킬러 포스트로 HOT 달성률 40~60% 목표 |
| 2026-05-11 | generateSheetViralComment에 이미지 전용 글 감지 가드 추가: HTML 태그 제거 후 cleanText < 50자이면 즉시 '' 반환 | 오유/네이트판 짤방 글 스크래핑 시 rawContent가 &lt;img&gt; 태그만인 경우 "이미지를 볼 수 없어서..." 쓰레기 댓글이 길이 5 이상으로 가드 통과해 DB 저장되는 문제 재발 방지 |
| 2026-05-12 | generator.ts: `getExampleCafeComments()` likeCount 정렬+대댓글 포함으로 개선, `getCommentAtmosphereContext()` 신규 추가→generatePost() 프롬프트 주입 | 댓글 분위기(공감형/논쟁형/정보형)를 시드봇 글 방향성에 반영 |
| 2026-05-14 | micro-scheduler.ts + scheduler.ts 3개 함수에 hotPromotedAt 보정 cleanup 추가 — promotionLevel 직접 updateMany 후 hotPromotedAt=null인 HOT/HALL_OF_FAME 글 사후 보정 | 뜨는이야기 탭 구조를 위해 시드봇이 직접 쓰는 promotionLevel 경로 6개에 hotPromotedAt 누락 보정 필요 |
| 2026-05-16 | generateComment() `priorComments?: string[]` 파라미터 추가 + user message에 priorCommentsHint 블록 주입. buildContextRule comment에 "첫 단어 맞아요 금지" 추가 | 9개 봇이 같은 본문으로 독립 생성 → 동일 키워드 반복 수렴 문제 해결 (priorComments로 기존 댓글 내용 전달) |
| 2026-05-16 | scheduler.ts Fix 5 (v2): 24h 유사 제목 중복 발행 체크를 DB `startsWith(titleKey)` → JS noun overlap(2자 추출, 3개 이상 겹치면 스킵)으로 교체 | Bug A: titleKey 공백 제거 후 DB 원본(공백 포함)과 `startsWith` 비교해 항상 false. Bug B: 6자 prefix는 조사 변형("아이독립을준" ≠ "아이독립준비") 잡지 못함 → 동일 소재 글 3-4시간 내 2번 발행됨 |
| 2026-05-18 | scheduler.ts·micro-scheduler.ts·controversy-chain.ts trendingScore 호출에 createdAt 파라미터 추가 — calculateTrendingScore(likes, comments, views, post.createdAt) | trendingScore 알고리즘 postAge 기반 개편에 맞춰 호출부 전체 업데이트 |
| 2026-06-01 | P1-B+C-2: generateSheetViralComment commentContext 구성 전면 개편 — (1) rest sourceComments 완전 제거→focus 1개만 (2) extractForbiddenAnchors 신규(priorCommentTexts 기반 단어+구문 최대 6개 추출) (3) 이미지 글 rawContent=''·메타 발화 금지어 섹션 추가 (4) sourceComments 없는 이미지 글 return '' skip (5) prior 지시 강화 "같은 뜻이라도 비슷한 표현 금지" | 2차 전수 재검증(natepann 83% anchor 수렴·이미지 글 메타 발화 노출) C.실패 판정 → anchor 수렴 83%→25%↓, 메타 발화 0건 |
| 2026-06-01 | P0 핫픽스+scheduler HIDDEN skip: (1) generator.ts isLeakySheetComment 추가(LEAK_PHRASES 11개) → leaky output continue 재시도, 최종 return '' (2) scheduler.ts processSheetEngagementWaves·processPendingSheetCommentWaves — 분기 전 post.status 조회 추가, HIDDEN/미발행 글은 BotLog SKIP 처리, LIKE wave도 동일 적용 | 페르소나/시스템 설정 노출 실 운영 댓글 발견 + HIDDEN 글에 수동 실행 시 봇댓글 붙는 안전 문제 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | micro-scheduler.ts BotLog 직접 호출 | scheduler.ts는 safeBotLog() 사용, 일관성 불일치 | 동작상 문제 없음, 추후 통일 권장 |
