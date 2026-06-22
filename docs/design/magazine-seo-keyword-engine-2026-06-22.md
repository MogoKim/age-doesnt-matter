# 매거진 SEO 키워드 엔진 — 기획·설계서 (2026-06-22)

> 상태: **설계 검토 중 (창업자 승인 대기)** · 작성: Claude Opus 4.8 · 실행(Playwright/코드) 미착수
> 핵심 결정 확정: ① 민감키워드 = 의학근거+커뮤니티 톤 ② 리서치 = SERP클릭+자동완성+GSC 병행 ③ pillar 랜딩페이지 신규 제작

---

## 0. 한 줄 요약

매일 다작하지만 노출 0인 현재 매거진을, **"DA1이 실제로 이길 수 있는 롱테일 연관검색어"를 Playwright로 대량 조사 → 토픽 클러스터(pillar+자녀글) 시리즈로 묶어 하루 2편씩 1년+ 발행**하는 구조로 전환한다.

---

## 1. 문제 정의 (왜 지금 SEO가 최악인가)

| 증상 | 근본 원인 | 근거 |
|---|---|---|
| 매일 배포해도 검색·고객 노출 0 | **DA 1 신규 도메인 + 백링크 ≈ 0** | 메모리 SEO진단 2026-06-15 (병목=권위, 기술설정은 정상) |
| 글은 쌓이는데 순위 없음 | **주제가 너무 광범위** — "갱년기란?", "국민연금 언제 받나" = DA90 병원·언론·공공이 1페이지 영구 점령 | `agents/magazine/series-plan.ts` ANNUAL_SERIES_2026 주제들 |
| 크롤·품질 신호 하락 | **다작 = 얕고 유사한 글** → 크롤 버짓 낭비 | 일일 3편(`maxArticles=3`) |
| 정답은 이미 코드에 있었음 | 손으로 적은 롱테일 사전 ~80개만 존재, 확장 안 됨 | `agents/magazine/longtail-keywords.ts` 주석 "DA90+가 관심 없는 틈새" |

**결론**: DA1 도메인의 유일한 정공법 = 병원·언론이 안 쓰는 **초구체 롱테일 질문형 키워드**를 선점. 창업자 직감(연관검색어 롱테일을 시리즈로)이 정확. 지금 할 일 = 그 롱테일 사전을 손80개 → **리서치 기반 수백~수천 개**로 확장.

---

## 2. 목표 (To-Be)

1. **하루 2편**(오전·오후 각 1편), 노출 최적 시간에. (현재 3편 → 2편)
2. 모든 글이 **실제 검색수요가 확인된 롱테일 키워드 1개**를 정확히 겨냥.
3. 글들이 **토픽 클러스터**로 묶임: pillar 랜딩페이지 1개 + 자녀 롱테일 글 8~15개, 내부링크 상호연결.
4. **1년+ 발행 큐**를 키워드 우주에서 자동 생성.
5. 진짜 SEO 글: 검색의도 직답(첫 문단) + FAQ(People also ask 기반 JSON-LD) + 내부링크 + E-E-A-T 신호.

---

## 3. 키워드 리서치 엔진 (Playwright) — 조사 방법론

> 기존 자산 재활용: `longtail-keywords.ts`(이미 `pillar` 필드=토픽클러스터 존재) · `series-plan.ts` · `prompt.ts`(SEO_KEYWORDS·TITLE_PATTERNS).

### Phase A — 시드 키워드 (40~60개)
테마별 메인 키워드 구성. 첨부 스샷 16종 + 욕망맵(RELATION/RETIRE/MONEY/HEALTH/JOB) + 가족·연애·패션·커뮤니티.
- 예: `갱년기`, `50대 성욕`, `중년 부부관계`, `60대 여자 일자리`, `50대 커뮤니티`, `50대 여자 외로움`, `갱년기 식단`, `국민연금`, `퇴직 후`...

### Phase B — 재귀 확장 (3 소스 병행, BFS depth 2~3, dedupe, 노드 상한)
각 키워드마다 4종 신호 수집 후 새 키워드를 큐에 넣어 확장:

