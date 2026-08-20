# M3 — 새 브랜드 준비 전략 (New Brand Readiness)

> **문서 성격**: 실행 계획이 아니라 **판단 기준 문서 + D-day 준비 문서**다.
> 네이버 회복 실패로 `우리 나이가 어때서`가 생존 불가 판정을 받을 경우,
> 창업자 승인 후 **24시간 안에 새 브랜드 MVP를 개설**할 수 있도록
> 브랜드·제품·코드·인프라·SEO·운영·콘텐츠 정책을 미리 확정해 둔다.
> **갱신 방식**: append/update. 마일스톤이 끝날 때마다 해당 절을 갱신한다.
>
> 최초 작성 2026-08-19 · 근거 M3-0 AS-IS Inventory (read-only 실측)

---

## 0. 현재 판정

**PARTIAL — 전환 가능하나, 그대로 복제하면 같은 문제를 재생산한다.**

코드 자산은 재사용 가치가 충분하다. 그러나 **운영·콘텐츠 구조를 그대로 가져가면
새 브랜드에서도 "퍼온 글 99.4% + 봇 댓글 93.5%" 구조가 반복된다.**
가능한 시나리오는 하나뿐이다 — **핵심 도메인만 재사용하고 운영/크롤러/SEO는 재설계**.

### M3의 최종 목표

M3의 목표는 새 브랜드를 지금 실행하는 것이 아니다.

**목표는 `우리 나이가 어때서`가 네이버에서 회복 불가 판정을 받을 경우,
창업자 승인 후 24시간 안에 새 브랜드 MVP를 개설할 수 있도록 사전에 모든 판단과
절차를 끝내 두는 것이다.**

따라서 M3는 다음을 D-day 전까지 확정해야 한다.

```
브랜드명 후보 · 도메인 후보 기준 · 제품 본질 · MVP 정보구조
코드 이식 범위 · 버릴 레거시 · 새 인프라 생성 순서
SEO 초기 정책 · 콘텐츠 공급 정책 · 봇/페르소나 운영 정책
기존 회원 재가입 안내 · 기존 도메인 비연결 원칙 · 런칭 체크리스트
```

단, 회복 불가 판정 전에는 코드 작성·계정 생성·도메인 구매·인프라 생성은 하지 않는다.

---

## 1. 현재 위기

### 사실 (실측)

| 항목 | 상태 | 근거 |
|---|---|---|
| 네이버 유입 | **붕괴** | 2026-08-12 11:00 KST 이후. 일 1,541 → 7~10 |
| 네이버 색인 | **0** | 08-11 4,600 → 08-13 0 (Search Advisor) |
| 네이버 노출 | **0** | 08-14 이후 0 (08-18 툴팁: 노출 0 · 클릭 0) |
| 네이버 수집 | **극소량 유지** | 08-13 약 3,400 → 08-15 144 → 08-16~08-20 하루 4~14건 수준 |
| 홈페이지 색인 | **미색인** | "문서가 성공적으로 수집됐습니다. 미색인 문서로 검색대상이 아닙니다" |

**기술적 차단은 아니다.** URL 검사 8개 항목이 전부 통과한다 —
`200 OK` · `robots.txt 수집 가능` · `로봇 메타 노출 가능` · `색인 허용 여부: 예`.
그런데 **`색인 완료: 아니오`**다. 우리가 막은 것이 아니라 네이버가 색인하지 않았다.

### 대응은 이미 했다 (merge 완료, 되돌리지 말 것)

- **PR #387** 커뮤니티 soft404 → 404 복원 (`loading.tsx` 제거)
- **PR #388** fallback description 고유화 (duplicate description 재생산 차단)
- **PR #389** magazine/jobs soft404 → 404 복원
- 프로덕션 실측: 네이버가 지적한 soft404 13건 **전부 404 반환 확인**

### 그러나 회복 여부는 미확정이다

```
08-16  네이버 수집량이 하루 10건 안팎으로 축소
08-17  진단 데이터 마지막 갱신
─────────────────────────────────────
08-18  PR #387/#388/#389 배포  ← 네이버 수집량이 극단적으로 축소된 시점
```

**수집량이 하루 10건 안팎으로 축소된 구간에 우리 수정이 들어갔다.** 네이버가 고친 결과를 일부 볼 수는 있으나, 전체 수정분이 반영됐다고 볼 수 없다.
수집 요청은 이미 3회 있었다(08-12 18:37 · 08-13 21:15 · 08-16 07:49). 그럼에도 색인 0이다.

### Google은 보완재가 되지 못한다

```
28일 클릭 85 · 노출 577 · 일평균 클릭 3.3
그중 38클릭(45%)이 "우리 나이가 어때서" 브랜드 검색
색인 6,220 / 미색인 15,796 — 색인률 28%
색인된 6,220개 중 28일간 노출된 URL은 398개(6.4%)
```

**신규 발견 유입은 28일간 47건, 하루 1.7건이다.** Google이 우리를 막은 것이 아니라,
상위에 올릴 이유를 찾지 못하고 있다.

### 결론

서비스 종료까지 고려해야 하는 **생존 위기**다. 회복 여부를 우리가 통제할 수 없는 구간에 있다.

---

## 2. North Star (불변)

> **40대 중반~60대 중반 여성, 특히 50대 여성이 반복 방문하는 커뮤니티.**
> 사용자가 **"나만 그런 게 아니구나"**를 느끼고 댓글과 글을 남기는 공간.

- **타겟 우선순위**: 1순위 50대 여성, 2순위 40대 후반 여성, 3순위 60대 여성.
- **일자리 플랫폼이 아니라 커뮤니티다.** 일자리·돈·노후·일은 커뮤니티 안의 생활 축이다.
- **핵심 주제**: 갱년기, 남편, 자녀, 가족 갈등, 부모 간병, 건강, 노후, 돈, 일, 외로움, 불안, 생활 고민
- **외부글은 트래픽용 복붙이 아니라 대화를 여는 seed다.**
- 금지 표현: 시니어·어르신·노인·실버 → "우리 나이", "우리 또래", "40대 50대 여성", "인생 2막"

### 창업자 확정 원칙 (2026-08-20)

1. 새 브랜드도 본질은 **여성 커뮤니티**다. 범용 커뮤니티나 일자리 플랫폼으로 가지 않는다.
2. 핵심 타겟은 **50대 여성**이다. 40대 후반 여성과 60대 여성은 확장 타겟이다.
3. 새 브랜드명은 `우리 나이`를 직접적으로 반복하기보다 **더 은은한 이름**으로 간다.
4. 시작점은 **갱년기 특화 커뮤니티**다. 처음부터 여러 주제로 넓히지 않고, 갱년기를 공통 주제로 찐팬을 만든 뒤 확장한다.
5. 일자리 독립 구조는 버린다. 돈·노후·사는 이야기·유머·일 관련 이야기는 자유게시판 또는 매거진 안의 주제로 흡수한다.
6. 기존 회원 데이터는 이관하지 않는다. 기존 회원에게는 카카오톡 등으로 새 브랜드 재가입을 유도한다.
7. 기존 도메인에서 새 도메인으로 전체 리다이렉트하지 않는다. 실패한 도메인의 신호를 새 브랜드에 연결하지 않는다.
8. 새 브랜드의 계정·도메인·인프라는 `우리 나이가 어때서`와 최대한 독립적으로 분리한다.

### North Star 대비 현재 성적표 (M3-0 실측)

```
발행 10,644건            BOT 72.8% · SHEET 26.6% · ★ USER 0.6% (62건)
댓글 62,808건            봇 93.5% · ★ 실회원 6.4% (3,996건)
계정 507개               봇 83 · 실회원 424
최근 7일 실회원 글        5건 (일 0.7)
최근 7일 실회원 댓글      446건 (일 63.7)
본문 길이                71.4%가 300자 미만
일 발행량                134건
```

**활발해 보이지만 그 활발함의 대부분을 우리가 만들고 있다.** 이것이 현재 구조의 핵심 문제다.

---

## 3. 새 브랜드를 준비하는 이유

1. **회복 실패 대비.** 네이버 색인·수집이 우리 통제 밖이다. 회복되지 않을 가능성에 보험이 필요하다.
2. **단순 복제가 아니다.** 같은 North Star를 가진 **더 작고 밀도 높은 제품**으로 재시작한다.
3. **자산은 가져가고 부채는 두고 간다.** 코드 자산(커뮤니티 구조·댓글·인증·선별 큐)은 활용하되,
   레거시 운영·비용 비효율·저품질 신호는 가져가지 않는다.

### 도피가 아닌 이유

이 준비는 **"옮기자"가 아니라 "옮길 수 있는가, 옮긴다면 무엇을 버려야 하는가"**를 묻는다.
**네이버가 회복되면 이 문서는 현재 서비스 개선 로드맵으로 그대로 쓰인다.**
봇 비율 93.5%, 회원 글 0.6%, 발행 134건은 새 브랜드로 가든 안 가든 똑같이 고쳐야 할 문제다.
어느 쪽이든 버려지지 않는 작업이다.

---

## 4. 새 브랜드 1차 정보구조

```
홈           인기글
게시판 1      자유게시판
게시판 2      갱년기
SEO 콘텐츠    매거진
```

### 해석 (중요 — 오해 방지)

| 면 | 성격 | 오해하면 안 되는 것 |
|---|---|---|
| **인기글** | 홈/랭킹 **노출면** | 게시판이 아니다. 별도 보드를 만들지 않는다 |
| **자유게시판** | **확장 대화판** | 돈·노후·사는 이야기·유머·일 관련 이야기를 흡수한다 |
| **갱년기** | **초기 차별화 핵심판** | 새 브랜드의 시작점이다. 이 주제로 찐팬을 만든 뒤 확장한다 |
| **매거진** | SEO용 **편집 콘텐츠** | **대량 AI 글 창고가 아니다.** 적게, 길게, 원본으로 |

### 왜 이 구조인가 (근거)

- **매거진의 효율이 검증됐다.** GSC 실측에서 매거진 262건이 노출 82·클릭 5를 만들었다.
  글당 효율이 커뮤니티의 3배다. `guide` 4건은 노출 42로 **글당 노출 10.5 — 전 유형 1위**다.
  → **적은 수의 긴 원본 글이 많은 수의 짧은 글을 이긴다.**
- **갱년기 검색어에 이미 노출되고 있다.** "갱년기 극복법"(53위) · "갱년기 끝나는 나이"(30위) ·
  "갱년기 소변 냄새"(34위). 0에서 시작하는 게 아니다. MENOPAUSE 보드는 140건뿐이라 경쟁 글도 적다.
- **route 수를 줄인다.** 현재 공개 route 33개 → 10개 이내를 목표로 한다.

### M3-2 정정 원칙 (2026-08-20)

M3-2 IA/Product Spec 초안은 방향은 맞지만, 그대로 실행하면 새 브랜드 D-day에
사실 오류와 원칙 불일치가 생긴다. 아래 3개는 문서와 구현 체크리스트에 반드시 반영한다.

| 항목 | 확정 원칙 | 이유 |
|---|---|---|
| **자유게시판 URL** | 고객 URL은 `/community/talk`로 가되, D-day 내부 `BoardType`은 `STORY`를 재사용한다 | Prisma enum에 `TALK`가 없다. `TALK` enum 추가는 migration과 agent/board 분기 검토가 필요해 24시간 오픈에 부적합하다 |
| **갱년기 대표 URL** | 새 브랜드의 검색 대표 URL은 `/community/menopause` 하나로 집중한다 | `/topic/menopause`와 `/community/menopause`를 둘 다 열면 갱년기 대표성이 분산된다 |
| **갱년기 허브 자산** | `src/lib/seo/topic-menopause.ts`의 `MENOPAUSE_SECTIONS`와 `getMenopauseHubSections()`는 버리지 않고 `/community/menopause` 상단 허브로 흡수한다 | 현재 허브 자산은 검색 의도 4축(병원·치료, 감정과 관계, 몸의 변화, 폐경·완경)을 이미 갖고 있다 |
| **봇 댓글 운영** | "30% 이하" 같은 단순 상한이 아니라 정체성·기억·맥락·노출 guard를 핵심 정책으로 둔다 | 창업자 확정 원칙은 활성감이다. 다만 실회원 댓글 KPI는 별도로 분리해 봇 증가를 성장으로 착각하지 않게 한다 |

#### `/community/talk` 구현 메모

새 브랜드는 기존 DB를 이관하지 않는다. 따라서 `STORY`라는 내부 enum 이름이 고객에게 노출되지 않는다면
D-day에는 `STORY`를 자유게시판의 내부 식별자로 재사용하는 것이 가장 빠르고 안전하다.

```
고객 노출: /community/talk · 자유게시판
내부 enum: STORY
주요 변경: board-registry slug/urlPrefix, board display name, 홈/글쓰기/agent 표시명 동기화
금지: D-day에 TALK enum 추가부터 시작하기
```

단, `STORY` 재사용을 "2파일만 바꾸면 끝"으로 오해하면 안 된다. 새 브랜드 신규 repo/DB 기준으로는
migration이 필요 없다는 뜻이고, 실제 제품에서는 홈 섹션, 글쓰기 보드, Sheet 탭명, agent 표시명,
알림/어드민 라벨까지 같은 이름으로 보이는지 최종 체크가 필요하다.

#### 봇 페르소나 정책 메모

현재 자산에는 이미 persona 데이터와 최근 댓글 반복 방지 로직이 있다. 그러나 그것은
"같은 문장 반복 방지"에 가깝고, 새 브랜드에 필요한 것은 **한 명의 실제 회원처럼 보이는 누적 정체성**이다.

D-day 최소 기준:

```
1. 페르소나별 고정 정체성: 나이대, 가족관계, 갱년기 단계, 관심사, 말투
2. 최근 댓글/게시글 기억: 같은 첫 문장·같은 결론·같은 자기소개 반복 금지
3. 갱년기 금지 발화: 의학 단정, 치료 강권, 약품 추천 금지
4. 노출 guard: 같은 화면/같은 글에서 같은 페르소나가 과하게 반복되지 않게 제한
5. 실회원 댓글 KPI 분리: 전체 댓글 수와 실회원 댓글 수를 별도 집계
```

이 정책의 목적은 봇을 숨기는 것이 아니라, 초기 커뮤니티가 비어 보이지 않게 하면서도
50대 여성 사용자가 "사람들이 실제로 이야기하고 있다"고 느끼는 맥락을 만드는 것이다.

