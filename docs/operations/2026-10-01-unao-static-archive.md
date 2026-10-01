# 우나어 정적 기록관 전환 — 백업·산출물 기록 (2026-10-01)

> 창업자 결정(2026-10-01): 공지·요청 기간 없이 최대한 빨리 월 0원 정적 보존으로 전환.
> 이 문서는 **비파괴 단계(백업·검증·산출물·PR)** 기록이다. DNS·요금제·workflow·운영 DB·R2 공개 설정은 바뀌지 않았다.

## 1. 공개 범위 (KEEP_PUBLIC = 13 URL)

| 구분 | URL |
|---|---|
| 기록관 문안(신규) | `/` · `/about` · `/privacy`(개인정보 안내) · `/terms`(이용 안내) — 읽기 전용 기록관 안내는 홈·소개에만 |
| 우나어에서 정리한 생활 가이드 | `/guide` + `src/lib/guides` 의 8편 (출력 전용 문안 보정: `guide-overrides.ts`) |

- 입력은 **코드 상수뿐**(`src/lib/guides`, `scripts/static-archive/content.ts`). DB·운영 HTML·R2 를 읽지 않으므로
  회원 닉네임·글·댓글·프로필·계정 링크가 섞일 경로가 없다.
- 가이드의 `communityLinks` 전부 제외, `relatedLinks` 는 남는 가이드끼리만.
- `guide-overrides.ts`: 원본은 그대로 두고 출력에서만 "아래 커뮤니티"·"실제 후기/이야기"·"우나어 일자리 정보"·"후기가 많아요"·"실버타운"
  같은 사라진 기능·회원 이야기 암시와 금지 표현을 바꾼다. 원문에 없는 override 는 테스트가 실패시킨다.
- 모든 페이지 공통 공지 띠 없음. title 접미사는 ` | 우리 나이가 어때서` ("여성 커뮤니티" 제거).
- 제거(REMOVE_PUBLIC): `/jobs/**`, `/community/**`, `/magazine/**`(소유권 불명확 → 기본 제외), `/topic/**`, `/rules`,
  로그인·가입·검색·베스트·마이·글쓰기·어드민·API·이벤트·문의, `ads.txt`·`app-ads.txt`·`sw.js`·`manifest.json`.
  대체 콘텐츠가 없으므로 **실제 404**. 301 은 `/faq → /about` 1건만.
- `robots.txt` 는 기존과 바이트 동일. `sitemap.xml` 은 13 URL.

## 2. 산출물·게이트

```bash
npx tsx scripts/static-archive/build.ts  --out <존재하지 않는 새 경로>   # 저장소·내부·상위·홈·루트·기존 경로는 exit 2
npx tsx scripts/static-archive/verify.ts --out <같은 경로>               # expected-manifest.json 과 항상 대조
npx tsx --test scripts/static-archive/static-archive.test.ts         # 빌더·게이트 테스트
```

| 게이트 | 내용 |
|---|---|
| G1 | 페이지 파일 = 허용 목록 1:1 |
| G2 | 금지 흔적 0: `_next`·`r2.dev`·`r2.cloudflarestorage.com`·`img.` 도메인·AdSense·쿠팡·GA/GTM·Kakao·서비스워커·Vercel·Turnstile·`/api/`·폼 컨트롤·인라인 핸들러·회원 경로. `<script>` 는 `ld+json` 만 |
| G3/G4 | 내부 링크·자산 전부 실재, 외부 참조 0, 이미지 전부 로컬 |
| G5 | canonical 자기 URL·`index, follow`·h1 1개 |
| G6 | 저장소의 검토용 `expected-manifest.json`(13 URL·title·description·canonical)과 **13/13 일치** 필수 |
| G7 | robots.txt 동일 · sitemap = 허용 목록 |
| G8 | Cloudflare Pages 한도(파일 2만·파일당 25MiB) |
| G9 | 404.html noindex · `_redirects` 대상 실재 |
| G10 | 사라진 커뮤니티·회원 이야기·일자리 기능 암시 문구 0 |
| G11 | 금지 표현(시니어·어르신·노인·실버) 0 |

### 검증 결과 — 실행 위치를 구분한다

| 실행 위치 | 내용 | 결과 |
|---|---|---|
| **로컬** | `static-archive.test.ts` (11건: 위험 경로·기존 경로 거부, 삭제 API 부재, manifest 13/13, 금지 문자열·허용 밖 페이지·커뮤니티 암시 주입 FAIL, 오탐 방지, 낡은 override 0) | 구현 전 7 FAIL → 구현 후 11/11 PASS |
| **로컬** | `verify.ts` | PASS · manifest 13/13 · 파일 21 · 이미지 참조 0 |
| **로컬** | CLI 오입력 8종(`.`·`scripts`·`..`·`~`·`/`·기존 디렉터리·부모 없음·저장소 내부) | 전부 exit 2 · 보초 파일·저장소 상태 무변경 |
| **로컬** | `wrangler pages dev`(Cloudflare Pages 런타임 로컬 실행) | 13/13 200 · 제거 경로 404 · `/faq` 301 · 한글 raw 경로 200 |
| **로컬** | `tsc --noEmit` · `tsc -p tsconfig.ops.json` · ESLint | 0 / 0 / 0 |
| **CI** | PR #502 | `ops-typecheck`·Lighthouse 통과. **앱 Lint/Typecheck/Test/Build·E2E·seo-guard 는 SKIPPED**(변경 감지 필터상 대상 아님) — CI 는 정적 산출물을 검증하지 않는다 |
| **미실행** | Cloudflare Pages Preview(실제 원격 배포) | 미승인 |

## 3. 백업 (저장소 밖 암호화 이미지 — 경로·키는 창업자에게 별도 보고)

| 항목 | 검증 |
|---|---|
| DB `public` 스키마 (`pg_dump -Fc`, 단일 REPEATABLE READ 스냅샷) | 로컬 PG17 복원 exit 0 · **47 테이블 행 수·내용 해시 0건 차이(EventLog·BotLog 포함)** · PK/FK/UQ 47/34/2 · 인덱스 186 · RLS 정책 40 운영과 동일 |
| auth.users / storage.objects | 0 / 0 (미사용 확정) |
| R2 전체 | 2,889 객체 · 1,511,509,794 B · 2,889/2,889 MD5=ETag |
| 설정 | DNS 공개 조회 · env 키 이름(값 없음) · GitHub Secrets 이름 · workflow 상태 · launchd plist |
| 사이트 기준선 | 기존 sitemap 227 URL HTML·robots·sitemap |

롤백 보관 기한: **최종 동결 백업 후 DNS 전환이 성공한 날부터 7일**. 이 문서의 2026-10-01 백업은 1차 백업이며,
쓰기 동결 직후 최종 백업을 다시 받는다. 기한 후 원본 백업 파기와 Supabase 프로젝트 삭제는 **별도 파괴적 승인** 대상.

## 4. 아직 하지 않은 것 (승인 대기)

Cloudflare Pages Preview 배포(인증 없음) · production DNS · Vercel/Supabase 요금제 · workflow 중지 ·
R2 공개 차단 · 운영 DB 변경 · merge·운영 배포.
