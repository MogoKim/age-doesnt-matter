# P0-3 — 신규 발행글 seoDescription 고유화

> 검색 생존 모드 · 2026-08-17 작성
> 실험 문서 규칙: `docs/seo/experiments/README.md`
> 상위 정책: `docs/seo/SEO_OPERATING_MASTER.md`

---

## 목적

신규 발행글의 검색엔진 노출 설명문(`meta description`)을 **원문 발췌가 아니라 우나어 관점의 고유 문장**으로 만든다.

P0-3는 duplicate description / 원문 발췌 문제를 줄이는 **필요조건**이다. 검색 회복을 보장하지 않는다.
(진단 문서 기준 1순위 병목은 도메인 권위(백링크 0)이며, 구글 index 유지분은 3,068건뿐이다)

---

## A. 배경

검색 생존 모드에서 여기까지 왔다.

| 단계 | PR | 내용 | 상태 |
|---|---|---|---|
| P0-1 | #379 | daily count를 `createdAt`·KST 기준으로 교정 | merged |
| P0-2 | #380 | 리라이팅 결과를 `seoTitle`에도 반영 | merged |
| 확대 | #381 | gate source 허용 범위를 publishable 기준으로 교정 | merged |
| 품질 | #382 | 큐레이션 원문 품질 gate (실존 인물 비방·국적 비하) | merged |
| rescue | — | 기존 글 50건 `seoTitle`/`seoDescription` 반영 (HTML 50/50 확인) | 완료 |

**다음 병목이 description이다.** 검색엔진은 제목과 설명문을 함께 읽는다. P0-2로 제목은 고유해졌지만 설명문은 여전히 원본 카페 글의 첫 문장이다. 네이버는 그 원문을 이미 자기 카페에서 색인하고 있으므로, 우리 문서는 "제목만 바꾼 복제본"으로 보일 여지가 남는다.

---

## B. 문제 정의 정정 ★

**이전 진단은 신규 발행글에 대해서는 틀렸다.**

2026-08-17 SEO 구조 감사에서 "seoDescription NULL 66.8%가 원인"이라고 보고했다. 그 수치는 **전체 누적 9,663건 기준**이며 과거 파이프라인의 잔재다. 신규 발행분만 다시 재면 결론이 달라진다.

### 최근 7일 발행 641건 실측 (2026-08-17)

| 지표 | 수치 |
|---|---|
| `seoDescription` NULL | **21건 (3.3%)** |
| `seoDescription`이 본문 앞부분으로 시작 | **392/400건 (98.0%)** |
| `seoDescription` 앞 40자 == `summary` 앞 40자 | **375/400건 (93.8%)** |
| `summary`가 본문 앞부분 복사 | **641/641건 (100%)** |

### 실제 샘플

```
title    자취남 유튜브 보다가 나 진짜 미니멀리스트 됐나 싶었어요 ㅋㅋ
seoDesc  사람이 사는게 저렇게 많은 물건이 필요할까?
본문앞   사람이 사는게 저렇게 많은 물건이 필요할까? ​ 그냥 평범한 예로 음처기, 식세기…
         → 완전 일치
```

### 결론

```
P0-3는 "빈칸 채우기"가 아니라 "이미 원문 발췌로 채워진 값을 고유 설명으로 덮어쓰기"다.
NULL은 3.3%뿐이고, 진짜 문제는 채워진 98%의 내용이 원문이라는 것이다.
```

---

## C. AS-IS 경로

```
[발행] publishCuratedContent (content-curator.ts)
   └ buildPopularSeoMeta({ title, rawContent, summary })
        → seoTitle · seoDescription 생성 (원문 title/content의 단어만 사용)
   └ Post 생성 — seoDescription이 이 시점에 채워진다 (= 본문 앞부분)

[리라이팅] tryTitleRewrite (발행 직후, 같은 함수 안)
   └ runTitleRewrite → title + seoTitle UPDATE
        ⚠️ seoDescription은 건드리지 않음 (PR #380의 의도된 범위 제한)

[렌더] generateMetadata (src/app/(main)/community/[boardSlug]/[postId]/page.tsx)
   title:       post.seoTitle ?? post.title
   description: post.seoDescription ?? (post.preview || '50·60대가 나이 걱정 없이…')
                 ~~~~~~~~~~~~~~~~~~ 96.7%가 여기서 끝난다 = 원문 발췌가 노출된다
   og:title · twitter:title 도 seoTitle 기준 (P0-2 계약 테스트로 고정)
```

`preview`는 `posts.base.ts` 등에서 `post.summary ?? ''`로 만들어진다. 즉 fallback 체인 전체가 원문 텍스트다.

---

## D. 의사결정

### 채택: **A안 — title rewrite 모델 응답에 `seoDescription`을 함께 포함**