#### M3-BOT-1 정정·보강 원칙 (2026-08-20)

Claude의 M3-BOT-1 감사 결과, 봇 자산은 초안에서 본 것보다 훨씬 강하다. 따라서 **전면 폐기/재작성**이 아니라
**자산은 KEEP, 노출 guard·기억·KPI·갱년기 안전 경로는 REWRITE**가 맞다.

확정된 AS-IS:

```
페르소나 원천      agents/seed/persona-data.ts 79명
성별              여성 79명
연령              50대 39명 · 60대 34명 · 45-49세 6명
board 분포         STORY 64 · HUMOR 7 · LIFE2 6 · JOB 2 · MENOPAUSE 0
기억              최근 자기 댓글 3건 + 같은 글 기존 댓글 기반 반복 방지
노출 guard         글당 최대 5개 중심. 사용자 목록 체감 단위 guard는 약함
KPI               일부 대시보드는 실회원 댓글 분리, 일일 KPI는 봇 댓글 포함 경로가 있음
```

중요 정정:

`agents/coo/author-reply-policy.ts`에는 갱년기 의료·성·정신건강 관련 금지 발화/ESCALATE 규칙이 있다.
하지만 이것은 **author reply 경로에 존재하는 안전 자산**이지,
`comment-activator.ts`·`generator.ts` 등 모든 봇 댓글 경로에 자동 적용된다는 뜻이 아니다.
새 브랜드에서는 이 안전 규칙을 **모든 MENOPAUSE 봇 댓글 경로의 공통 guard**로 올려야 한다.

D-day 확정 원칙:

```
1. 첫날 활성 페르소나는 30명으로 확정한다
2. 비중은 50대 19명 · 40대 후반 6명 · 60대 5명으로 확정한다
3. 갱년기 단계는 진행 중 40% · 완경 후 30% · 이전 20% · 미언급 10%로 나눈다
4. 갱년기 보드에도 봇 댓글을 허용한다
5. 글당 봇 댓글은 최대 2개로 시작한다
6. 최근 20개 글 기준 동일 페르소나 노출을 최대 2회로 제한한다
7. 게시 후 10~60분 지연 후 투입한다
8. 실회원 댓글이 붙은 글에는 추가 봇 투입을 멈춘다
9. 페르소나별 일일 노출은 최대 3회로 제한한다
10. 기억 조회는 최소 최근 10건까지 늘리되, DB migration이 필요한 장기 기억 모델은 D+30로 미룬다
11. 전체 댓글 수와 실회원 댓글 수를 반드시 분리 집계한다
```

단, 갱년기 봇 댓글 허용은 **의료·성·정신건강 안전 guard가 모든 MENOPAUSE 봇 댓글 경로에 적용되는 것**을 전제로 한다.
허용 여부는 확정됐지만, 구현 전에 어떤 경로가 MENOPAUSE 댓글을 생성하는지 확인해야 한다.

실회원 KPI는 아래 6개로 분리한다.

```
1. 전체 댓글 수
2. 실회원 댓글 수
3. 실회원 댓글 작성자 수
4. 실회원 재댓글률
5. 봇 댓글 후 실회원 댓글 전환율
6. 글별 첫 실회원 댓글까지 걸린 시간
```

가장 중요한 지표는 **5번, 봇 댓글 후 실회원 댓글 전환율**이다.
봇을 쓰는 유일한 이유는 커뮤니티가 비어 보이지 않게 하면서 실제 사람의 첫 반응을 끌어내는 것이다.
이 지표가 낮으면 봇은 마중물이 아니라 단순 위장 활성이다.

D+30 고도화:

```
PersonaMemory 모델 또는 동등한 저장 구조
사용자별 관계 기억
페르소나 자기 진술 일관성 검증
주제별 반응 이력
멘션/재방문 맥락 인지
```

아직 확정하지 않은 위험:

```
MENOPAUSE 봇 댓글이 실제로 어느 실행 경로에서 생성됐는지
그 경로에 author-reply-policy의 안전 규칙이 적용되는지
persona-data 79명과 DB 봇 계정 83개의 불일치 4명이 무엇인지
curator-personas / persona-matcher / reply-chain 경로가 새 브랜드 D-day에 필요한지
```

따라서 구현 전에 반드시 **MENOPAUSE 봇 댓글 생성 경로 read-only 감사**를 먼저 해야 한다.

#### M3-BOT-2 MENOPAUSE 봇 댓글 생성 경로 감사 (2026-08-20)

감사 결과, MENOPAUSE 봇 댓글 허용은 **조건부 구현 가능**이다. 조건은 단순하다.
`bot-engagement-policy.ts`에 MENOPAUSE를 추가하기 전에, 의료·성·정신건강 안전 guard를 공통화해야 한다.

핵심 발견:

```
bot-engagement-policy.ts    STORY · HUMOR · LIFE2만 허용
author-reply-policy.ts      STORY · LIFE2 · HUMOR · MENOPAUSE 허용 + 갱년기 안전 규칙 보유
guard 없는 경로             connection-facilitator · job-matcher · user-post-wave-processor
```

문제는 "MENOPAUSE가 막혀 있다"가 아니다.
**정책이 두 벌이고, safety guard가 일부 경로에만 있다**는 것이다.

특히 조심할 점:

```
bot-engagement-policy.ts 배열에 MENOPAUSE만 추가하면
현재 이 정책을 쓰는 seed/comment/wave 계열 여러 경로가 동시에 열린다.
그 경로들은 author-reply-policy의 갱년기 의료 safety guard를 자동으로 통과하지 않는다.
```

따라서 D-day 구현 순서는 아래처럼 고정한다.

```
1. author-reply-policy.ts의 갱년기 의료·성·정신건강 금지 정규식/판정 자산을 공용 guard로 분리한다
2. bot-engagement-policy.ts에 "보드 허용 + MENOPAUSE safety 검사"를 함께 수행하는 함수를 둔다
3. bot engagement를 생성하는 모든 경로가 이 함수를 통과하게 한다
4. guard 없는 경로 3개는 D-day에 끄거나 같은 guard에 편입한다
5. 그 다음에만 MENOPAUSE를 허용 목록에 추가한다
```

D-day에 반드시 막아야 할 발화:

```
의학 단정: "그거 갱년기예요", "호르몬 문제예요"
치료/검사 권유: "병원 가보세요", "검사 받아보세요", "치료받으세요"
약품/영양제 추천: "호르몬제", "영양제", "약", "보약" 권유
성/정신건강 민감 발화
불안 조장·공포 조장
```

추가 확인:

`agents/cafe/user-post-wave-processor.ts`는 현재 `post.title`, `post.content`, `post.status`만 조회하고
`boardType`을 보지 않는다. 따라서 이 경로는 MENOPAUSE 글인지 판정하지 못한다.
새 브랜드 D-day에는 이 경로를 그대로 열면 안 된다.

M3-BOT-2 이후 확정된 구현 원칙:

```
MENOPAUSE 봇 댓글 허용 자체는 확정
단, 배열 한 줄 추가 금지
공통 safety guard 선행
guard 없는 경로는 차단 또는 편입
migration 불필요
PersonaMemory는 D+30
```

#### M3-BOT-3 공통 MENOPAUSE safety guard 구현 설계 (2026-08-20)

Claude의 M3-BOT-3 감사 결과, 설계는 확정 가능하다. 이후 BotLog/Post/Comment read-only 대조로
MENOPAUSE 봇 댓글 생성 출처도 추가 확인했다.

중요 정정:

```
이전 판단: seed/scheduler.ts는 guard가 적용되어 있다
정정 판단: seed/scheduler.ts의 runActivity 일부만 보호된다

보호되는 create: seed/scheduler.ts L378 · L408
무방비 create:   seed/scheduler.ts L651 · L973 · L1196
추가 무방비:     cafe/user-post-wave-processor.ts L148
```

#### M3-BOT-3 후속 출처 대조 결과 (2026-08-20)

후속 대조 결과, 앞선 가설 일부는 정정한다.
`processSheetEngagementWaves()`는 실제 출처 중 하나였지만, **기존 guard가 뚫린 것은 아니다.**
과거 MENOPAUSE 봇 댓글 다수는 글이 STORY/LIFE2였을 때 정상 생성된 뒤,
나중에 글이 MENOPAUSE로 이관되면서 "MENOPAUSE 봇 댓글"처럼 보인 것이다.

실측 결론:

```
MENOPAUSE 봇 댓글      487건
비봇 댓글              31건
봇 비율                94.0%
대상 글                98개 / 전체 MENOPAUSE 141개
봇 계정                76개
기간                   2026-04-06 ~ 2026-08-14
마지막 MENOPAUSE 봇 댓글 2026-08-14T04:03Z
글 이관 집중            2026-08-18 ~ 2026-08-20
```

출처 귀속:

| 건수 | 귀속 | 판정 |
|---:|---|---|
| 169 | `SHEET_ENGAGE_COMMENT_PENDING` → `seed/scheduler.ts:973` | 확정 |
| 118 | `SHEET_COMMENT_WAVE_PENDING` + `SHEET_LIKE_WAVE_PENDING` → `seed/scheduler.ts:1196` | 확정 |
| 175 | `WAVE_PROCESS_V2` → `cafe/wave-processor.ts:592` | 확정. 단, 이관 전 정상 생성분 |
| 25 | USER 글 5개 × 정확히 5건 | 확정. `user-post-wave-processor.ts:148` |
| 0 | `KILLER_COMMENT_WAVE_PENDING` → `seed/scheduler.ts:651` | 미도달 확정 |
| 0 | `AUTHOR_REPLY_WRITE` 중 MENOPAUSE | 미관여 확정 |

중요한 운영 해석:

```
1. wave-processor.ts guard는 실제로 작동했다.
2. 2026-08-18~19 MENOPAUSE 대상 CommentWaveQueue 4건은 done 처리 후 댓글 0건이었다.
3. 따라서 "guard가 뚫렸다"가 아니라 "SHEET 계열 scheduler 경로에는 아직 guard가 없다"가 정확한 문제다.
4. scheduler.ts L973/L1196은 현재 MENOPAUSE 입력이 없어 조용할 뿐, D-day에 갱년기 SHEET 발행이 늘면 바로 열린다.
5. Comment에는 생성 경로 필드가 없어, 사후 귀속은 BotLog.details의 postId 대조로만 가능하다.
```

M3-BOT-3b 후속 확정:

```
USER 글 25건의 출처는 user-post-wave-processor.ts로 확정

근거:
- 코드 설계값: wave1 +1분 · wave2 +10분 · wave3 +20분 · wave4 +45분 · wave5 +60분
- 실측 MENOPAUSE USER 글 5개가 모두 5건씩, 위 wave 간격과 일치
- UserPostWaveQueue 소비자는 agents/cafe/user-post-wave-processor.ts
- BotLog action은 USER_POST_WAVE
```

생산자 경로:

| 생산자 | 트리거 | boardType 인지 | MENOPAUSE 적재 | 판단 |
|---|---|---|---|---|
| `src/lib/actions/wave-queue.ts` | 공용 enqueue 함수 | postId/authorId만 받음 | 가능 | 활성 |
| `src/lib/actions/posts.ts` | 회원 글 작성 직후 | `boardType` 변수가 있으나 조건에 안 씀 | 가능 | 주경로 |
| `src/app/api/internal/user-post-wave/route.ts` | 내부 API | body가 postId/authorId뿐 | 가능 | 코드 내 호출부 0, 외부 호출 여부 미확정 |
| `greeting.ts` 호출부 | 신규 가입 환대 글 | 환대 글 보드에 종속 | 가능성 있음 | 환대 글 boardType 별도 확인 필요 |

운영 판단:

```
1. 이 경로는 끄지 않는다. 실회원 글에 봇이 반응하는 유일한 경로라 North Star와 직결된다.
2. 생산자 3곳을 각각 고치지 않는다. 누락과 정책 분산이 생긴다.
3. 소비자 단일 지점인 user-post-wave-processor.ts에서 boardType select + checkBotComment()를 적용한다.
4. MENOPAUSE 글당 최대 2개 정책도 소비자에서 waveNum >= 3 skip으로 처리한다.
5. comment-activator.ts의 MAX_BOT_COMMENTS_PER_POST는 이 경로와 무관하다.
6. USER_POST_WAVE BotLog details에는 D-day에 postId, boardType, skipReason을 기록한다. migration 없이 가능하다.
```

권장 아키텍처:

```
agents/core/bot-engagement-policy.ts   기존 유지. 보드 허용 SSoT
agents/core/menopause-speech-rules.ts  신설. 갱년기 의료·성·정신건강 정규식 SSoT
agents/core/bot-comment-guard.ts       신설. 보드 허용 + 댓글 본문 안전 검사를 묶는 유일한 호출 진입점
```

핵심 원칙:

```
1. 호출부가 직접 부를 함수는 checkBotComment() 하나뿐이다
2. boardType을 모르면 차단한다 (fail-closed, BOARD_TYPE_UNKNOWN)
3. author-reply-policy.ts의 검증된 정규식은 "개선"하지 않고 그대로 이동한다
4. MENOPAUSE 의료·성·정신건강 규칙은 MENOPAUSE 보드에만 적용한다
5. STORY/HUMOR/LIFE2 기존 댓글 동작은 회귀 없이 유지한다
6. action은 D-day에 allow/skip만 쓴다. log_only나 severity 중간 단계는 두지 않는다
7. `BOT_ENGAGEMENT_BOARD_TYPES`에 MENOPAUSE를 추가하는 것은 마지막 단계다
```

제안 함수 계약:

```ts
checkBotComment({
  boardType: string | null | undefined,
  generatedComment: string,
  postTitle?: string,
  sourcePath: string,
  personaId?: string,
}) => {
  ok: boolean,
  action: 'allow' | 'skip' | 'escalate',
  reason:
    | 'BOARD_ENGAGEMENT_DISABLED'
    | 'BOARD_TYPE_UNKNOWN'
    | 'MENOPAUSE_MEDICAL_ADVICE'
    | 'MENOPAUSE_SEXUAL_CONTENT'
    | 'MENOPAUSE_MENTAL_HEALTH_CRISIS'
    | null,
  logDetail: string,
}
```

경로별 D-day 배선 판단:

