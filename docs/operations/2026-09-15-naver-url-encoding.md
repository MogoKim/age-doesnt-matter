# 네이버 한글 URL 수집 실패 — RFC 호환 ASCII URL 전환 (2026-09-15)

> PR [#481](https://github.com/MogoKim/age-doesnt-matter/pull/481) merge `45e74616` · production `2026.09.15-45e7461` 배포 완료
> **기술 배포 검증 PASS** (HTTP·HTML·sitemap 실측) · **Search Advisor 운영 검증 대기** (§6 — 창업자 몫)
> 네이버가 실제로 수집하는지는 아직 확인되지 않았다. 배포된 표기가 규격에 맞다는 것까지만 확인됐다.

## 1. 문제 — 콘텐츠가 아니라 URL 표기였다

네이버 URL 검사 실측:

| URL 표기 | 결과 |
|---|---|
| 같은 매거진 글, **raw 한글** URL | 접근 실패 |
| 같은 매거진 글, **percent-encoded** URL | 200 OK · robots·meta 전부 정상 |

`/`, `/magazine`, ASCII JOB 상세는 정상이었다. 즉 **표기만 다르면 같은 글도 수집되지 않았다.**

- 배포 전 production sitemap 229개 중 **138개가 raw non-ASCII**
- 서버 렌더링된 목록·허브의 일부 `href` 도 raw 한글 → **목록 → 상세 크롤 경로까지 끊김**
- `canonical`·`og:url` 은 **이미 percent-encoded** 였다 → sitemap 과 내부 링크만 규칙이 달랐다

🔴 **기존 sitemap 등록일 2026-08-19 는 원인이 아니다.** 이번 작업에서 네이버 등록을 삭제하거나 재등록하지 않았다.
`/sitemap.xml` endpoint 는 그대로이고 정상 응답하므로 **재등록은 지금 할 일이 아니다** — 자세한 조건은 §6.

## 2. 해결 — URL 생성을 한 곳으로

`src/lib/post-url.ts` 하나에 모았다.
`encodePathSegment` · `encodePathname` · `buildPostPath` · `buildPostUrl` · `buildGuidePath` · `buildSeriesPath`

### 인코딩 규칙은 `decode → encode` 정규화다

처음엔 "`%XX` 가 보이면 그대로 둔다"로 만들었다가 Codex 리뷰에서 깨졌다 —
`한글-%20-test` 처럼 **부분만** 인코딩된 입력이 raw 한글을 달고 나갔다.

| 입력 | 1차 구현 | 현재 |
|---|---|---|
| `한글-%20-test` | raw 한글 잔존 | `%ED%95%9C%EA%B8%80-%20-test` |
| `한글-%2F-경로` | raw 한글 잔존 | `%ED%95%9C%EA%B8%80-%2F-%EA%B2%BD%EB%A1%9C` |
| `a/b` | `a/b` (**segment 2개로 쪼개짐**) | `a%2Fb` (segment 1개 유지) |
| `50%-할인` | raw 한글 잔존 | `50%25-%ED%95%A0%EC%9D%B8` |

- `encode(decode(encode(x))) === encode(x)` 라 **멱등**이다 — 이미 인코딩된 값이 `%25` 로 부풀지 않는다
- **`encodePathSegment` 는 `/` 를 `%2F` 로 인코딩한다.** 그냥 두면 segment 하나가 경로 segment 둘로 쪼개져 라우팅이 바뀐다. 경로 구분자 보존은 **`encodePathname` 책임**이다
- malformed percent 의 `%25` 는 **리터럴 `%` 의 정상 표기**다. 이중 인코딩으로 착각하지 마라

### 적용 범위

sitemap(글·가이드·시리즈 허브) · 홈 5종 · 커뮤니티 목록 4종 · 매거진 3종 · 검색 ·
topic 허브 2종 · 시리즈 허브(canonical·OG·JSON-LD·breadcrumb·글 목록) ·
가이드 목록·상세 · JOB canonical·JSON-LD·목록 · HERO 연동 글 · server action 의 `postUrl` 3종.

`guides/index.ts` 의 **하드코딩 한글 경로 35개**는 사람이 읽고 고치는 데이터라 그대로 두고,
**렌더 시점에** `encodePathname` 으로 인코딩한다.

## 3. 🚫 인코딩하면 안 되는 곳 (재시도 금지)

| 대상 | 이유 |
|---|---|
| `permanentRedirect` · `redirect` | Next 가 Location 헤더를 **직접 percent-encode** 한다 (production 301 실측: `location: /magazine/%EC%98%A4...`). 미리 인코딩하면 의미만 겹친다 |
| `revalidatePath` | URL 이 아니라 **라우트 경로 키**다. 인코딩하면 캐시가 안 지워진다 |
| ISR prewarm 경로 | 실제 요청과 **같은 캐시 키**여야 한다 |
| `/my` · 어드민 링크 | CUID(ASCII)뿐이고 로그인 뒤라 검색 노출면이 아니다 |

## 4. 가드 — allowlist 를 쓰지 마라

`src/__tests__/public-link-encoding-guard.test.ts` 는 **`src/` 전역을 스캔**한다.

🔴 1차 구현은 "검사할 파일 목록"을 손으로 적었고, 그래서 시리즈 허브와 가이드를 **통째로 빠뜨렸다.**
목록 관리형 가드는 새 파일을 못 잡는다.

스캐너가 실제로 놓쳤던 것 3가지 — 비슷한 도구를 또 만들면 여기부터 확인할 것:

1. `??` 의 `?` 를 문자 클래스로 막아 **경로 템플릿을 통째로 놓침**
2. `${BASE_URL}/...` 처럼 **origin 이 앞에 붙은** canonical·JSON-LD 형태를 못 봄
3. **템플릿 리터럴만** 보고 **하드코딩 문자열 상수**를 못 봄

이 세 버그 때문에 JOB canonical, `jobs/region/[sido]` JSON-LD, `guides/index.ts` 한글 경로가 뒤늦게 드러났다.
그래서 스캐너가 조용히 0건을 반환해 "통과"하는 사고를 막는 **양성 대조**와 **"죽은 면제 금지"** 검사를 함께 뒀다.

부수 정리: 보드 slug 를 담은 지역변수 이름을 `slug` → `boardSlug` 로 바로잡았다(sitemap·`posts.ts`).
글 slug 와 이름이 겹쳐 인코딩 판단이 헷갈렸다.

## 5. 배포 후 production 재검증 — 기술 검증 PASS

`2026.09.15-45e7461` 배포 확인 후 실측(2026-09-15).

🔴 **여기서 PASS 한 것은 "우리가 내보내는 URL 표기가 규격에 맞다"까지다.**
네이버가 그 URL 을 실제로 수집하는지는 §6 의 Search Advisor 검사로만 확인할 수 있고, **아직 대기 중**이다.

| 항목 | 배포 전 | 배포 후 |
|---|---|---|
| `/sitemap.xml` 응답 | 200 | **200** · XML 파싱 정상 |
| `<loc>` 총계 | 229 | **229** |
| raw 한글 `<loc>` | **138** | **0** |
| `%25` 이중 인코딩 | 0 | **0** |
| `decodeURI` 경로 집합 | — | **배포 전과 동일** (가리키는 대상 불변) |
| sitemap URL 전수 (Yeti UA) | — | **229/229 모두 200** |
| sitemap == canonical == og:url | — | 대표 4건 **바이트 단위 일치** |
| 공개면 raw 한글 `href` | 아래 별표 참조 | **21개 페이지 스캔 · 출현 0회** |
| `/` `/community` `/magazine` `/jobs` `/api/health` | — | **전부 200** |

### 공개면 raw 한글 `href` — 분모를 나눠 적는다

🔴 이전 판에서 `8 + 5 + 10 + 3` 과 "21곳"을 한 칸에 적었다. **둘은 단위도 측정 시점도 다르다.**
`26` 은 **출현 횟수**, `21` 은 **스캔한 페이지 수**다. 게다가 `5` 는 배포 전 production 이 아니라 preview 중간 상태에서 잰 값이다.

| 시점 | 스캔한 페이지 | raw 한글 `href` 출현 |
|---|---|---|
| **배포 전 production** (2026-09-15) | **3개** — `/guide` · `/topic/second-act` · `/magazine` | **21회** (8 · 10 · 3) |
| preview 중간 상태 `83c0d1ac` | 1개 — `/guide/<slug>` 상세 | 5회 — 하드코딩 데이터(`guides/index.ts`)가 원인. **배포 전 production 에서는 직접 재지 않았다** |
| **배포 후 production** | **21개** — 목록·허브 11 + 대표 상세 10(매거진 3 · 커뮤니티 3 · 가이드 2 · JOB 2) | **0회** |

배포 전후의 페이지 집합이 다르므로 `21회 → 0회` 를 같은 분모의 감소로 읽으면 안 된다.
배포 후 21개 페이지에는 배포 전에 쟀던 3개 페이지가 **모두 포함**되고, 그 3개에서도 출현 0회다.

### 게이트

tsc 0 · eslint error 0 · CI fail 0(E2E Smoke·Lighthouse·quality·Vercel·seo-guard 전부 pass).
`seo-guard` 는 `sitemap.ts` 변경이라 `seo-reviewed` 라벨로 통과했다.

## 6. 남은 창업자 액션 — 네이버 URL 검사

서치어드바이저 URL 검사는 **로그인이 필요한 웹 UI**다. 자격증명이 없고
`agents/cmo/seo-snapshot.ts` 에도 "네이버는 측정 대상이 아니다 — 서치어드바이저에서 창업자가 별도 확인"으로 적혀 있다.

아래 3개는 **현재 sitemap 에 실린 한글 매거진 URL 전부**다. 그대로 복사해 검사하면 된다.

```
https://age-doesnt-matter.com/magazine/%EC%B9%9C%EA%B5%AC%EA%B0%80-%EA%B7%B8%EB%A6%AC%EC%9A%B4%EB%8D%B0-%EC%99%9C-%EB%AA%BB-%EB%8B%A4%EA%B0%80%EA%B0%88%EA%B9%8C
https://age-doesnt-matter.com/magazine/IRP%EC%97%B0%EA%B8%88%EC%A0%80%EC%B6%95ISA-%EB%82%B4-%EB%8F%88-%EA%B7%B8%EB%A6%87-%EC%88%9C%EC%84%9C
https://age-doesnt-matter.com/magazine/50%EB%8C%80-%EC%9D%B4%EB%A0%A5%EC%84%9C-%EC%9D%B4%EB%A0%87%EA%B2%8C-%EC%93%B0%EC%84%B8%EC%9A%94
```

각각 `/magazine/친구가-그리운데-왜-못-다가갈까` · `/magazine/IRP연금저축ISA-내-돈-그릇-순서` · `/magazine/50대-이력서-이렇게-쓰세요` 다.

### sitemap 재등록 — 지금은 하지 않는다 (영구 금지가 아니다)

등록일 2026-08-19 는 이 문제의 원인이 아니었고, `/sitemap.xml` 은 같은 경로에서 200 으로 정상 응답한다.
**같은 endpoint 가 정상인 동안에는 삭제·재등록이 불필요하다** — 등록을 건드리면 수집 이력만 잃는다.

**재검토해야 하는 경우:**

| 조건 | 왜 |
|---|---|
| sitemap **endpoint 가 바뀜** — 도메인 변경, 경로 변경, sitemap index 분할 | 등록된 URL 이 더 이상 유효하지 않다 |
| Search Advisor 가 **명시적 수집 오류**를 보고 — fetch 실패, parse 오류, 등록 상태 이상 | 등록 자체에 문제가 생긴 것이라 재등록이 해법일 수 있다 |

위 조건이 아닌데 "색인이 안 늘어서" 같은 이유로 재등록하지는 않는다.

## 7. 기록해 둘 사실

- merge 시 PR 제목의 `[merge 금지]` 를 떼지 않아 **squash 커밋 메시지에 그대로 남았다**(`45e74616`).
  main history 는 rewrite 하지 않는다. 실제 상태는 **merge 완료**다.
- 로컬 `npm run build` 는 전용 worktree 에 도달 가능한 DB 가 없어 prerender 단계에서 `P1001` 로 멈춘다.
  **빌드 판정은 CI·Vercel 기준**이다.