| 안 | 내용 | 판정 |
|---|---|---|
| **A** | 기존 모델 응답 JSON에 `seoDescription` 필드 추가 | **채택** |
| B | 발행 후 deterministic 생성 | 기각 |
| C | 별도 모델 호출로 생성 | 기각 |
| D | 발행 후 batch 보정 | 기각 |

### 각 안을 채택하지 않은 이유

```
B안 (deterministic)
  "본문에 없는 말을 만들지 않는다"는 제약 아래 규칙 기반으로 만들면
  결국 원문 문장의 재배열이 된다. 복제 신호를 줄인다는 목적 자체를 달성하지 못한다.

C안 (별도 모델 호출)
  발행 경로에 실패 지점이 하나 늘고 회차당 2~4초가 추가된다.
  현재 회차 78초 · 3건 발행 기준 +12초. 품질 이득 대비 운영 위험이 크다.
  월 비용도 ~$12 증가한다.

D안 (batch 보정)
  검색 생존 모드에서 치명적이다. 신규 글이 **최초로 크롤링될 때** 원문 발췌를 보여주고
  그 인상이 먼저 색인된다. 나중에 고쳐도 재평가를 기다려야 한다.
```

### A안을 고른 이유

```
① 모델 호출 수가 늘지 않는다 — 기존 1회 응답에 필드 하나를 더 받을 뿐. 지연 0, 실패 지점 0 증가
② 검증 로직을 재사용한다 — title-rewrite-validate.ts에 요구 규칙 9개 중 7개가 이미 구현·검증됨
③ title과 description이 같은 판단에서 나와 한 편집자가 쓴 것처럼 붙는다
④ 실패를 분리할 수 있다 (아래 참조)
```

### 세부 결정 4가지 (창업자 확정 2026-08-17)

```
1. MODEL_KEEP에도 seoDescription을 생성한다
   KEEP   = 제목은 그대로, 설명은 새로
   REWRITE = 제목·설명 둘 다 새로
   REJECT  = 둘 다 생성 안 함 (글 자체가 대상이 아님)
   근거: merge 이후 실측 모델 호출 10건 중 4건(40%)이 KEEP이다.
        KEEP에서 생성하지 않으면 개선 기회의 40%를 버린다.
   → decision의 의미를 "제목에 대한 판단"으로 한정하고 description은 독립 필드로 둔다.

2. description 검증 실패가 title 적용을 막지 않는다
   title/seoTitle은 적용하고 seoDescription만 제외한다.
   근거: title 적용은 이미 검증된 개선이다. description 때문에 버리면 P0-2 효과까지 잃는다.
        description은 값이 없어도 기존 fallback(summary)이 동작하는 안전한 축퇴다.

3. 신규 발행글만 대상 — 기존 글 백필 없음
   SEO rescue 50건을 포함해 이미 발행된 글은 이 경로를 타지 않는다.

4. sitemap ↔ googlebot noindex 불일치는 별도 P1로 분리
   8/18 GSC 재확인 WAIT 해제 후 다룬다. 이번 PR에 섞지 않는다.
```

---

## E. P0-3 생성 규칙

```
길이        70~130자
금지
  · 원문 첫 문장 / summary 앞부분 복붙
  · title과 같은 문장 반복
  · 본문에 없는 숫자·금액·질병·지역·관계·직업·나이 추가
  · 시니어 · 노인 · 실버 · 어르신 · 노년   ("노후"는 허용)
  · 카페명·원문 커뮤니티명 노출 (우갱·레테·레몬테라스·맘카페 등)
  · 실존 인물 사생활/비방을 description에서 키우는 것
  · 국적·인종·종교 비하 표현
  · 의료·법률·금융·투자 단정
  · 과한 낚시·공포·선정 표현
지향
  · 글쓴이의 상황과 감정을 우리 나이 여성 독자가 이해할 수 있게 요약
```

---

## F. 검증 정책

### 기존 재사용 (`title-rewrite-validate.ts`)

```
BANNED_WORD_PATTERN        시니어|노인|어르신|실버|노년
CAFE_NAME_PATTERN          우갱|레테|레몬테라스|우리가 갱년기|중년게시판|맘카페
MEDICAL_ASSERTION + TOPIC  의료 단정 결합 판정
CLICKBAIT / BLOGGY / YOUNG_SLANG
extractNumbers             → NUMBER_NOT_IN_SOURCE
CHECKED_ENTITY_PATTERN     며느리·시어머니·남편·딸 등 가족관계
AGE_JOB_PATTERN            50대·간호사·공무원 등 나이·직업
```

### 신규 (`validateSeoDescription`)

```
DESC_TOO_SHORT          70자 미만
DESC_TOO_LONG           130자 초과
DESC_COPIED_FROM_SOURCE 원문 발췌 판정 — P0-3의 존재 이유이므로 가장 엄격하게
                          (a) description 앞 25자가 본문 앞 40자 안에 있으면 reject
                          (b) 본문 첫 120자와 어절 자카드 유사도 ≥ 0.6이면 reject
DESC_SAME_AS_TITLE      새 title과 어절 80% 이상 겹치면 reject
```