| 경로 | 판단 | 이유 |
|---|---|---|
| `seed/scheduler.ts` runActivity | 기존 guard를 `checkBotComment()`로 교체 | boardType은 있으나 본문 safety가 없다 |
| `seed/scheduler.ts` L973 · L1196 | boardType select 추가 후 create 직전 guard 필수 | 실제 287건 귀속. 새 브랜드 SHEET 발행 주력 경로라 D-day 최고 위험 |
| `seed/scheduler.ts` L651 | D+30로 강등 | `KILLER_COMMENT_WAVE_PENDING`의 MENOPAUSE 도달 0건 확인 |
| `cafe/user-post-wave-processor.ts` | boardType select 추가 후 guard 필수. MENOPAUSE는 waveNum >= 3 skip | 실회원 글 반응 경로라 끄면 안 된다. USER 글 25건 출처로 확정 |
| `seed/micro-scheduler.ts` | 기존 guard 교체 | 기존 보드 검사는 있으나 본문 safety 없음 |
| `seed/controversy-chain.ts` | 기존 guard 교체 | 기존 보드 검사는 있으나 본문 safety 없음 |
| `coo/comment-activator.ts` | 기존 guard 교체 | 기존 보드 검사는 있으나 본문 safety 없음 |
| `coo/reply-chain-driver.ts` | 기존 guard 교체 | 기존 보드 검사는 있으나 본문 safety 없음 |
| `cafe/wave-processor.ts` | 기존 guard 교체 | 기존 보드 검사는 있으나 본문 safety 없음 |
| `coo/author-reply-driver.ts` | write 직전 공통 guard 편입 | author reply safety와 보드 정책을 두 벌로 두지 않는다 |
| `coo/connection-facilitator.ts` | D-day 현행 유지 | STORY 하드코딩. MENOPAUSE 도달 불가 |
| `coo/job-matcher.ts` | D-day 현행 유지 | JOB/STORY 하드코딩. MENOPAUSE 도달 불가 |

D-day 구현 순서:

```
1. menopause-speech-rules.ts 신설
2. author-reply-policy.ts가 새 공용 rules를 import하게 변경
3. bot-comment-guard.ts 신설
4. 단위 테스트 작성. 이 시점에는 MENOPAUSE가 아직 차단되는 것이 정상
5. seed/scheduler.ts L973 · L1196에 boardType select + guard 배선
6. user-post-wave-processor.ts에 boardType select + guard 배선 + MENOPAUSE waveNum >= 3 skip
7. 나머지 기존 guard 경로를 checkBotComment()로 교체
8. author-reply-policy.ts의 별도 보드 허용 정책을 공용 guard로 수렴
9. npx tsc --noEmit 및 npx tsc -p tsconfig.ops.json --noEmit
10. 그 다음에만 BOT_ENGAGEMENT_BOARD_TYPES에 MENOPAUSE 추가
11. dry-run으로 BOARD_TYPE_UNKNOWN 0건, MENOPAUSE_* skip 발생 여부 확인
12. 첫 세트 30명과 글당 최대 2개 정책 적용
```

주의: `cafe/wave-processor.ts`는 기존 배선이 실전에서 skip을 증명했다.
새 guard도 이 패턴을 유지해야 한다. 단순 `continue`로 빠지면 큐가 영원히 재시도될 수 있다.

주의: `user-post-wave-processor.ts`도 skip 시 큐가 계속 재시도되지 않도록 wave 처리 상태와 로그를 함께 설계해야 한다.

테스트/재발 방지:

```
src/__tests__/bot-comment-guard.test.ts
  - MENOPAUSE 의료 단정, 약/영양제 추천, 병원/검사 권유, 성, 정신건강 위기 차단
  - 순수 공감/감정 반응 허용
  - STORY/HUMOR/LIFE2 기존 동작 보존
  - null/undefined/빈 boardType fail-closed

src/__tests__/menopause-speech-rules-parity.test.ts
  - author-reply-policy.ts의 기존 safety 판정과 공용 rules 판정 동등성 고정

scripts/check-bot-comment-guard.ts
  - agents/**의 prisma.comment.create를 찾아 같은 함수 스코프에 checkBotComment가 없으면 실패
```

창업자 확정:

```
MENOPAUSE 실회원 글에 대한 user-post-wave 댓글 수는 D-day에도 글당 최대 2개로 간다.

이 결정의 목적은 갱년기 보드를 비어 보이지 않게 만드는 것이다.
단, AI 티를 줄이기 위해 2개 허용은 아래 조건을 전제로 한다.

1. 공통 checkBotComment() safety guard 선행
2. 의료·성·정신건강 위험 발화 차단
3. 같은 글에 같은 톤/같은 결론 반복 금지
4. 실회원 댓글이 붙으면 추가 봇 중단
5. 최근 20글 기준 동일 페르소나 노출 최대 2회
```

지금 하면 안 되는 것:

```
BOT_ENGAGEMENT_BOARD_TYPES에 MENOPAUSE만 추가
댓글 생성 경로 일부만 수정
boardType 없이 user-post-wave-processor 유지
guard 없이 페르소나 30명 확장
DB migration부터 시작
author-reply-policy.ts의 정규식 수정
author-reply-policy.test.ts 수정
connection-facilitator/job-matcher 겸사겸사 수정
AUTHOR_REPLY_MODE write 전환
```

#### M3-BOT-4 첫 세트 30명 페르소나 설계 (2026-08-20)

Claude의 read-only 감사 결과, **신규 페르소나 대량 창작은 불필요**하다.
`agents/seed/persona-data.ts`에 이미 깊은 필드를 가진 여성 페르소나 79명이 있고,
새 브랜드 첫날에 필요한 30명 중 29명은 기존 자산으로 즉시 선별 가능하다.

자산 판정:

```
전체 79명
남성 0명
45세 미만 0명
70세 이상 0명

45~49세    6명   목표 7명 대비 1명 부족
50~59세   39명   목표 18명 대비 충분
60~69세   34명   목표 5명 대비 충분
```

사용 자산 기준:

| 자산 | 규모 | 판단 |
|---|---:|---|
| `persona-data.ts` | 79명 | 1차 선별 대상. nickname, age, gender, personality, style, topics, speech_patterns, mood, quirks, never, examples 보유 |
| `curator-personas.ts` | 225명 | 보조 자산. 나이·가족·never가 없어 첫 30명 핵심 세트로는 부적합 |
| `curator-persona-meta.ts` | 40명 override | 보조 |
| `persona-registry.ts` | 304명 통합 | 소비 경로. bot/curator 네임스페이스 혼동 주의 |

주의: bot `E`와 curator `E`는 같은 사람이 아니다. 첫 30명 선별은 **bot 네임스페이스만** 사용한다.

이미 갱년기 배정이 끝난 깊은 bot 8명:

```
X  걱정인형
AM 불안한밤
AH 피곤해요
BF 속터지는현실
AJ 가족곁에서
H  매일걷기
AN 약국단골
AL 헬스덕후
```

단, `AN 약국단골`과 `AL 헬스덕후`는 D-day MENOPAUSE 배정에서 빼는 것이 맞다.
`AN`은 제품·영양제·가격 비교 톤이라 의료 guard와 충돌하고,
`AL`은 운동 권유 톤이라 갱년기 피로 글에서 사용자 경험을 해칠 위험이 크다.

첫 30명 운영 권고:

```
창업자 확정안:
50대 19명 · 40대 후반 6명 · 60대 5명

이유:
- 40대 후반 기존 자산이 6명뿐이라 목표 7명 충족을 위해 새 창작이 필요하다.
- D-day 목적은 완벽한 인구 비율이 아니라 24시간 안에 검증된 자산으로 여는 것이다.
- 핵심 타겟 1순위가 50대 여성이므로 50대 1명 증가는 제품 방향과도 맞다.
```

50대 핵심 후보:

| ID | 닉네임 | 나이 | 역할 |
|---|---|---:|---|
| AH | 피곤해요 | 55 | 피로·수면 하소연 |
| BF | 속터지는현실 | 57 | 감정 기복·가족 현실 |
| AJ | 가족곁에서 | 57 | 간병·가족 관계 |
| E | 미숙이맘 | 52 | 경험 공감 |
| AE | 새벽감성 | 52 | 불면·정서 동조 |
| AK | 엄마뭐해요 | 54 | 딸·가족 관계 |
| P | 오후햇살 | 55 | 잔잔한 정서 공감 |
| AQ | 조용한수다 | 59 | 짧은 지지 |
| Z | 혼자잘산다 | 54 | 혼자 사는 현실·자조 유머 |
| AV | 혼밥일기 | 56 | 생활형 공감 |
| K | 예쁘게살자 | 56 | 자기관리·전환 |
| BC | 억울한아내 | 59 | 부부 하소연 |
| AG | 비교분석왕 | 57 | 비의료 정보 정리 |
| BN | 위로천사 | 56 | 위로 |
| BK | 공감백퍼 | 52 | 짧은 즉각 공감 |
| BR | 응원언니 | 51 | 응원 |
| BQ | 조심스런댁 | 59 | 신중한 동조 |
| BW | 감성파 | 58 | 감성 반응 |
| 보강 1명 | 50대 기존 후보 중 추가 선별 | 50대 | 40대 후반 결손 보완 |

40대 후반 후보:

| ID | 닉네임 | 나이 | 역할 |
|---|---|---:|---|
| O | 올드팝 | 48 | 전조·취향 공유 |
| W | 참나진짜 | 48 | 직설 반응 |
| Y | 솔직히말해서 | 49 | 솔직한 동조 |
| AB | 따져보자 | 49 | 비의료 팩트체크 |
| AZ | 돈공부중 | 47 | 돈·현실 이야기 |
| BA | 은퇴준비중 | 48 | 노후·가족 불안 |

60대 후보:

| ID | 닉네임 | 나이 | 역할 |
|---|---|---:|---|
| X | 걱정인형 | 62 | 완경 후 불안 |
| AM | 불안한밤 | 62 | 불면·몸 변화 |
| BT | 나도그랬어 | 60 | 경험 기반 공감 |
| BU | 느린공감 | 63 | 느린 호흡의 정서 지지 |
| AC | 느긋이 | 63 | 가족 관계·생활형 공감 |

말투 분산 원칙:

```
1. 불안·질문형: X, AM, AE, BQ
2. 하소연·동반형: AH, BF, BC, AJ, Z
3. 위로·응원형: E, BN, BK, BR, BT, BU
4. 정리·전환형: AG, K, AV, AB, AC

MENOPAUSE 실회원 글에는 서로 다른 계열에서 최대 2명만 붙인다.
권장 조합은 위로·응원형 1명 + 불안·질문형 또는 하소연·동반형 1명이다.
정리·전환형 2명이 동시에 붙으면 조언처럼 보여 금지한다.
```

D-day 보강 필드 설계:

```
menopauseStage?: 'pre' | 'early' | 'active' | 'post' | 'none'
family?: { spouse: boolean; children?: string; inLaws?: boolean; grandchildren?: boolean }
commentLength?: 'short' | 'medium' | 'long'
memoryAnchors?: string[]
```

이 필드들은 모두 선택 필드로 추가해야 한다. DB migration은 하지 않는다.
D-day에는 실제 장기 기억 모델이 아니라 `memoryAnchors` 상수로 "그 사람다움"을 먼저 만든다.
`PersonaMemory` 같은 실제 이력 기반 기억은 D+30 이후 과제다.

M3-BOT-4 구현 전제:

```
1. M3-BOT-3의 common safety guard가 먼저 들어가야 한다.
2. scheduler.ts L973/L1196과 user-post-wave-processor.ts가 guard에 편입되어야 한다.
3. 그 다음에만 첫 30명 MENOPAUSE 배정과 봇 댓글 허용을 켠다.
4. guard 없이 30명을 투입하면 위험 노출량만 커진다.
```

지금 하면 안 되는 것:

```
페르소나 30명을 새로 창작
curator 225명에서 첫 30명 선별
bot/curator 같은 ID를 같은 인물로 취급
AN 약국단골·AL 헬스덕후를 MENOPAUSE에 유지
Persona 필드를 필수값으로 추가
PersonaMemory migration부터 시작
guard 없이 MENOPAUSE 봇 허용
```

---

#### M3-BOT-5 봇 노출 guard 설계 (2026-08-20)

> **판정: PARTIAL — D-day 구현 가능.** 6개 guard 중 4개는 이미 구현돼 있고 값만 다르다.
> 진짜 신규는 `screen_exposure`·`human_present` 2개뿐이다.
>
> M3-BOT-3이 **안전**(의료·성·정신건강 발화)을 다뤘다면, M3-BOT-5는 **노출·반복·타이밍**을 다룬다.
> 둘은 역할이 다르며 서로를 대체하지 않는다.

##### 문제 정의 — "봇이 많다"가 문제가 아니다

창업자 확정대로 **전체 봇 댓글 비율 상한은 두지 않는다.** 진짜 문제는 4가지다.

| # | 문제 | 증상 | 현재 상태 |
|---|---|---|---|
| 1 | **밀도(density)** | 한 글에 10~12개가 몰려 "이 글만 이상하게 활발"해진다 | 🟡 상한은 있으나 값이 크다 |
| 2 | **편재(ubiquity)** | 목록 한 화면에 같은 닉네임이 3~4번 보인다 | 🔴 **완전 무방비** |
| 3 | **규칙성(regularity)** | 모든 글이 `+5/+14/+24/+49/+60분` 동일 리듬 | 🔴 고정값 |
| 4 | **실회원 무시(disregard)** | 사람이 댓글을 달았는데 봇이 자기 스케줄대로 계속 붙는다 | 🔴 **완전 무방비** |

⚠️ **문제 2와 4가 "AI 운영처럼 보인다"의 핵심이다.** 1·3은 값 조정으로 풀리지만 2·4는 신규 구현이 필요하다.

##### 기존 구현 중 재사용 가능한 자산 (실측)

새로 만들 필요가 없는 것들이다. 이미 검증되어 운영 중이다.