| 소스 | 수집물 | 방식 | 비고 |
|---|---|---|---|
| **자동완성 (백본)** | `q` 접두/접미 자동완성 (가~하, a~z, 공백) | `google.com/complete/search?client=firefox&q=` JSON | 차단 위험 최저, 가장 넓음. 엔진의 주력 |
| **People also search for** | 스샷의 연관검색어 8종 | Playwright SERP 클릭·수집 | 사람이 보는 의도, 차단 위험 → 상위 시드만, 인간형 페이싱 |
| **관련 검색어** | SERP 하단 | Playwright | 〃 |
| **People also ask (PAA)** | "관계 너무 자주 하면?" 류 질문 | Playwright (펼치면 더 생성) | → **FAQ JSON-LD·H2 소제목**으로 직결. SEO 금광 |
| **GSC 실측** | 우리 도메인이 이미 노출(impression) 받지만 클릭/순위 낮은 쿼리 | Search Console API | "숨은 기회" 발굴 — 가장 확실한 신호 |

리스크/완충: Google SERP 자동화는 captcha 위험 → **자동완성 API를 주력**, SERP 스크레이프는 상위 시드에만 + 기존 카페크롤러식 로그인 프로필·스로틀·랜덤 지연 재사용. GSC API는 접근 권한 확인 필요(§8).

### Phase C — 정제·스코어링
각 키워드에 부여:
- **의도**: 질문형/비교형/상황형/계산형/방법형 (기존 `LongtailKeyword.intent` 스키마 그대로)
- **브랜드핏**: 50·60대 여성 적합도 (의류 쇼핑몰·연하남·디시 같은 비적합 제거 또는 톤조정)
- **경쟁도 추정**: SERP 1페이지가 디시·82cook·유튜브 등 **UGC면 DA1 침투 가능(채택)** / 병원·공공·언론이면 **회피 또는 초롱테일로 우회**
- **AdSense 안전성**: 민감 키워드 플래그 (§5 정책 적용)

### Phase D — 토픽 클러스터링
pillar 1개 + 자녀 롱테일 8~15개. `longtail-keywords.ts`의 `pillar` 구조를 그대로 대규모 확장.
- 예 pillar "갱년기 성건강, 우리 또래 솔직한 이야기" ← 자녀: "갱년기 후 관계가 부담스러울 때", "질건조 불편함 병원 가야 하나", "남편과 대화로 푸는 법", "산부인과 의사가 권하는 이유"...

### Phase E — 1년+ 발행 큐
2/day 순차 큐, 우선순위 = 수요(자동완성 깊이·GSC impression) × 브랜드핏 × 저경쟁. **시리즈 단위 연속 발행**(내부링크 자연 누적). 산출물:
- `agents/magazine/data/keyword-universe.json` — 전체 키워드 우주(원천 데이터)
- `longtail-keywords.ts` / 신규 `series-plan` 대규모 확장
- 발행 큐(클러스터 순서)

---

## 4. 발행 구조 변경 (2편/일) — 실행경로 감사(2026-06-22) 반영

> ⚠️ **대원칙: 새 발행 경로를 만들지 않는다.** 키워드 큐는 별도 스크립트·별도 cron·별도 launchd가 아니라, **기존 `magazine-generator.ts` 내부 입력만 교체**한다. 그래야 launchd가 켜진 채로도 **중복 발행이 원천 불가**하다.

### 4-1. 현재 살아있는 실행 경로 (이것 하나뿐)

```
launchd (Mac 로컬, 2개 plist)
  ├─ com.unaeo.magazine-morning.plist  12:00 KST, IMAGE_GENERATOR=chatgpt
  └─ com.unaeo.magazine-late.plist     14:00 KST, IMAGE_GENERATOR=chatgpt
        ▼ launchd-wrapper.mjs
        ▼ agents/cafe/local-magazine-runner.ts   (SESSION_TIME=morning|late)
        ▼ import('./magazine-generator.js') → runMagazine()   (line 179-180)
        ▼ agents/cafe/magazine-generator.ts  main()  ← 진짜 발행 로직 (입력 교체 지점)
```

