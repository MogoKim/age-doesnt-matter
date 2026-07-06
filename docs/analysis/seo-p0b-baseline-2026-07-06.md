# P0 B그룹 6개 SEO 메타 반영 — Baseline (2026-07-06)

> **목적**: 6개 글의 seoTitle/seoDescription 수동 반영(2026-07-06 완료) **직전 상태**를 고정 기록해, 이후 GSC 지표 변화를 효과로 판정하기 위한 기준선.
> **성격**: read-only 측정 기록. 코드/DB/PR 변경 없음.
> **주의**: 이 문서의 GSC 지표(기간 2026-06-08~07-05)는 seoTitle/desc 반영 **전** 데이터 = 순수 before baseline.

---

## 1. 개요

- **기준일**: 2026-07-06 (KST)
- **GSC baseline 기간**: 2026-06-08 ~ 2026-07-05 (28일, 반영 전)
- **seoTitle/seoDescription 반영**: 2026-07-06, 어드민 정상 저장 경로(`adminUpdatePostContent`)로 6개 입력 완료
- **HTML 반영 검증**: 2026-07-06, 6개 공개 페이지 모두 `<title>`=seoTitle / `<meta description>`=seoDescription / canonical self / robots `index,follow` 확인 (글6은 ISR 재생성 후 반영 확인)
- **GSC 데이터 지연**: 통상 2~3일. baseline 기간 말미(7/3~7/5)는 미확정 가능. 재확인 시 동일 지연 감안.

---

## 2. Baseline 표 (8개 확인 항목)

| # | 글 | GSC 색인 URL (Google canonical) | impressions | clicks | CTR | avg position | 색인 상태 | lastCrawl |
|---|---|---|---|---|---|---|---|---|
| 1 | 종합감기약 3개 비교 | `/community/stories/종합감기약-3개-비교해봤어요-가성비-따져보니` | 9 | 0 | 0.00% | 59.3 | ✅ Submitted and indexed | 2026-06-11 |
| 2 | 안경알만 교체 | `/community/stories/안경테-가지고-아무-안경점-가서-안경알만-교체-가능할까요` | 6 | 1 | 16.67% | 13.5 | ✅ Submitted and indexed | 2026-06-03 |
| 3 | 커버드콜 세금·건보료 | `/community/`**`life2`**`/커버드콜-10억-매수하면-세금건보료는-어떻게-될까` | 7 | 0 | 0.00% | 7.1 | ✅ Submitted and indexed | 2026-06-12 |
| 4 | 미화 공공기관 이직 | `/community/stories/미화-경력쌓으면-공공기관-미화이직-쉬울까요` | 3 | 1 | 33.33% | 4.7 | ✅ Submitted and indexed | 2026-07-03 |
| 5 | 50대 배드민턴 시작 | `/community/stories/50대에-배드민턴-시작했는데-진짜-중독되네요` | 1 | 1 | 100.00% | 93.0 | ✅ Submitted and indexed | 2026-06-12 |
| 6 | 7월 경주 vs 부산 | `/community/stories/7월-경주-vs-부산-어디가-더-좋을까요`**`?from=trending`** | 1 | 1 | 100.00% | 77.0 | ⚠️ trending판만 색인 / 정규경로 미색인 | 2026-06-24 |

- **6개 합계**: impressions 27, clicks 4, 평균 CTR ≈ 14.8%
- robots: 6개 전부 `index, follow` (GREETING 카테고리 아님) / indexingState: INDEXING_ALLOWED / robotsTxt: ALLOWED

### seoTitle / seoDescription (2026-07-06 반영값, HTML 반영 확인됨)

| # | seoTitle | seoDescription(요약) |
|---|---|---|
| 1 | 종합감기약 3개 비교 후기 — 성분·가격 따져봤어요 | 약국 종합감기약 3종 성분·가격 비교 후기, 복용은 약사·의사 상담 |
| 2 | 안경알만 교체 가능할까? 아무 안경점 비용·방법 | 안경테에 렌즈만 교체 가능 여부·비용·시력검사 정리 |
| 3 | 커버드콜 ETF 세금·건강보험료 — 얼마나 늘어날까 | 커버드콜 ETF 배당 세금·건보료 영향, 은퇴 현금흐름 참고 |
| 4 | 미화 경력으로 공공기관·공무직 이직 가능할까 | 병원 미화 경력→공공기관 공무직 이직 채용 현실 |
| 5 | 50대 배드민턴 시작 후기 — 초보 입문과 재미 | 50대 동호회 배드민턴 입문·중독성·체력 관리 |
| 6 | 7월 여행 경주 vs 부산 — 당일치기 어디가 좋을까 | 여름 경주·부산 하루 코스 비교, 50·60대 당일치기 참고 |