| 자산 | 위치 | 현재 값 | D-day 조치 |
|---|---|---|---|
| KST 날짜 경계 | `wave-processor.ts:105` `startOfKstDay()` | ✅ UTC 아님 | 그대로 재사용 |
| 페르소나 일일 cap | `wave-processor.ts:99` `BOT_DAILY_COMMENT_CAP` | **20** | **값만 3으로** |
| 일일 집계 방식 | `wave-processor.ts:539` `Comment.groupBy` | ✅ | 그대로 |
| 같은 페르소나 중복 금지 | `user-post-wave-processor.ts:105-136` | ✅ | 그대로 |
| 표현·내용 중복 방지 | `user-post-wave:114` · `wave-processor:560` | ✅ | 그대로 |
| skip 사유 기록 | `wave-processor.ts:645` `skippedReasons[]` | ✅ | 확장 |
| **영구 skip 방지 패턴** | `wave-processor.ts:621-629` | ✅ `bot_cap`은 20분 뒤 재시도, `expiresAt` 넘으면 중단 | **이 패턴을 표준으로 삼는다** |
| **실회원 판정 SSoT** | `notify-author.ts:4` `isRealUser()` | ✅ `providerId` 순수 숫자 | 그대로 재사용 |
| 시작 시각 jitter | `comment-activator.ts:26` 0~3분 랜덤 | ✅ | 참고 |

⚠️ **실회원 판정에 `@unao.bot` 이메일을 쓰면 안 된다.** `isRealUser(providerId)`가 SSoT이며, 이메일 기준은 게스트 댓글을 놓친다.

##### 신규로 필요한 guard 2개

```
G5 screen_exposure   최근 20개 글 기준 동일 페르소나 최대 2회
                     → 현재 이런 조회 자체가 코드에 없다. 문제 2의 유일한 해법
G7 human_present     사람 댓글이 있으면 추가 봇 wave 중단
                     → 현재 existingComments를 조회하지만 "중복 회피"용이지 중단 판단이 아니다
```

##### 최종 guard 정책표

| # | guard | 목적 | 데이터 | skip 조건 | BotLog reason | retryable | D-day |
|---|---|---|---|---|---|---|---|
| G1 | `post_cap` | 글당 봇 댓글 2개 | `Comment.count(postId, bot)` | 봇댓글 ≥2 | `post_cap_reached` | ❌ | 필수 |
| G2 | `persona_dup` | 같은 페르소나 재등장 금지 | 기존 댓글 authorId | 이미 등장 | `persona_already_on_post` | ❌ | 재사용 |
| G3 | `tone_family_dup` | 같은 톤 계열 2명 금지 | personaId → 계열 | 동일 계열 존재 | `tone_family_conflict` | ❌ | 필수 |
| G4 | `advice_tone_solo` | 정리/조언형 2명 금지 | 계열④ 카운트 | ④ 이미 1명 | `advice_tone_limit` | ❌ | 필수 |
| G5 | `screen_exposure` | 최근 20글 중 최대 2회 | 최근 20 post의 봇댓글 authorId | 해당 페르소나 ≥2 | `screen_exposure_cap` | ✅ | **신규** |
| G6 | `persona_day_cap` | 페르소나 하루 3회 | `Comment.groupBy` + KST | ≥3 | `persona_daily_cap` | ✅ | 값만 20→3 |
| G7 | `human_present` | 사람 댓글 시 중단 | `providerId` · `guestNickname` | 사람 댓글 ≥1 | `human_comment_present` | ❌ | **신규** |
| G8 | `delay_jitter` | 10~60분 + 흔들기 | postId 해시 | — | — | — | 필수 |

**권장 조합(G3·G4 통과 기준)**: 위로/응원형 1명 + 불안·질문형 **또는** 하소연·동반형 1명.
정리/조언형 2명이 동시에 붙으면 조언처럼 읽혀 커뮤니티 톤이 무너진다.

##### 창업자 확정 사항 (2026-08-20)

**① 게스트 댓글도 사람 댓글로 본다** ✅

```
사람 댓글 판정 =
  ( author.providerId가 순수 숫자  OR  guestNickname != null )
  AND status = 'ACTIVE'

→ 사람이 말을 걸었으면 봇은 물러난다. 이후 wave 전체 중단.
→ 봇 댓글 뒤에 사람 댓글이 붙은 경우에도 그 시점부터 중단한다.
```

**② strict exposure guard는 MENOPAUSE부터 적용한다** ✅

```
구현    공통 함수 checkBotExposure() 하나로 설계한다 (경로별 제각각 금지)
첫 적용 M3 MENOPAUSE 보드에만
기존 보드 STORY/HUMOR/LIFE2는 현행 유지 — D+30 또는 운영 안정 후 확대 검토

이유: 네이버 색인 0 상황에서 기존 서비스 활성감까지 흔들면 변수가 겹친다.
      기존 보드 globalCap 10~20을 2로 낮추면 댓글 수가 급감한다.
```

**③ author-reply는 글당 2개 제한과 별도 집계한다** ✅

```
포함 안 함  글쓴이가 자기 글 댓글에 답하는 것은 대화의 자연스러운 일부다
            (AUTHOR_REPLY_WRITE 60건 가동 중, 2026-07-22~08-19)
통과 필수    safety guard(checkBotComment) + exposure guard(checkBotExposure) 둘 다
skip 조건    대화를 방해하거나 반복 노출되면 skip한다
            → G5(screen_exposure) · G6(persona_day_cap)은 author-reply에도 적용
            → G1(post_cap)만 별도 집계 대상
```

##### 코드 적용 지점

```
agents/core/
  bot-comment-guard.ts     M3-BOT-3에서 신설
    checkBotComment()        보드 + 의료 발화   [safety · 순수 함수 · DB 불필요]
    checkBotExposure()       ★ M3-BOT-5 추가    [exposure · DB 조회 필요]
  tone-family.ts           ★ 신설 — 30명을 4계열로 매핑하는 순수 상수
```

⚠️ **두 함수를 한 파일에 두되 분리한다.** safety는 순수 함수라 단위 테스트가 가볍고,
exposure는 DB 의존이다. 합치면 safety 테스트에 DB mock이 필요해진다.
같은 파일에 두는 이유는 호출부가 하나만 부르고 나머지를 빠뜨리는 사고를 막기 위해서다.

**`retryable` 구분이 핵심이다.** 기존 `bot_cap` 재시도 패턴(`wave-processor.ts:621-629`)을 따른다.

```
retryable=true   persona_daily_cap · screen_exposure_cap  → 큐 waveAt 20분 미룸
retryable=false  post_cap · human_present · tone_conflict  → 큐 done 마킹
                 (단순 continue는 큐가 영원히 재시도된다)
```

**migration 불필요.** 전부 상수·함수·조회이며 스키마 무변경이다.
`wave3At`·`wave4At`은 필수 필드라 값은 넣되 **소비 단계에서 skip**한다(M3-BOT-3b 결론과 동일).

⚠️ **현재 `wave1At = +1분`은 확정 정책(10~60분 지연)과 정면 충돌한다.**
실측에서도 첫 댓글이 4~5분 만에 달렸다. `src/lib/actions/wave-queue.ts:11`에서 조정해야 한다.

##### D-day 구현 순서 (M3-BOT-3과 통합)

```
[안전이 먼저 — M3-BOT-3 1~9단계 완료가 절대 선행]
 1~9   menopause-speech-rules · bot-comment-guard(safety) · scheduler L973/L1196 배선
       user-post-wave 배선 · 나머지 8경로 guard 교체 · ELIGIBLE_BOARDS 수렴 · tsc

[M3-BOT-5 시작]
 10   tone-family.ts 신설 — 30명을 4계열로 매핑 (순수 상수)
 11   checkBotExposure() 신설 — G1~G7. 이 시점엔 호출부 없음
 12   단위 테스트 — 호출 전에 로직부터 고정
 13   wave-processor에 배선 ← 자산이 가장 많고 skip/retry 패턴이 이미 있어 회귀가 적다
      · BOT_DAILY_COMMENT_CAP 20 → 3
      · getGlobalCap에 MENOPAUSE=2
 14   user-post-wave-processor 배선 + MENOPAUSE wave3~5 skip
 15   comment-activator 배선 (MAX_BOT_COMMENTS_PER_POST 폐기)
 16   scheduler 3경로 · micro-scheduler · controversy-chain · reply-chain · author-reply 배선
 17   wave-queue.ts jitter (G8) — 생산 시점 변경이라 마지막
 18   dry-run 관찰
 19   ★ MENOPAUSE 배열 추가 ★   ← M3-BOT-3의 10단계가 여기로 밀린다
 20   페르소나 30명 활성화
```

⚠️ **M3-BOT-3에서 "10번째"였던 배열 추가가 19번째로 밀린다.**
노출 guard 없이 MENOPAUSE를 열면 글당 10개가 붙어 첫인상이 무너진다.

**13번(wave-processor)을 먼저 하는 이유**: `skips[]`·retry·KST cap·BotLog details가 전부 이미 있다.
여기서 패턴을 확정한 뒤 나머지에 복제하면 설계 오류가 한 번만 발생한다.
**17번(jitter)을 마지막에 두는 이유**: 생산 시점을 바꾸면 기존 큐와 신규 큐가 섞여 관찰이 어렵다.

##### 테스트·재발 방지

```
단위    src/__tests__/bot-exposure-guard.test.ts (신설)
        G1~G7 각각 · KST 날짜 경계(오늘 3건 skip / 어제 3건 allow)
        fail-closed: boardType null → skip / post not found → skip(terminal)
                     댓글 조회 throw → skip(retryable)
        회귀: STORY/HUMOR/LIFE2 기존 동작 보존

정적    scripts/check-bot-comment-guard.ts (신설, CI 등록)
        agents/**의 prisma.comment.create를 전부 찾아
        같은 스코프에 checkBotComment + checkBotExposure 둘 다 있는지 확인
        → "새 경로 추가하고 guard 빠뜨리는" 구조적 재발을 막는다

dry-run PASS 조건
        BOARD_TYPE_UNKNOWN 0건 · post_cap_reached 1건 이상
        human_comment_present 관측 · 기존 보드 댓글 수 전일 ±10%

로그    BotLog.details에 { postId, boardType, personaId, toneFamily, skipReason, retryable }
        ⚠️ 현재 USER_POST_WAVE 로그는 {processed, failed}만 남겨 사후 추적이 불가능하다
```

##### 하면 안 되는 것

```
MAX_BOT_COMMENTS_PER_POST만 5→2로 낮추기   comment-activator 전용. 나머지 2벌이 남는다
MENOPAUSE 배열만 추가                       노출 guard 없이 열면 글당 10개가 붙는다 (19단계)
producer마다 제각각 제한 넣기               이미 3벌(5/10~20/5)이고 그게 문제의 원인이다
BotLog 없이 skip                            M3-BOT-3b 출처 확정이 어려웠던 직접 원인
실회원 감지 없이 wave 유지                  문제 4. AI 운영처럼 보이는 가장 직접적 원인
@unao.bot 이메일로 실회원 판정              isRealUser(providerId)가 SSoT. 게스트를 놓친다
BOT_DAILY_COMMENT_CAP 20 유지               확정값은 3이다
wave1At = +1분 유지                         확정값은 10~60분이다
safety와 exposure를 한 함수로 합치기        safety 단위 테스트가 무거워진다
screen_exposure를 terminal skip으로 처리    시간이 지나면 해소된다. retryable=true여야 한다
기존 보드에 strict guard 동시 적용           창업자 확정: MENOPAUSE 우선, 기존 보드는 D+30
migration부터 시작                          D-day 항목은 전부 migration 불필요
```

##### M3-BOT-6으로 넘길 구현 체크리스트 (초안)

```
[ ] 1. tone-family.ts — M3-BOT-4의 30명 → 4계열 매핑 확정
       ⚠️ 계열 매핑은 Claude 설계안이며 Codex Master 검증 미완
[ ] 2. checkBotExposure() 시그니처 확정 (retryable 포함)
[ ] 3. bot-exposure-guard.test.ts 케이스 작성
[ ] 4. wave-processor 배선 + cap 20→3 + MENOPAUSE globalCap=2
[ ] 5. user-post-wave-processor 배선 + wave3~5 skip
[ ] 6. comment-activator 배선 + MAX_BOT_COMMENTS_PER_POST 폐기
[ ] 7. scheduler 3경로 + 나머지 4경로 배선
[ ] 8. author-reply 별도 집계 분기 (G1 제외 / G5·G6 적용)
[ ] 9. wave-queue.ts jitter
[ ] 10. check-bot-comment-guard.ts + CI 등록
[ ] 11. BotLog details 확장
[ ] 12. dry-run 관찰 → 배열 추가 → 페르소나 30명
```

##### 아직 미확정 (추정하지 않음)

| 항목 | 왜 미확정인가 | 확인 방법 |
|---|---|---|
| tone family 4계열 매핑 | M3-BOT-4의 Claude 설계안. Codex Master 검증 미완 | M3-BOT-6 착수 전 검증 |
| ~~"최근 20개 글"의 범위~~ | ✅ **M3-BOT-6에서 확정 — MENOPAUSE 보드 기준 20개** | 해소됨 |
| `screen_exposure` 조회 비용 | 매 create마다 최근 20글 조회 시 부하 미실측 | 13단계에서 EXPLAIN |
| ~~MENOPAUSE wave3~5 skip 시 큐 처리~~ | ✅ **M3-BOT-6에서 확정 — done 마킹** (§큐 처리 정책) | 해소됨 |
| ~~기존 globalCap 10~20의 근거~~ | ✅ **M3-BOT-6에서 실측 — `constitution.yaml:351` `bot_comment_cap_per_post: 5`(2026-05-12 창업자 승인). wave/tier cap 조항은 없으며, 코드가 헌법값을 초과해 독자 운영 중이다.** D-day에는 건드리지 않는다(D+30 과제) | 해소됨 |

---

#### M3-BOT-6 D-day 봇 구현 체크리스트 (2026-08-20)

> **판정: PARTIAL — D-day 구현 가능.**
> **한 줄 결론: 신규 파일 7개 + 기존 파일 13개 수정으로 24시간 내 구현 가능하며(예상 20h),
> `MENOPAUSE` 배열 추가는 22단계 중 20번째다.**
>
> 이 절은 M3-BOT-3(safety) · M3-BOT-4(페르소나) · M3-BOT-5(exposure)를 하나의 실행 순서표로 통합한 것이다.
> 앞선 절들과 충돌하는 내용은 없으며, 단계 번호만 통합 기준으로 재부여했다.

##### 🔴 Blocker 1건 — 3개 경로가 BotLog를 남기지 않는다