- **GitHub Actions 매거진 = 비활성화**: `agents-daily.yml`의 `on.schedule` `# - cron: "0 7 * * *"` 주석처리 + determine case도 주석("launchd 이관 완료"). magazine task가 절대 안 나옴 → GHA는 발행 안 함.
- **`schedules.yaml`의 magazine-generate(16:00 CafeTrend) = stale 선언**: 런타임에 이 파일을 읽는 코드 없음(grep 0건), 실제(12/14시 chatgpt)와도 불일치. 실행되지 않는 문서성 항목.

### 4-2. 입력 우선순위만 교체 (새 경로 생성 금지)

`magazine-generator.ts main()`의 주제 선정 블록(현재: 시리즈→geo_seed→CafeTrend→욕망폴백)을 다음으로 교체:

```
1순위:  keyword queue            ← 신규 주력 (별도 실행 아님, generator가 import만)
2순위:  CafeTrend.magazineTopics ← fallback (강등, 삭제 아님)
3순위:  geo_seed                 ← fallback
4순위:  욕망지도(DESIRE_TOPIC_HINTS) ← 최후 fallback
```

큐가 비거나 고갈돼도 기존 폴백이 받쳐 발행 공백 0.

### 4-3. 발행량·세션 캡

- `maxArticles` **3 → 2** (일일 총 2편).
- **세션별 1편 캡**: morning 세션 **1편**, late 세션 **1편** → "오전 1·오후 1" 실현.
  (현재는 morning이 캡까지 몰아 발행하고 late는 스킵되는 구조 — 로그 확인: 06-21 morning 3편/late 스킵.)

### 4-4. 중복가드 — 그대로 유지 (백스톱)

- `isSimilarTitle`(최근 7일 첫3단어 2개겹침) + `isDuplicateAllTime`(전체기간 정규화) **유지**.
- 큐·폴백 혼선이나 수동 핸들러 재실행 시에도 같은 글 재발행을 막는 안전망.

### 4-5. launchd / 발행 시각

- **plist·launchctl 변경 없음** (입력만 바꾸므로). launchd 2세션 그대로 유지.
- 발행 시각(노출 최적 시간) 변경이 필요할 때**만** plist 수정 → **창업자 `launchctl reload` 별도 승인**.

### 4-6. 어드민 영향

- 일일 발행 편수(3→2)·세션 분포 표시 변동 가능 → 점검 필요.

---

## 5. 민감 키워드 편집 정책 (확정: 의학근거 + 커뮤니티 톤)

성욕·부부관계·성 횟수·바람 등 = **실제 검색수요 최상위**. 버리지 않되 다음 톤으로:

- **톤**: constitution 페르소나 "**옆자리 친구**" — 같은 나이, 같은 고민, 먼저 공감. 너무 임상적(병원 안내문) ✗, 너무 자극적/노골적 ✗. **우리 또래가 솔직하게 나누되 의학 근거로 안심**시키는 커뮤니티 글.
- **프레이밍**: "갱년기 성건강", "부부관계 변화", "질건조·통증" 등 건강·관계 정보로. 산부인과·의학 출처 1개 이상 인용(E-E-A-T).
- **금지**: 노골적 표현, 클릭베이트 자극 제목, "시니어"(브랜드 금지어 — 우리 또래/50·60대).
- **AdSense**: 정책 위반(성적 콘텐츠) 회피. 발행 전 민감 플래그 글은 표현 검수 게이트 통과 필수.

---

## 6. Pillar 랜딩페이지 (신규 제작 — 확정)

각 시리즈마다 허브(pillar) 페이지 신규:
- 신규 라우트: `src/app/(main)/magazine/series/[seriesSlug]/page.tsx` (또는 `/magazine/topic/[slug]`)
- 내용: 클러스터 개요 + 자녀 롱테일 글 전체 내부링크 + pillar 자체도 핵심 키워드 타겟
- SEO: BreadcrumbList + ItemList JSON-LD, 자녀↔pillar 양방향 내부링크
- 자녀 글 본문에도 "이 시리즈 다른 글" 내부링크 블록 추가
- **신규 라우트·템플릿·sitemap 반영 필요** (가장 작업량 큰 부분)

---

## 7. 실행 단계 (승인 후 순서 — Playwright는 P2에서)