---

## 3. 특이사항 (재확인 시 반드시 같은 URL로 비교)

1. **글3 커버드콜 = `life2`(2막준비) 게시판 경로로 색인**. `stories` 경로로 조회하면 "unknown to Google"로 나오므로, **재확인은 반드시 `/community/life2/...` URL**로 해야 함. seoTitle은 DB(Post) 필드라 게시판 경로와 무관하게 반영됨(검증 완료).
2. **글6 경주부산 = canonical 불일치**. 페이지의 userCanonical은 쿼리 없는 `stories/...` 정규 경로지만, 구글은 `?from=trending` 버전을 googleCanonical로 선택해 색인. 정규 경로 자체는 아직 미색인(unknown). → 이 글의 baseline·재확인은 **`?from=trending` 색인판** 기준. (근본 개선은 별도 과제: trending 유입 링크에 canonical/파라미터 정리 필요)
3. 글1·5·6은 position이 낮거나(59·93·77) CTR 0 → seoTitle 개선 효과가 가장 크게 드러날 후보. 글2·4는 이미 상위(13·4)라 CTR 유지가 관전 포인트.

---

## 4. 재확인 일정 및 기준

### 1차 확인 — 2026-07-09 (반영 +3일)
- **목적**: 조기 신호. GSC 데이터 지연으로 impressions 유의미 비교는 이르며, 주로 아래를 본다.
  - 6개 URL **재크롤(lastCrawl) 갱신 여부** — 새 seoTitle 반영 크롤 발생?
  - 색인 상태 **악화 없음**(indexed → 유지)
  - SERP상 title/description이 새 값으로 노출되기 시작하는지(스팟 확인)
- **판정**: 색인 유지 + 재크롤 시작이면 "정상 진행". 지표 증감은 참고만.

### 2차 확인 — 2026-07-16 (반영 +10일)
- **목적**: 본 효과 판정. GSC 데이터가 ~7/13까지 반영되어 반영 후 구간(7/6~7/13) vs baseline 비교 가능.
- **비교 대상**: 동일 6개 URL, 동일 조회 방식(글3=life2, 글6=trending판).

---

## 5. PASS / FAIL 기준

각 글에 대해 baseline(2026-07-06 표) 대비 아래 4개를 판정. **URL별 개별 판정 + 6개 종합**.

| 기준 | PASS 조건 | FAIL 조건 |
|---|---|---|
| ① impressions | baseline 대비 증가(≥) | 감소 |
| ② avg position | 개선(숫자 감소) 또는 유지 | 악화(숫자 상승) |
| ③ CTR | 유지 또는 개선 | 하락 |
| ④ 색인/크롤 상태 | Submitted and indexed 유지 (악화 없음) | 색인 제외/크롤 차단 발생 |

### 종합 판정 규칙
- **전체 PASS**: 6개 중 ④(색인 악화 0) 필수 충족 + ①②③에서 다수 글이 개선/유지.
- **부분 개선**: 일부 글만 지표 개선 — seoTitle 효과가 나타나는 글 특정 후 확대 적용 검토.
- **FAIL/롤백 검토**: ④ 색인 악화가 1건이라도 발생하거나, 다수 글에서 position·CTR 동반 하락 시 → seoTitle 원인 여부 조사(GSC 지연·계절성 등 교란요인 배제 후).

### 교란요인 주의
- GSC 지표는 계절성·외부 링크·알고리즘 변동에 영향받음. seoTitle 단독 효과로 단정 말 것.
- impressions 절대량이 작아(1~9) 소수 변동에도 CTR/position이 크게 흔들림 → 추세로 판단, 단일 수치 과대해석 금지.
- 글6은 정규 경로 미색인 상태 → 정규 경로가 색인되면 지표가 trending판↔정규판으로 분산될 수 있음(비교 시 합산 고려).

---

## 6. 재조회 방법 (동일 재현)

- GSC searchanalytics: `sc-domain:age-doesnt-matter.com`, dimension=`page`, JWT 인증(`GOOGLE_INDEXING_CLIENT_EMAIL`/`PRIVATE_KEY`, scope `webmasters.readonly`)
- URL Inspection: `urlInspection.index.inspect`, inspectionUrl은 위 표의 **Google canonical URL**(글3=life2, 글6=?from=trending)
- HTML 반영: 각 공개 URL fetch → `<title>` / `meta[name=description]` / `link[rel=canonical]` / `meta[name=robots]`