```
botLog 기록 실태 (2026-08-20 실측)
  scheduler.ts              create 0 · update 6      ✅ 기존 wave row를 update
  micro-scheduler.ts        create 1                 ✅
  wave-processor.ts         create 3                 ✅
  user-post-wave.ts         create 1                 🟡 {processed,failed}만 — postId 없음
  author-reply-driver.ts    create 5                 ✅
  ────────────────────────────────────────────────
  comment-activator.ts      create 0 · update 0      🔴 기록 없음
  reply-chain-driver.ts     create 0 · update 0      🔴 기록 없음
  controversy-chain.ts      create 0 (findMany만)    🔴 기록 없음
```

이 3개 경로는 **guard가 skip해도 그 사실이 어디에도 남지 않는다.** dry-run 관찰이 불가능해지고,
M3-BOT-3b에서 468건 출처 확정에 애먹은 상황이 그대로 재현된다.

⚠️ **blocker이지 중단 사유는 아니다.** 구현 순서 15단계에 BotLog 배선을 넣으면 해소된다.

⚠️ `comment-activator`·`reply-chain-driver`는 action 상수(`COMMENT_ACTIVATE`·`REPLY_CHAIN_DRIVE`)가
코드에 이미 있으나 `botLog.create` 호출이 0건이다. **상수만 있고 기록은 안 하는 상태**다.

##### 창업자 확정 사항 (2026-08-20)

**① `screen_exposure`의 "최근 20개 글" = MENOPAUSE 보드 기준 20개** ✅

```
고객이 실제로 보는 목록 화면이 보드별이기 때문이다.
D-day에 strict exposure guard를 MENOPAUSE에만 적용하므로 전체 보드 기준은 의미가 흐려진다.
→ G5 조회 조건: Post.boardType='MENOPAUSE' ORDER BY createdAt DESC LIMIT 20
```

**② constitution 불일치는 D-day에 건드리지 않는다** ✅

```
발견   constitution.yaml:351  bot_comment_cap_per_post: 5  (2026-05-12 창업자 승인)
       wave-processor.ts:112  globalCap  KILLER 20 / HOT 14 / NORMAL 10
       → constitution에 wave·tier cap 조항은 없다(grep 0건). 코드가 헌법값을 초과해 독자 운영 중.

결정   D-day에는 손대지 않는다.
       MENOPAUSE=2는 헌법값 5보다 낮으므로 충돌하지 않는다.
       기존 보드 cap 정리는 D+30 별도 과제로 남긴다.
       (확정 13번 "기존 보드를 과도하게 흔들지 않는다"와 정합)
```

##### AS-IS 실행 경로 지도

| # | 경로 | DB write | MENOPAUSE 도달 | 현재 guard | BotLog | 실제 생성 이력 |
|---|---|---|---|---|---|---|
| 1 | `scheduler.ts` `runActivity` | :378 :408 | ❌ 차단 | ✅ (:331) | ✅ update | — |
| 2 | `scheduler.ts` `processPendingKillerCommentWaves` | :651 | ⚪ 미도달 | 🔴 없음 | ✅ update | 0건 (KILLER 15건 중 0) |
| 3 | **`scheduler.ts` `processSheetEngagementWaves`** | :973 | 🔴 **가능** | 🔴 **없음** | ✅ update | **169건 확정** |
| 4 | **`scheduler.ts` `processPendingSheetCommentWaves`** | :1196 | 🔴 **가능** | 🔴 **없음** | ✅ update | **118건 확정** |
| 5 | `micro-scheduler.ts` | :204 :232 | ❌ 차단 | ✅ (:174) | ✅ create | — |
| 6 | `controversy-chain.ts` | :211 :250 | ❌ 차단 | ✅ (:160) | 🔴 **없음** | — |
| 7 | `comment-activator.ts` | :115 | ❌ 차단 | ✅ (:47 where + :70) | 🔴 **없음** | — |
| 8 | `reply-chain-driver.ts` | :125 | ❌ 차단 | ✅ (:110) | 🔴 **없음** | — |
| 9 | `wave-processor.ts` ×4 | :173 :324 :431 :592 | ✅ **차단 실증 4/4** | ✅ (:762 :853) | ✅ create ×3 | 175건(보드 이관 전) |
| 10 | **`user-post-wave-processor.ts`** | :148 | 🔴 **boardType 미조회(:87)** | 🔴 **없음** | 🟡 postId 없음 | **25건 확정** |
| 11 | `author-reply-driver.ts` | :89 | ✅ 가능 | 🟡 자체 `ELIGIBLE_BOARDS` (정책 두 벌) | ✅ create ×5 | MENOPAUSE 0건 |
| 12 | `connection-facilitator.ts` | :72 | ⚪ `'STORY'` 고정 | — | — | D-day 제외 |
| 13 | `job-matcher.ts` | :146 | ⚪ JOB/STORY 고정 | — | — | D-day 제외 |

**D-day 위험 순위**

```
🔴 1위  scheduler.ts L973 · L1196   287건 확정 · guard 전무 · boardType 조회조차 없음
🔴 2위  user-post-wave L148          25건 확정 · select에 boardType 없음 · 실회원 글 대상
🟡 3위  author-reply L89             MENOPAUSE 도달 가능 · 정책이 두 벌
🟢 4위  wave-processor               차단 실증 완료 · 본문 검사만 추가하면 됨
⚪ 제외 connection-facilitator · job-matcher · KILLER 경로  도달 불가 확정
```

##### D-day 구현 순서 22단계

**Phase A — 순수 모듈 (1~5) · 예상 3h · 위험 최저**

| # | 목적 | 파일 | 선행 | 검증 | 중단 기준 |
|---|---|---|---|---|---|
| 1 | 브랜치 생성 | — | — | `git switch -c feat/m3-bot-guard origin/main` | 로컬 `main` checkout 시도 시 중단(worktree 점유) |
| 2 | 의료 정규식 분리 | **신규** `agents/core/menopause-speech-rules.ts` | 1 | 정규식을 **한 글자도 바꾸지 않고 이동** | 정규식 수정 발견 시 되돌림 |
| 3 | policy가 2번을 import | `agents/coo/author-reply-policy.ts` | 2 | **기존 `author-reply-policy.test.ts` 그대로 통과** | 이 테스트 실패 = 회귀. 즉시 중단 |
| 4 | 동등성 테스트 | **신규** `src/__tests__/menopause-speech-rules-parity.test.ts` | 3 | 기존 판정과 100% 동일 | 1건이라도 다르면 중단 |
| 5 | 톤 계열 매핑 | **신규** `agents/core/tone-family.ts` | 1 | 30명 전원이 4계열 중 하나 | 미분류 1명이라도 있으면 중단 |

**Phase B — guard 함수 (6~9) · 예상 4h · 위험 낮음**

| # | 목적 | 파일 | 선행 | 검증 | 중단 기준 |
|---|---|---|---|---|---|
| 6 | safety guard | **신규** `agents/core/bot-comment-guard.ts` `checkBotComment()` | 4 | 순수 함수(DB 의존 0) | DB import 발견 시 설계 오류 |
| 7 | exposure guard | 위 파일 `checkBotExposure()` | 5,6 | `retryable` 필드 포함 | — |
| 8 | safety 단위 테스트 | **신규** `src/__tests__/bot-comment-guard.test.ts` | 6 | 의료 5종 차단 · 일반 공감 허용 · fail-closed | 실패 시 배선 진입 금지 |
| 9 | exposure 단위 테스트 | **신규** `src/__tests__/bot-exposure-guard.test.ts` | 7 | G1~G7 · KST 경계 · retryable 구분 | 동일 |

⚠️ **8·9가 통과하기 전에는 어떤 호출부도 건드리지 않는다.** 이 시점엔 MENOPAUSE가 아직 배열에 없으므로
"MENOPAUSE는 차단된다"가 **정상 통과**여야 한다.

**Phase C — 배선 (10~17) · 예상 8h · 위험 중간**

| # | 목적 | 파일 | 선행 | 검증 | 중단 기준 |
|---|---|---|---|---|---|
| 10 | **기준 경로 배선** | `agents/cafe/wave-processor.ts` | 9 | `skips[]`·retry·KST cap 재사용 | 기존 STORY 동작 변화 시 중단 |
| 11 | cap 조정 | 위 파일 `BOT_DAILY_COMMENT_CAP` 20→3 · `getGlobalCap` MENOPAUSE=2 | 10 | tsc | — |
| 12 | 🔴 **최고 위험** | `agents/seed/scheduler.ts` L973·L1196 | 10 | post 조회에 `boardType: true` 추가 → guard | boardType select 누락 시 중단 |
| 13 | 🔴 **실회원 경로** | `agents/cafe/user-post-wave-processor.ts` :87 select + :148 guard | 10 | `boardType` 확보 확인 | 동일 |
| 14 | wave 축소 | 위 파일 — MENOPAUSE는 wave3~5 skip | 13 | 글당 2개 확인 | — |
| 15 | 🔴 **blocker 해소** | `comment-activator.ts` · `reply-chain-driver.ts` · `controversy-chain.ts` | 10 | **BotLog 기록 신설** + guard 배선 | BotLog 없이 guard만 넣으면 중단 |
| 16 | 나머지 배선 | `micro-scheduler.ts` · `author-reply-driver.ts` | 10 | author-reply는 G1 제외 / G5·G6 적용 | — |
| 17 | 정책 수렴 | `author-reply-policy.ts` `ELIGIBLE_BOARDS`에서 MENOPAUSE 제거 | 16 | 보드 판정이 guard 한 곳으로 | 두 벌 정책 잔존 시 중단 |

**Phase D — 생산·검증 (18~22) · 예상 5h**

| # | 목적 | 파일 | 선행 | 검증 | 중단 기준 |
|---|---|---|---|---|---|
| 18 | 지연 jitter | `src/lib/actions/wave-queue.ts:11` `+1분` → **10~60분** | 17 | postId 해시 기반 결정적 jitter | 고정값 잔존 시 중단 |
| 19 | 정적 가드 | **신규** `scripts/check-bot-comment-guard.ts` + CI 등록 | 17 | `comment.create` 전량이 guard 2개 통과 | **exit 1이면 20단계 진입 금지** |
| 20 | ★ **`MENOPAUSE` 배열 추가** ★ | `agents/core/bot-engagement-policy.ts:12` | **1~19 전부** | tsc + ops tsc + 19번 exit 0 | 19번 실패 시 절대 진행 금지 |
| 21 | 페르소나 30명 | `agents/seed/persona-data.ts` 선택 필드 · `sheet-scraper.ts` 배정 8→18 | 20 | AN 약국단골·AL 헬스덕후 배정 **해제** 확인 | — |
| 22 | dry-run 관찰 | — | 21 | 아래 PASS 조건 | 미달 시 롤백 |

**총 22단계 · 예상 20시간 · 24시간 내 실행 가능** ✅

⚠️ **`MENOPAUSE` 배열 추가는 20번째다.** M3-BOT-3에서 "10단계 중 10번째",
M3-BOT-5에서 "20단계 중 19번째"였던 것이 BotLog 배선 단계가 들어오며 22단계 중 20번째가 됐다.
**순서상 위치(safety·exposure guard 전부 이후)는 세 문서가 동일하다.**

##### 필수 신규/수정 파일

**신규 7개**

| 파일 | 왜 필요한가 |
|---|---|
| `agents/core/menopause-speech-rules.ts` | 의료 정규식이 `author-reply-policy.ts`에 갇혀 있어 다른 9경로가 못 쓴다. **이동만 하고 수정 금지** |
| `agents/core/bot-comment-guard.ts` | **호출부가 부를 함수는 하나여야 한다.** 정책이 두 벌인 게 이번 사고의 원인이다 |
| `agents/core/tone-family.ts` | G3·G4의 입력. 30명 → 4계열 순수 상수 |
| `scripts/check-bot-comment-guard.ts` | "새 create 경로 추가하고 guard 빠뜨림"의 **구조적 재발 방지**. `check-cron-links.ts`와 같은 방식 |
| `src/__tests__/bot-comment-guard.test.ts` | safety 단위 |
| `src/__tests__/bot-exposure-guard.test.ts` | exposure 단위 |
| `src/__tests__/menopause-speech-rules-parity.test.ts` | 2·3단계 리팩터링이 판정을 바꾸지 않았음을 고정 |

**수정 13개**

```
agents/core/bot-engagement-policy.ts     배열에 MENOPAUSE (20단계)
agents/coo/author-reply-policy.ts        정규식 import + ELIGIBLE_BOARDS 정리
agents/cafe/wave-processor.ts            guard + cap 20→3 + MENOPAUSE globalCap=2
agents/cafe/user-post-wave-processor.ts  boardType select + guard + wave3~5 skip
agents/seed/scheduler.ts                 L973·L1196 boardType select + guard
agents/seed/micro-scheduler.ts           guard 교체
agents/seed/controversy-chain.ts         guard 교체 + BotLog 신설
agents/coo/comment-activator.ts          guard 교체 + BotLog 신설 + MAX_BOT_COMMENTS_PER_POST 폐기
agents/coo/reply-chain-driver.ts         guard 교체 + BotLog 신설
agents/coo/author-reply-driver.ts        guard 배선 (G1 제외)
agents/seed/persona-data.ts              선택 필드 4개 + 30명 값
agents/community/sheet-scraper.ts        MENOPAUSE 배정 8 → 18명, AN·AL 해제
src/lib/actions/wave-queue.ts            jitter 10~60분
```

**migration 0건** ✅ — 전부 상수·함수·인터페이스. Prisma 스키마 무변경.

##### guard 함수 설계

```ts
// agents/core/bot-comment-guard.ts

// ── safety (순수 · DB 불필요 · 테스트 가벼움) ──
export type BotCommentBlockReason =
  | 'BOARD_ENGAGEMENT_DISABLED' | 'BOARD_TYPE_UNKNOWN'
  | 'MENOPAUSE_MEDICAL_ADVICE' | 'MENOPAUSE_SEXUAL_CONTENT' | 'MENOPAUSE_MENTAL_HEALTH_CRISIS'

export function checkBotComment(i: {
  boardType: string | null | undefined   // null 허용 = fail-closed를 타입으로 강제
  generatedComment: string
  postTitle?: string
  sourcePath: string
  personaId?: string
}): { ok: boolean; reason: BotCommentBlockReason | null; logDetail: string }

// ── exposure (DB 조회 필요) ──
export type BotExposureBlockReason =
  | 'post_cap_reached' | 'persona_already_on_post' | 'tone_family_conflict'
  | 'advice_tone_limit' | 'screen_exposure_cap' | 'persona_daily_cap'
  | 'human_comment_present' | 'BOARD_TYPE_UNKNOWN' | 'POST_NOT_FOUND' | 'QUERY_FAILED'

export async function checkBotExposure(i: {
  postId: string
  boardType: string | null | undefined
  personaId: string
  toneFamily: ToneFamily
  sourcePath: string
  isAuthorReply?: boolean        // true면 G1(post_cap) 건너뜀 — 별도 집계
}): Promise<{ ok: boolean; reason: BotExposureBlockReason | null; retryable: boolean; logDetail: string }>
```