| 단계 | 내용 | 산출물 | Playwright |
|---|---|---|---|
| **P0** | 시드 키워드 세트 확정 + 리서치 스크립트 설계 | 시드 리스트 | ✗ |
| **P1** | GSC API 접근 확인 + 자동완성 수집기 작성 | 수집기 코드 | ✗ |
| **P2** | **Playwright 연관검색어·PAA 재귀 수집 실행** | `keyword-universe.json` 1차 | **✓ 여기서 켬** |
| **P3** | 정제·스코어링·클러스터링 | 시리즈/롱테일 확장 데이터 | ✗ |
| **P4** | 발행 큐 생성 + **generator 내부 입력만 교체**(새 경로 생성 금지) + 2편/일·세션별 1편 캡 | 코드 변경 | ✗ |
| **P5** | pillar 랜딩페이지 라우트·템플릿·sitemap | 신규 페이지 | ✗ |
| **P6** | 프롬프트 강화(FAQ·내부링크·검색의도 직답) + tsc/build 검증 | — | ✗ |

각 단계 끝에 보고 후 다음 진행. **P2(Playwright)는 창업자 승인 직후에만.**

---

## 8. 창업자 확인/액션 (선행 필요)

- **GSC Search Analytics API 접근**: 도메인 속성은 인증됨(메모리), 단 Search Console **API 읽기 권한**(서비스계정 또는 OAuth scope `webmasters.readonly`)이 연결돼 있는지 확인 필요. 없으면 리서치는 SERP+자동완성만으로 시작 가능.
- 발행 시각·plist 변경 시 `launchctl reload` (P4 이후).

---

## 9. 리스크

- Google SERP 자동화 captcha/차단 → 자동완성 API 주력 + SERP 최소화로 완충.
- 민감 키워드 AdSense 위반 → §5 검수 게이트.
- 2편/일 전환 후 회귀 주의(tsc/build/스모크). 단 **레거시 코드 삭제는 즉시 하지 않음**(§11).
- pillar 신규 라우트 → 어드민·sitemap·CSP 영향 점검.

---

## 10. 범위 밖 (이번에 안 건드림)

- 봇 인게이지먼트 정책(매거진은 봇 댓글 X — 유지)
- 이미지 파이프라인(ChatGPT) — 유지
- 카페 트렌드 연계 — 키워드 큐가 주력이 되면 보조로 강등(삭제 아님)

---

## 11. 레거시 정리 — 새 구조 1~2주 안정화 후에만

> 입력 교체 직후엔 **아무것도 삭제하지 않는다.** 큐 기반 2편/일이 1~2주 정상 발행되는 것을 확인한 뒤, 별도 승인으로 정리한다. (조기 삭제 시 폴백 경로가 사라져 발행 공백 위험.)

### 11-1. 삭제/정리 후보 (1~2주 안정화 확인 후)

- `series-plan.ts`의 **월요일 시리즈 로직**(`getActiveSeriesToday`, `dayOfWeek===1`) — 큐가 주제원이 되면 미사용. 시리즈 제목 데이터는 큐 시드로 재활용.
- `schedules.yaml`의 **stale magazine 항목**(16:00 CafeTrend) — 갱신 또는 제거(단순 삭제 전 check-cron-links 정합성 확인).
- `agents-daily.yml`의 **죽은 magazine 주석 cron/case** — 순수 클린업(기능 영향 0).

### 11-2. 절대 삭제 금지 (전환 후에도 유지)

- **launchd plist 2개** — 실행 차량. 입력만 바뀌고 유지(중지 시 발행 0).
- **`local-magazine-runner.ts`** — Slack 집계·브라우저 종료·세션 오케스트레이션.
- **`magazine-generator.ts` 발행 코어** — 발행·DB 저장·CPS 저장.
- **이미지 파이프라인**(ChatGPT Playwright).
- **중복가드** `isSimilarTitle` / `isDuplicateAllTime` — 큐 전환 후에도 중복 방지 백스톱.
- **`runner.ts` 수동 핸들러** `cafe_crawler:magazine-generate` — 수동/백스톱용.
- **CafeTrend / geo_seed / 욕망지도 폴백** — 큐 고갈 시 발행 공백 방지(강등이지 삭제 아님).