### 실패 시 동작

```ts
await prisma.post.update({ data: {
  title: newTitle,
  seoTitle: newTitle,
  originalTitle: current.originalTitle ?? current.title,
  ...(descOk ? { seoDescription: newDesc } : {}),   // ← 조건부. 실패하면 키 자체가 없다
}})
```

한 트랜잭션 안에서 부분 적용한다. description이 빠져도 UPDATE는 성공하고 기존 값이 유지된다.

로그로 관측한다.
```
applied … · desc=applied(92자)
applied … · desc=skipped(DESC_COPIED_FROM_SOURCE)
```

⚠️ `tryTitleRewrite`는 이미 try/catch로 감싸져 발행에 영향을 주지 않는다. description 추가가 이 계약을 바꾸지 않음을 테스트로 고정한다.

---

## Baseline (적용 전)

```
최근 7일 발행 641건 기준
  seoDescription NULL                 21건 (3.3%)
  본문 앞부분으로 시작                 392/400건 (98.0%)
  앞 40자 == summary 앞 40자           375/400건 (93.8%)

운영 설정
  TITLE_REWRITE_ENABLED=true
  TITLE_REWRITE_SOURCES=wgang,dlxogns01,remonterrace,goondae,masanmam
  TITLE_REWRITE_DAILY_LIMIT=50

비용  applied 건당 ~$0.013 · limit 50 기준 월 약 $20
     (P0-3 적용 후 예상: 건당 ~$0.0135 · 월 약 $21 — 출력 토큰만 증가, 호출 수 불변)
```

## 변경 범위

```
docs/seo/experiments/2026-08-17-p0-3-seo-description-rewrite.md   이 문서
agents/cafe/title-rewrite-prompt.ts     JSON 스키마 + 생성 규칙 + 버전 bump
agents/cafe/title-rewrite-validate.ts   validateSeoDescription 신규
agents/cafe/title-rewrite-runner.ts     파서 필드 추가 · 조건부 update · 로그
src/__tests__/title-rewrite-runner.test.ts     케이스 확장
src/__tests__/title-rewrite-validate.test.ts   신규

스키마 변경 없음 — Post.seoDescription은 이미 존재(text nullable)
```

## 적용 일시

(merge 후 기록)

## 1차 확인

(merge 후 첫 큐레이션 회차 — 기록)

## 2차 확인

(적용 +7일 — 네이버 색인·노출, GSC 지연 감안. 기록)

---

## G. PASS 기준

```
· 신규 발행글 applied 1건 이상
· desc applied 1건 이상
· HTML meta description이 새 문장 (원문 발췌 아님)
· 원문 발췌 통과 0건
· 사실 오류 0건
· title/seoTitle 정상 동작 유지
· slug/canonical 불변
· 발행 실패 0
· 기존 글 무변경 (SEO rescue 50건 포함)
· 모델 호출 수 증가 0
```

## FAIL 기준

```
· description이 원문 발췌 그대로 통과
· description 때문에 title 적용 실패
· 사실 오류 1건 이상
· slug/canonical 변경
· 기존 글 변경
· 발행 실패
· 모델 호출 수 증가
```

## PARTIAL 기준

```
· 발행 0 또는 applied 0 (검증 기회 없음)
· desc 전건 skip (검증이 과도하게 엄격 — 임계값 재조정 대상)
· HTML ISR 재검증 대기
```

---

## H. 이번 PR에 포함하지 않는 것

```
✗ sitemap ↔ googlebot noindex 불일치 (P1 — 8/18 WAIT 해제 후 별도)
✗ 기존 글 백필 (SEO rescue 50건 포함)
✗ SEO rescue 2차
✗ robots / noindex 정책 / canonical
✗ slug 생성 로직
✗ title rewrite source / gate 확대
✗ 원문 품질 gate 추가 확장
✗ vars 변경 (limit·source 그대로)
```

---

## I. rollback

```
1단계  vars TITLE_REWRITE_ENABLED=false     즉시·배포 불필요 (신규 적용 전면 중단)
2단계  PR revert                             신규 seoDescription update 중단
                                            ⚠️ 이미 적용된 값은 남는다 → 3단계 필요
3단계  개별 글 seoDescription = NULL 복원     DB write·별도 승인
                                            NULL이면 기존 fallback(summary)이 자동 동작
                                            = 원래 상태로 복귀

※ slug·title·originalTitle을 애초에 건드리지 않으므로 URL·색인은 어떤 경로에서도 안전하다.
※ 반영 전 현재값 백업 JSONL을 남긴다 (SEO rescue와 동일 관례).
```

---

## 결과

(1차·2차 확인 후 기록 — **baseline만 있고 결과가 없으면 실패한 실험으로 본다**)

## 후속 조치

(기록)