**역할 분리 이유**

```
safety   텍스트만 본다 → 순수 함수 → DB mock 없이 테스트
exposure DB를 본다     → 비동기   → 조회 실패 처리 필요

같은 파일에 두되 함수는 분리한다.
같은 파일 = 호출부가 하나만 부르고 나머지를 빠뜨리는 걸 눈에 띄게 한다.
분리    = safety 테스트가 무거워지지 않는다.
```

**fail-closed 기준**

| 상황 | 판정 | retryable | 이유 |
|---|---|---|---|
| `boardType` null·undefined·`''` | **차단** | ❌ terminal | 배선 버그 신호. 재시도해도 같다 |
| `post` not found | **차단** | ❌ terminal | 글이 없다 |
| 댓글 조회 throw | **차단** | ✅ retryable | 일시적 DB 장애일 수 있다 |
| 알 수 없는 boardType(`'TALK'` 등) | **차단** | ❌ terminal | 허용 목록에 없다 |

⚠️ **`severity`·`log_only` 필드는 두지 않는다.** D-day 판단은 "쓴다/안 쓴다" 둘뿐이고,
중간 등급은 호출부마다 해석이 갈려 `log_only`가 사실상 통과로 쓰이는 사고를 부른다.

##### 큐 처리 정책

```
retryable = true  →  waveAt을 +20분 미룬다 (WAVE_BOT_CAP_RETRY_MS 재사용)
                     단 retryAt < expiresAt 일 때만. 넘으면 done 마킹
                     대상: screen_exposure_cap · persona_daily_cap · QUERY_FAILED
                     이유: 시간이 지나면 해소되는 조건이다

retryable = false →  wave1~5Done 전부 true로 마킹 후 skip
                     대상: post_cap_reached · human_comment_present · tone_family_conflict
                           persona_already_on_post · BOARD_TYPE_UNKNOWN
                           POST_NOT_FOUND · BOARD_ENGAGEMENT_DISABLED
                     이유: 재시도해도 결과가 같다
```

⚠️ **단순 `continue`는 금지다.** 큐가 영원히 재시도된다.
`wave-processor.ts:762`의 "done 마킹 후 skip" 패턴이 실전 검증(4/4)됐으므로 이를 표준으로 삼는다.

**USER_POST_WAVE의 wave3~5 처리 (확정)**

```
MENOPAUSE 글:  wave1·wave2만 처리 → 글당 2개
               wave3·wave4·wave5는 소비 단계에서 skip + Done 마킹

⚠️ 생산자(wave-queue.ts)에서 wave3~5를 안 만드는 방식은 불가하다.
   wave3At·wave4At은 schema 필수 필드다(wave5At만 nullable).
   → 값은 넣되 소비 단계에서 거른다. migration 회피.
```

##### BotLog.details 표준

전 경로 필수 필드다. 사후 감사가 가능해야 한다.

```json
{
  "postId":     "cmt155q1t0001iz2yxq3yg8jx",
  "boardType":  "MENOPAUSE",
  "personaId":  "AM",
  "toneFamily": "anxious_question",
  "sourcePath": "seed:sheet-engagement-wave",
  "skipReason": "post_cap_reached",
  "retryable":  false
}
```

**action 명명** — 기존 관례(`SCREAMING_SNAKE`)를 따른다.

```
기존 유지  SHEET_ENGAGE_COMMENT_PENDING · SHEET_COMMENT_WAVE_PENDING · WAVE_PROCESS_V2
           USER_POST_WAVE · COMMENT_ACTIVATE · REPLY_CHAIN_DRIVE
           AUTHOR_REPLY_WRITE · AUTHOR_REPLY_DRYRUN

신규       BOT_COMMENT_GUARD_SKIP   guard가 차단한 건 (전 경로 공통)
           CONTROVERSY_CHAIN        controversy-chain 신설 (현재 기록 0건)
```

##### 테스트·검증 계획

```
① 단위       npx vitest run src/__tests__/bot-comment-guard.test.ts
                            src/__tests__/bot-exposure-guard.test.ts
                            src/__tests__/menopause-speech-rules-parity.test.ts
                            src/__tests__/author-reply-policy.test.ts   ← 회귀 기준선, 수정 금지

② 정적       npx tsx scripts/check-bot-comment-guard.ts     exit 0 필수
             npx tsx scripts/check-cron-links.ts            orphan 0

③ typecheck  npx tsc --noEmit                               오류 0
④ ops        npx tsc -p tsconfig.ops.json --noEmit          오류 0  ⚠️ agents/ 검사는 이쪽만
⑤ lint       npx eslint . --ext .ts,.tsx
⑥ build      npm run build

⑦ dry-run    22단계. 실제 write 없이 skip 로그만 관찰
   PASS 조건
     BOARD_TYPE_UNKNOWN            0건      ← 1건이라도 있으면 배선 누락. 롤백
     post_cap_reached              1건 이상  ← guard 동작 증명
     human_comment_present         관측됨
     STORY/HUMOR/LIFE2 댓글 수      전일 ±10% 이내 ← 기존 서비스 회귀 없음

⑧ 첫 운영    MENOPAUSE 글 1개에 실제 2개 생성 확인
             시각 간격이 10~60분 범위이고 글마다 다른지 확인
             (현재는 [5,14,24,49,60] 고정 패턴 — 바뀌어야 정상)

⑨ 고객 화면  curl -H "x-bot-type: qa-verify" <글 URL>
             목록에서 같은 닉네임 반복 노출 없는지
             댓글 2개의 톤 계열이 다른지 육안 확인
```

##### D-day 실행 전/중/후 체크리스트

```
[실행 전]
[ ] git fetch origin main && git rev-list --count HEAD..origin/main → 0 확인
[ ] git switch -c feat/m3-bot-guard origin/main   (로컬 main checkout 금지 — worktree 점유)
[ ] git status --short → 타 세션 미커밋 없는지
[ ] 현재 MENOPAUSE 봇 댓글 수 기록 (롤백 기준선)
[ ] 현재 STORY/HUMOR/LIFE2 일일 댓글 수 기록 (회귀 판정 기준선)
[ ] .env.local · GitHub Secrets 변경 필요 여부 → 없음(확인 완료)

[구현 중]
[ ] Phase A 끝 → author-reply-policy.test.ts 통과 확인 후에만 B 진입
[ ] Phase B 끝 → 단위 테스트 전량 통과 후에만 C 진입
[ ] Phase C 각 단계 → npx tsc -p tsconfig.ops.json --noEmit
[ ] 12·13단계 후 → boardType이 실제 select에 들어갔는지 코드 확인
[ ] 19단계 → check-bot-comment-guard.ts exit 0 아니면 20단계 진입 금지

[구현 후]
[ ] dry-run PASS 조건 4개 전부 충족
[ ] 첫 MENOPAUSE 글 실제 2개 · 톤 계열 상이 · 지연 10~60분
[ ] 기존 보드 댓글 수 ±10% 이내
[ ] BotLog에 postId·boardType·skipReason 기록됨
```

##### 🛑 즉시 중단 기준

```
1. author-reply-policy.test.ts 실패        → 정규식 이동에서 회귀. 되돌림
2. BOARD_TYPE_UNKNOWN 1건 이상             → 배선 누락. 배열 추가 금지
3. check-bot-comment-guard.ts exit 1       → guard 미배선 경로 존재
4. 기존 보드 댓글 수 -10% 초과 감소         → 기존 서비스 영향. 롤백
5. MENOPAUSE 글에 3개 이상 생성            → G1 미작동
6. 실회원/게스트 댓글 뒤 봇 추가 생성       → G7 미작동
7. npx tsc -p tsconfig.ops.json 오류        → agents 타입 회귀
```

**롤백 방법**: 20단계(배열 추가) 이전이면 코드가 들어가 있어도 MENOPAUSE는 여전히 차단되므로 **무해하다.**
20단계 이후 문제 발생 시 배열에서 `'MENOPAUSE'` **한 줄만 되돌리면 즉시 원복**된다.

##### 하면 안 되는 것

```
MENOPAUSE 배열 먼저 추가             287+25건 확정 경로가 guard 없이 열린다. 20단계다
일부 경로만 guard 적용               scheduler L973·L1196이 가장 위험한데 가장 안 보인다
BotLog 없는 skip                     3개 경로가 이미 무기록. dry-run 판정이 불가능해진다
producer마다 제각각 제한             이미 3벌(5 / 10~20 / wave×count)이고 그게 원인이다
migration부터 시작                   D-day 항목 전부 migration 불필요
기존 보드 cap 동시 정리              창업자 확정 ②. D+30 과제다
실회원/게스트 감지 없이 wave 유지     G7. AI 운영처럼 보이는 가장 직접적 원인
@unao.bot 이메일로 실회원 판정        isRealUser(providerId 숫자)가 SSoT. 게스트를 놓친다
의료 정규식을 "개선"하며 이동         2단계는 이동이지 개선이 아니다
author-reply-policy.test.ts 수정      회귀 기준선이다
connection-facilitator·job-matcher 수정  도달 불가 확정. 겸사겸사 수정은 회귀만 늘린다
단순 continue로 skip                 큐가 영원히 재시도된다. done 마킹 필요
wave1At = +1분 유지                  확정값은 10~60분
로컬 main checkout                   다른 worktree 점유 중. git switch -c origin/main
```

##### D+30 과제

```
[ ] 기존 보드 globalCap 10~20과 constitution.yaml:351 (=5) 불일치 정리
[ ] strict exposure guard를 STORY/HUMOR/LIFE2로 확대할지 검토
[ ] screen_exposure 조회 비용 실측 (매 create마다 최근 20글 조회 부하)
[ ] /api/internal/user-post-wave 외부 호출 여부 점검 (코드 내 호출부 0건이나 토큰 보유 주체 미확인)
[ ] PersonaMemory 모델 (실제 대화 이력 기반 기억) — 유일하게 migration이 필요한 항목
[ ] Comment에 생성 경로 필드(botSourcePath) — 사후 추적용
[ ] 페르소나 30 → 50명 확장
```

##### 아직 미확정 (추정하지 않음)

| 항목 | 왜 미확정인가 | 확인 방법 |
|---|---|---|
| tone family 4계열 매핑 | M3-BOT-4의 Claude 설계안. Codex Master 검증 미완 | **5단계 착수 전 검증 필요** |
| `screen_exposure` 조회 비용 | 부하 미실측 | 10단계에서 EXPLAIN |
| `/api/internal/user-post-wave` 외부 호출 | `INTERNAL_API_TOKEN` 보유 주체 미확인 | 소비자 guard(13단계)로 덮이므로 D-day blocker는 아님 |
| `greeting.ts` 환대 글의 boardType | MENOPAUSE 환대 글 가능 여부 미추적 | 13단계 소비자 guard로 덮임 |
| `comment-activator`·`reply-chain-driver` 실행 빈도 | `agents-daily.yml`에 case는 확인했으나 실제 회차 수 미확인 | 15단계 BotLog 신설 후 관측 |

---

## 5. 가져가지 않을 가능성이 큰 것

| 항목 | 현재 상태 | 제외 근거 |
|---|---|---|
| **별도 jobs/2막준비 게시판** | `/jobs` · `/jobs/[id]` · `/jobs/region/[sido]` + `JobDetail` 모델 | SEO 목적이었으나 실질 효과가 거의 없다. 일자리 방식은 버리고, 돈·노후·일 이야기는 자유게시판/매거진 주제로 흡수 |
| **웃음방 독립 게시판** | HUMOR 보드 731건 | E0 정책으로 googlebot noindex 전면 적용 중 = 검색 유입 기여 0 |
| **화제성 파생 탭 다수** | `_화제성` 탭 4종 (Sheet 탭 9개 중) | 운영 복잡도 대비 효과 불명 |
| **popular crawler** | `agents/cafe/` + launchd 3개 | 30일 20회 SUCCESS인데 **발행 0건**. 원인 미규명 상태로 계속 실행 |
| **과도한 GHA/cron/launchd** | 워크플로 26개 · cron 116개 · launchd 12개 · agents 120파일 | 회원 424명 서비스에 대기업 규모 자동화. **전체를 파악할 수 있는 사람이 없다** |
| **대량 자동 외부글 발행** | 일 134건 | 71.4%가 300자 미만. 검색엔진·방문자 모두에게 양산 신호 |
| **봇 댓글을 활성 지표로 보는 구조** | 봇 83계정이 댓글 93.5% 생산 | 마중물 개념은 유효하나, 현재 비율은 정체성 위협 |
| **네이버카페 crawler** | `agents/cafe/crawler.ts` + launchd 10개 | 쿠키 수동 갱신 의존 · 차단 위험 · `CafePost` 31,160건 축적. 운영 부담 > 산출 가치 |

---

## 6. 외부글 운영 현실과 원칙

### 현실 (이상론 금지)

**회원 글이 일 0.7건이다.** 외부글을 끊으면 하루 1건 미만이 올라온다. 그건 진짜로 죽은 사이트다.
**"외부글을 없애자"는 현실에 맞지 않는다.**

### 진짜 문제

> 문제는 **"외부글이 있다"**가 아니라 **"외부글이 99.4%다"**이다.

외부글은 **대화의 씨앗**이어야지 **사이트의 정체성**이 되면 안 된다. 지금은 정체성이 됐다.

### 실패 조건 (하나라도 해당하면 실패)

- 죽은 사이트처럼 보인다
- AI가 대충 만든 사이트처럼 보인다
- 퍼온 글 모음처럼 보인다
- 출처/자동 발행/스크래핑 냄새가 고객 화면에 남는다
- 연예·자극 유입에 정체성이 끌려간다

### 필요 조건 (4종 세트)

```
① gate         자동 선별 — 위험 글 차단 + 타겟 적합도 판정
② 사람 승인     창업자가 직접 보고 고른다. 자동 승격 경로 없음
③ 제한 발행     하루 상한을 먼저 정하고 시작한다
④ 댓글 유도     대화가 붙을 글만 고른다 (댓글수를 신호로 사용)
```

### 이미 확보한 자산

이번 주에 만든 **cook82 후보 큐**가 정확히 이 구조다.

```
agents/cook82/
  collector.ts       수집 (write 없음)
  gate.ts            v3.2.2 선별 — AI 호출 0원, 위험 4종 차단
  queue.ts           판정 (write 없음)
  review.ts          ★ 사람 승인 — APPROVED로 가는 코드 경로 없음
  publish-bridge.ts  전달 — 유일한 write 지점, 4중 안전장치
```

**실전 검증 완료**: 첫 82cook 글이 Sheet → PUBLISHED까지 성공했고, QA에서
고객 화면 출처 노출 0건 · 제목 rewrite 정상 · SEO 메타 정상을 확인했다.

**빠진 것은 하나 — 발행량이다.** 골라내는 장치는 만들었는데 일 134건 자동 발행은 그대로다.

### 원천별 선별 기준

| 원천 | 대상 | 비고 |
|---|---|---|
| **82cook 자유게시판(bn=15)** | 자유게시판·갱년기 소재 | gate v3.2.2 적용. 실측 PASS 58% |
| **드라마·연예 회상형** | 작품·방송(E4) 유형 | "청춘의 덫 다시보니" 류. **범죄·의혹(E5)·정치연계(E6)는 차단 유지** |
| 그 외 | 미정 | 새 브랜드에서 재검토 |

### 새 브랜드 외부글 운영 원칙 (제안)

```
1. 하루 외부글 발행 상한은 20건으로 시작한다
2. 모든 외부글은 gate + 사람 승인을 거친다
3. 외부글 : 회원글 비율을 지표로 관리한다 (현재는 측정조차 안 함)
4. 봇 댓글은 활성화처럼 보이기 위한 마중물로 적극 사용하되, 봇마다 강한 페르소나와 기억을 부여한다
5. 본문 300자 미만은 발행하지 않는다
6. 고객 화면에 출처·자동발행 흔적을 남기지 않는다 (내부 추적은 유지)
```

봇 댓글은 단순 수량 채우기가 아니다. 각 페르소나는 한 명의 실제 사용자처럼 주제 맥락,
이전에 쓴 댓글, 이전 게시글, 말투를 기억해야 한다. 현재처럼 봇 댓글이 많아도 정체성이 없으면
커뮤니티가 아니라 자동화된 사이트처럼 보인다.

---

## 7. Keep / Drop / Rewrite 기준

### KEEP — 코드 패턴/구현 경험을 재사용한다

| 항목 | 경로 | 근거 |
|---|---|---|
| 커뮤니티 글/댓글 기본 구조 | `src/app/(main)/community/**`, `Comment` 모델 | 보드-목록-상세-작성 표준 구조. 문제는 구조가 아니라 콘텐츠 |
| Kakao 로그인 패턴 | `src/lib/auth.config.ts`, `User.providerId` | 타겟층에 카카오 로그인은 사실상 필수. 단, 새 브랜드라면 실제 Kakao 앱은 분리 생성 검토가 기본 |
| Supabase / Prisma 구현 경험 | `prisma/schema.prisma` | 스택과 ORM 패턴은 재사용 가치 있음. 단, 새 브랜드라면 실제 Supabase 프로젝트는 분리 생성 검토가 기본 |
| 제목/description 개선 | `agents/community/title-seo.ts` | 실측 검증됨 — 원문 왜곡 없이 맥락 보강. **Sonnet 고정, Haiku 금지** |
| cook82 후보 큐 | `agents/cook82/**` | **유일한 "선별형" 구조.** 새 브랜드의 표준 공급 경로 |
| 출처 처리 | `content-transformer.ts`, `normalize-source-references.ts` | 자동 꼬리표 제거 완료(PR #390). 원문 문구 일반화는 유지 |
| sitemap/robots/canonical | `src/app/sitemap.ts`, `robots.ts` | seo-guard로 보호되는 구조. 새 도메인으로만 교체 |

주의: KEEP은 기존 계정/프로젝트/앱/도메인을 그대로 가져간다는 뜻이 아니다. GitHub repo, Vercel project, Supabase project, Kakao app, Google/Search Console/Analytics 계정은 새 브랜드 독립성 때문에 분리 검토가 기본 전제다.

### DROP — 가져가면 위험하거나 불필요

```
무분별한 crawler       네이버카페 crawler + launchd 10개 — 쿠키 수동 갱신·차단 위험
popular crawler        20회 실행 · 발행 0건 · 원인 미규명
과도한 탭              jobs 독립 route · 웃음방 · 화제성 파생 탭
대량 봇 댓글           83계정이 댓글 93.5% 생산
GHA 26개 / cron 116개  최소 3~5개로 재시작
launchd 12개           로컬 맥 의존 = 단일 장애점
```

### REWRITE — 개념은 가져가되 다시 설계

```
게시판 구조            4보드 + 파생탭 → 자유게시판 + 갱년기 2판
SEO 매거진             262건 자산 유지, 시리즈·큐레이션 구조는 단순화
외부글 선별/발행 플로우   cook82 방식으로 통일 + 발행 상한 도입
운영 cron 구조          39개 핸들러(CEO~CDO 가상 조직) → 최소 구성
비용 구조              ISR Writes $56.10 · revalidatePath 167곳 → 설계 시점에 캐시 전략 확정
봇 마중물              개념 유지, 단순 비율 상한보다 페르소나·기억·맥락 품질을 핵심으로 재설계
noindex 정책(E0)       HUMOR 전면 googlebot noindex는 저품질 회피 목적.
                      새 브랜드가 애초에 저품질을 안 만들면 불필요 — 재검토
```

### M3-1 파일 단위 초안 (2026-08-20)

이 표는 D-day에 바로 구현하라는 지시가 아니다. 새 브랜드가 필요해졌을 때
**어떤 코드를 가져가고, 어떤 코드를 버리고, 어떤 코드를 다시 써야 하는지**
논의가 반복되지 않도록 미리 확정하기 위한 초안이다.

| 판정 | 현재 파일·경로 | 새 브랜드 처리 | 이유 |
|---|---|---|---|
| **KEEP** | `src/lib/board-registry.ts` | 구조는 유지하되 초기 보드는 `자유게시판`·`갱년기`·`매거진` 중심으로 축소 | 보드 slug/url/name의 단일 기준점은 필요하다. 단, JOB/HUMOR/LIFE2/WEEKLY를 그대로 열면 현재 복잡도가 반복된다 |
| **KEEP/SLIM** | `prisma/schema.prisma`의 `User`·`Post`·`Comment`·`PostSource` | 핵심 모델은 유지, `sourceUrl/sourceSite/source`는 반드시 유지 | 외부글을 검색 대표 영역에서 빼려면 출처 추적 필드가 처음부터 필요하다 |
| **DROP** | `JobDetail`, `/jobs/**`, `src/app/api/jobs/route.ts`, jobs 관련 agent/workflow | 독립 일자리 서비스는 새 브랜드 MVP에서 제외 | 일자리 SEO는 효과가 없었고, 돈·노후·일 이야기는 자유게시판/매거진 주제로 흡수한다 |
| **KEEP/SEPARATE** | `src/lib/auth.config.ts`, `src/lib/auth.ts` | NextAuth/Kakao 패턴은 유지. 실제 Kakao app/env는 새 브랜드용으로 분리 | 50대 여성 타겟에는 카카오 로그인이 필수다. 단, 기존 앱을 재사용하면 브랜드 독립성이 깨진다 |
| **REWRITE** | `src/app/(main)/page.tsx` | 홈은 새로 설계. 첫 화면에서 브랜드 정체성·갱년기 특화·커뮤니티성을 명확히 보여준다 | 현재 홈은 jobs, humor, ads, popup, 여러 섹션이 섞여 대표성이 약하다 |
| **KEEP/REWRITE** | `src/app/(main)/community/[boardSlug]/**` | 목록/상세/댓글 구조는 유지, 보드 수와 SEO 정책은 재작성 | 커뮤니티 기본 골격은 유효하다. 문제는 정보구조와 콘텐츠 신호다 |
| **KEEP/ABSORB** | `src/lib/seo/topic-menopause.ts`, `/topic/menopause` | 허브 로직은 유지하되 새 브랜드에서는 `/community/menopause` 상단으로 흡수 | 갱년기 허브 자산은 핵심이지만 대표 URL은 하나로 집중해야 한다. 별도 `/topic/menopause`를 같이 열면 검색 대표성이 분산된다 |
| **REWRITE** | `src/app/sitemap.ts`, `src/lib/seo/community-google-noindex.ts`, 커뮤니티 metadata | 처음부터 source/board 기준 검색 대표 영역 분리 | 외부글 20건/day를 허용하더라도 검색엔진에는 대표 페이지·원본 매거진·핵심 허브를 먼저 보여줘야 한다 |
| **KEEP/REWRITE** | `agents/cook82/**` | 후보 큐·gate·사람 승인 패턴은 표준 공급 경로로 유지 | 현재 코드 중 유일하게 “선별형 외부글 운영”에 가깝다. 다만 새 브랜드 정책/보드에 맞게 재작성한다 |
| **REWRITE** | `agents/community/sheet-scraper.ts`, `content-transformer.ts`, `title-seo.ts` | 승인 큐 소비자만 유지. 발행량·보드·출처 정책을 단순화 | Sheet 기반 운영은 유효하지만, 자동 대량 발행과 출처 흔적은 새 브랜드에서 반복되면 안 된다 |
| **DROP/POSTPONE** | `agents/cafe/crawler.ts`, `popular-*`, `image-router.ts`, 카페 crawler workflow/launchd | D-day MVP에는 넣지 않는다 | 쿠키·차단·대량 수집·제목 추출 실패 리스크가 크다. 먼저 사람 승인 큐 기반으로 시작한다 |
| **KEEP/REWRITE** | `agents/core/persona-registry.ts`, `agents/seed/persona-data.ts`, `agents/coo/comment-activator.ts`, `agents/core/bot-engagement-policy.ts`, `agents/coo/author-reply-policy.ts` | 79명 페르소나 자산과 갱년기 안전 규칙은 유지하되, 기억·노출 guard·KPI·MENOPAUSE 실행 경로를 재설계 | 자산은 우수하다. 79명 전원 여성이고 연령도 50대/60대 중심이다. 문제는 자산이 아니라 운영 축이다. 현재는 글당 댓글 수 중심이라 목록 체감 반복을 막지 못하고, 갱년기 안전 규칙도 author-reply 경로에만 확인된다. 새 브랜드에서는 첫 세트 30명, 갱년기 봇 댓글 허용, 글당 2개, 최근 20글 노출 guard, 실회원 KPI 분리를 D-day 기준으로 둔다. 단, MENOPAUSE는 배열 한 줄 추가가 아니라 공통 safety guard 선행 후 허용한다 |
| **DROP/POSTPONE** | 독립 `HUMOR` 보드/웃음방 노출면 | 유머는 자유게시판 카테고리로만 흡수 | HUMOR는 이미 검색 회피 대상이었고, 독립 보드로 두면 새 브랜드 대표성을 흐린다 |
| **REWRITE** | `.github/workflows/**`, launchd, cron | 최소 운영 runner만 다시 정의 | 기존 workflow 26개·cron 116개·launchd 12개는 새 브랜드 MVP에 과하다. 실행 경로 정본 붕괴를 반복하면 안 된다 |
| **DROP** | 기존 도메인 전체 리다이렉트, 기존 `sameAs`/브랜드 링크 재사용 | 새 브랜드에서 사용하지 않음 | 실패 도메인의 신호를 새 브랜드에 연결하지 않는다 |
| **POSTPONE** | 광고/이벤트/투표/푸시/과도한 admin 기능 | MVP 안정 이후 단계적으로 재검토 | 첫 목표는 생존과 대표성 회복이다. 수익화/부가 기능은 후순위다 |

### M3-1에서 아직 창업자와 확정해야 할 것

1. `자유게시판` 안에서 허용할 카테고리: 사는 이야기, 돈/노후, 유머, 일, 가족, 건강 중 무엇을 첫날부터 열지
2. `갱년기` 보드의 성격: 질문/경험담 중심인지, 매거진과 연결된 상담형 중심인지
3. 외부글 20건/day의 구성: 자유게시판 몇 건, 갱년기 몇 건, 매거진 보강 몇 건인지
4. 봇 페르소나의 첫 세트 명단: 30명은 확정. 50대 19명 · 40대 후반 6명 · 60대 5명 기준으로 최종 후보를 고를지
5. 기존 콘텐츠 재활용 기준: 살릴 글, 버릴 글, 완전 재작성할 글의 기준

---

## 8. M3 마일스톤

| # | 이름 | 목적 | 성공 기준 | 창업자 결정 |
|---|---|---|---|---|
| **M3-0** | AS-IS inventory | 현재 전수 조사 | ✅ **완료** (2026-08-19) | — |
| **M3-1** | Keep/Drop/Rewrite 확정 | §7 표를 창업자가 확정 | 18개 항목 전부 판정 | ✅ 필요 |
| **M3-2** | 새 브랜드 IA/Product spec | 홈·자유게시판·갱년기·매거진 상세 설계 | route 10개 이내 정의 | ✅ 필요 |
| **M3-3** | 콘텐츠 공급/외부글 운영 정책 | 발행 상한·승인 절차·비율 목표 확정 | "일 N건, 승인 M단계" 수치 확정 | ✅ 필요 |
| **M3-4** | SEO reset 전략 | 새 도메인 SEO 초기 설계 + 기존 도메인 처리 | 중복·저품질 재생산 차단 규칙 | ✅ 필요 |
| **M3-5** | 인프라 분리 계획 | 계정·리소스 목록화 + 순서·비용 | 무엇을 몇 번째로, 얼마에 | ❌ 불필요 |
| **M3-6** | launch checklist | 전환 시점·데이터 이관 범위·기존 서비스 처리 | 되돌리기 가능한 단계별 체크리스트 | ✅ 필요 |

### 각 마일스톤 공통 금지사항

```
창업자 명시 승인 없는 코드 수정 · DB write · Sheet write · workflow_dispatch · PR 생성 · merge
창업자 명시 승인 없는 외부 계정/도메인/서비스 생성 · 구매
naver_google/ 및 vercel 비용/ 폴더 수정
Naver/GSC/Search Advisor 요청
```

---

## 9. 운영 원칙

1. **현재 서비스 회복 관찰이 우선이다.** M3는 본작업이 아니라 **생존 보험**이다.
2. **대기 시간에만 진행한다.** 네이버 관찰은 대기이고, 그 시간에 판단 자료를 쌓는다.
3. **회복 여부가 확정되기 전에는 창업자 명시 승인 없는 새 브랜드 실행/구매/계정 생성 금지.**
4. **현재 서비스에 창업자 명시 승인 없는 추가 SEO 변경 금지.** 수집량이 하루 10건 안팎으로 극단적으로 축소되어 변경 효과를 판정하기 어렵고,
   변경만 쌓이면 나중에 원인 규명이 불가능해진다.
5. **이 문서는 append/update로 계속 갱신한다.** 마일스톤 완료 시 해당 절을 갱신한다.

### 생존 판단 기준 (창업자 확정 필요)

**운영 판단 기준 제안: 2026-08-22까지 네이버 수집량이 하루 10건 안팎에서 의미 있게 증가하는가.**

색인이나 유입보다 먼저 **수집량**을 보는 이유는, 현재 네이버가 사이트를 하루 4~14건 수준으로만
극소량 크롤링하고 있기 때문이다. **이 속도로는 수정분 반영과 회복 판정이 매우 느리다.**

```
수집 10건 안팎 유지  →  소량 수집 고착. M3 준비 비중 확대
수집 100건 이상 회복  →  회복 시작 신호. 단, 진짜 회복은 색인/노출/유입으로 추가 판정
```

확인 위치: Search Advisor → 요약 → 수집 현황 차트

---

## 10. 창업자 결정 대기 항목

| # | 항목 | 현황 | Claude 의견 |
|---|---|---|---|
| 1 | **새 브랜드명** | 미정 | — (창업자 영역) |
| 2 | **도메인** | 미정 | 기존 도메인 리다이렉트는 **비권장** — SEO 오염이 함께 옮겨질 위험 |
| 3 | **기존 회원 이전 여부** | 확정 | 데이터 이관 안 함. 기존 회원에게 카카오톡 등으로 새 브랜드 재가입 유도 |
| 4 | **사업자/계정 분리 수준** | 확정 | 새 브랜드 독립성을 위해 Kakao app·Supabase project·Vercel project·Google/Search Console/Analytics는 최대한 독립 분리 |
| 5 | **초기 외부글 일 발행량** | 확정 | 하루 20건. 단, gate + 사람 승인 + 출처/자동발행 흔적 제거가 전제 |
| 6 | **매거진 운영 방식** | 미정 | 적게·길게·원본. 대량 AI 생성 금지. guide 유형(글당 노출 10.5) 참고 |
| 7 | **봇 댓글 운영** | 핵심 기준 확정 · 첫 30명 설계 PASS · guard 설계 확정 | 비율 상한보다 페르소나 품질 우선. D-day 기준은 첫 세트 30명, 갱년기 보드 봇 댓글 허용, 글당 최대 2개, 최근 20글 기준 동일 페르소나 최대 2회, 게시 후 10~60분 지연, 실회원 댓글 후 추가 봇 중단. 전체 댓글과 실회원 댓글 KPI는 반드시 분리한다. M3-BOT-3 기준, MENOPAUSE 배열 추가는 마지막 단계이며 공통 `checkBotComment()` guard와 무방비 경로 편입이 선행되어야 한다. M3-BOT-4 기준, 첫 30명은 신규 대량 창작 없이 기존 bot 자산으로 구성하고, 40대 후반 결손 1명은 50대 1명으로 보완한다. 최종 분포는 50대 19명 · 40대 후반 6명 · 60대 5명이다. **M3-BOT-5 기준(2026-08-20 확정)**: ① 게스트 댓글도 사람 댓글로 보고(`providerId` 숫자 **또는** `guestNickname` 존재) 사람 댓글이 있으면 추가 봇 wave를 중단한다 ② strict exposure guard는 공통 함수로 설계하되 **첫 적용은 MENOPAUSE만**, 기존 보드는 D+30 이후 확대 검토 ③ author-reply는 글당 2개 제한과 **별도 집계**하되 safety·exposure guard는 통과해야 하며 반복 노출 시 skip한다. **M3-BOT-6 기준(2026-08-20 확정)**: ④ `screen_exposure`의 "최근 20개 글"은 **MENOPAUSE 보드 기준 20개**다 ⑤ `constitution.yaml:351`(`bot_comment_cap_per_post: 5`)과 `wave-processor` globalCap 10~20의 불일치는 **D-day에 건드리지 않는다** — MENOPAUSE=2는 헌법값보다 낮아 충돌하지 않으며, 기존 보드 cap 정리는 D+30 과제다. 구현은 **22단계 순서표**를 따르며 `MENOPAUSE` 배열 추가는 **20번째**다 |
| 8 | **생존 판단 기준** | 미정 | **운영 기준으로 08-22까지 수집량이 10건 안팎이면 소량 수집 고착, 100건 이상이면 회복 시작 신호** (§9 참조). 진짜 회복은 색인/노출/유입 동반 여부로 판정 |
| 9 | **기존 도메인 연결** | 확정 | 전체 리다이렉트 금지. 실패한 도메인의 신호를 새 브랜드에 연결하지 않음 |
| 10 | **기존 콘텐츠 재활용** | 방향 확정 | 살릴 수 있는 글은 Google Sheet 등 내부 큐에 보존하고, 오리지널리티를 강화해 새 브랜드에서 재활용하는 방법을 설계 |
| 11 | **자유게시판 내부 구현** | D-day 권고 확정 | 고객 URL은 `/community/talk`, 내부 enum은 `STORY` 재사용. `TALK` enum 추가는 D+30 이후 필요성이 생길 때 재검토 |
| 12 | **MENOPAUSE 실회원 글 봇 wave 수** | 확정 | D-day에도 글당 최대 2개. 단, 공통 safety guard, 같은 톤 반복 방지, 실회원 댓글 후 중단, 최근 20글 동일 페르소나 최대 2회 조건을 전제로 한다 |

---

## 11. 지금 하지 말아야 할 것

```
🚫 새 브랜드 실행 — 도메인 구매 · 계정 생성 · repo 생성 · 코드 작성
🚫 현재 서비스에 추가 SEO 변경 — 수집량이 하루 10건 안팎이라 검증 불가
🚫 네이버 수집 요청 연타 — 이미 3회 시도, 효과 없었음
🚫 기존 회원 데이터 이관 준비 — 개인정보 영역, 결정 전 착수 금지
🚫 "안 되니 다른 걸" 식 시행착오 — 변수가 섞이면 원인 규명 불가
🚫 HUMOR 대량 자동 발행 — r370으로 통합/출처 꼬리표 제거는 PASS. 단, 재개하더라도 첫 반응 확인 후 제한 운영으로 간다
🚫 popular crawler 삭제 — 원인 규명 전 제거 금지 (기록은 남길 것)
```

---

## 12. 다음에 Claude가 이어서 할 일

**우선순위 순.** 창업자 지시가 있을 때만 착수한다.

1. **M3-1 Keep/Drop/Rewrite 확정** — §7 파일 단위 초안을 창업자와 함께 확정
2. **네이버 수집/색인 관찰 결과 반영** — 창업자가 확인한 Search Advisor 최신 자료를 기준으로 §9 판정만 업데이트
3. **M3-2 새 브랜드 IA 설계** — 홈·자유게시판·갱년기·매거진 상세 정보구조
4. **M3-BOT-5 봇 노출 guard 설계** — 글당 2개, 최근 20글 동일 페르소나 2회, 게시 후 10~60분 지연, 실회원 댓글 후 중단을 코드 정책으로 정리
5. **M3-BOT-6 D-day 구현 체크리스트** — scheduler L973/L1196, user-post-wave, wave-processor skip 패턴, BotLog details, 첫 30명 배정까지 구현 순서 확정
6. **M3-3 외부글 운영 정책** — 발행 상한·승인 절차·비율 목표 수치화
7. **M3-5 인프라 분리 계획** — 계정·리소스 목록화 (창업자 결정 불필요, 단독 진행 가능)

### 지금 바로 할 일과 하지 않을 일

| 구분 | 항목 | 판단 |
|---|---|---|
| **지금 함** | M3-1 파일 단위 Keep/Drop/Rewrite 정리 | 대기 중 해도 변수를 만들지 않고, D-day 실행 시간을 줄인다 |
| **지금 함** | 새 브랜드 IA/콘텐츠/봇/인프라의 빈칸 파악 | 실행이 아니라 설계다. 생존 보험의 핵심이다 |
| **창업자 자료 오면 함** | 네이버 최신 관찰값 문서 반영 | Search Advisor 확인은 창업자가 수시로 하고 있으므로 Claude/Codex가 반복 요청하지 않는다 |
| **지금 안 함** | 현재 서비스 SEO 코드·sitemap·robots·canonical·noindex 변경 | 다음 수집/색인 판정 전에는 변수만 늘어난다 |
| **지금 안 함** | 새 도메인 구매·계정 생성·repo 생성·인프라 생성 | 회복 불가 판정 전 실행 금지 |
| **지금 안 함** | 기존 도메인 리다이렉트·대량 삭제·검색 제외 요청 | 생존 판정 전에는 되돌리기 어려운 조치다 |

### 병행 가능한 현재 서비스 작업

```
- HUMOR 제한 운영 여부 판단 (r370 검증 PASS. 대량 자동 재개가 아니라 첫 반응 확인 후 1~3건 단위)
- cook82 큐 상태 동기화 스크립트 (SENT_TO_SHEET → PUBLISHED 대조)
- Vercel 비용 절감 효과 측정 (PR #392 반영 후 다음 청구서)
```

---

## 13. D-day 준비를 위해 아직 부족한 것

현재 문서는 전략 방향과 창업자 확정 원칙을 담았지만, 아직 **24시간 안에 새 브랜드 MVP를 개설**하기에는 부족하다.
다음 항목은 M3-1 이후 반드시 채워야 한다.

| 영역 | 부족한 내용 | 다음 작업 |
|---|---|---|
| 브랜드 | 새 브랜드명 후보, 금지어, 도메인 후보 기준 | 은은한 여성 커뮤니티 이름 후보군 작성 |
| 제품 | MVP route, 홈 첫 화면 구성, 게시판별 역할 | M3-2 IA/Product spec으로 확정. 단, `/community/talk`는 D-day에 `STORY` enum 재사용 |
| 콘텐츠 | 초기 7일 발행 계획, 외부글 20건 구성, 매거진 첫 주제 | M3-3 콘텐츠 운영 정책으로 확정 |
| 봇/페르소나 | 첫 세트 30명 설계 PASS, D-day 확정 분포 50대 19명·40대 후반 6명·60대 5명, 갱년기 봇 댓글 허용, 갱년기 실회원 글도 글당 최대 2개, 최근 20글 노출 guard, 실회원 KPI 6종 | M3-BOT-1/2/3/3b/4 기준을 문서화함. 다음은 같은 톤 반복 방지, 노출 guard 세부 설계, D-day 구현 체크리스트 |
| 코드 | 복사할 모듈, 삭제할 모듈, 다시 쓸 모듈 | M3-1 Keep/Drop/Rewrite를 파일 단위로 확장 |
| 인프라 | GitHub, Vercel, Supabase, Kakao, Google, Sheet 생성 순서 | M3-5 인프라 분리 계획으로 확정 |
| SEO | 새 도메인 sitemap/robots/canonical/noindex 초기 정책 | M3-4 SEO reset 전략으로 확정 |
| 기존 콘텐츠 | 살릴 글 선별 기준, Sheet 보존 구조, 오리지널리티 강화 방식 | 재활용 큐 설계 |
| 기존 회원 | 카카오톡 재가입 안내 문구, 발송 대상, 발송 시점 | D-day launch checklist에 포함 |
| 런칭 | 시간대별 작업 순서, 검증 체크리스트, 실패 시 중단 기준 | M3-6 launch checklist로 확정 |

이 섹션은 실행 지시가 아니다. 네이버 생존 판정 대기 시간에 하나씩 채워서,
회복 불가 판정이 났을 때 판단과 실행을 같은 날 끝낼 수 있게 만드는 준비 항목이다.

---

## 부록 A — M3-0 실측 데이터 요약

```
[제품]      공개 route 33 · 어드민 20 · API 54
[콘텐츠]    PUBLISHED 10,644  (BOT 72.8% · SHEET 26.6% · USER 0.6%)
           본문 71.4%가 300자 미만 · 일 발행 134건
[참여]      댓글 62,808  (봇 93.5% · 실회원 6.4% · guest 74)
           계정 507  (봇 83 · 실회원 424)
           최근 7일 실회원 글 5건 · 실회원 댓글 446건
[인프라]    GHA 26 workflow · cron 116 · launchd 12 · agents 120파일 · Prisma 46모델
           워크스페이스 3벌 (unao-main 개발 · unao-prod launchd 11 · unao-ops launchd 1)
[SEO]      네이버 색인 0 · 수집 4~14/day 수준으로 축소 · 노출 0
           Google 색인 6,220 / 미색인 15,796 · 28일 클릭 85 (브랜드 45%)
[비용]      ISR Writes $56.10(1위) · Fast Origin Transfer $40.82 · Fluid CPU $16.07
           6월 $69.60 → 8월 $36.64 (약 -47%)
```

## 부록 B — 관련 문서

```
docs/constitution/NORTH_STAR.md          헌법 v5.0
docs/ops/OPERATING_MASTER_HARNESS.md     Codex↔Claude 협업 규약
agents/cook82/README.md                  후보 큐 운영 문서
.claude/rules/agent-lifecycle.md          에이전트 ON/OFF 체크리스트
naver_google/                             네이버 진단 증거 (수정 금지)
vercel 비용/                              Vercel 청구 증거 (수정 금지)
```

---

*최종 갱신 2026-08-20 · 다음 갱신 예정: M3-1 창업자 확정 또는 네이버 수집/색인 전환 관찰 후*
