# 우나어 정적 기록관 전환 — 백업·산출물 기록 (2026-10-01)

> 창업자 결정(2026-10-01): 공지·요청 기간 없이 최대한 빨리 월 0원 정적 보존으로 전환.
> 이 문서는 **비파괴 단계(백업·검증·산출물·PR)** 기록이다. DNS·요금제·workflow·운영 DB·R2 공개 설정은 바뀌지 않았다.

## 1. 공개 범위 (KEEP_PUBLIC = 13 URL)

| 구분 | URL |
|---|---|
| 기록관 문안(신규) | `/` · `/about` · `/privacy`(개인정보 안내) · `/terms`(이용 안내) |
| 자체 제작 가이드 | `/guide` + `src/lib/guides` 의 8편 |

- 입력은 **코드 상수뿐**(`src/lib/guides`, `scripts/static-archive/content.ts`). DB·운영 HTML·R2 를 읽지 않으므로
  회원 닉네임·글·댓글·프로필·계정 링크가 섞일 경로가 없다.
- 가이드의 `communityLinks` 전부 제외, `relatedLinks` 는 남는 가이드끼리만.
- 제거(REMOVE_PUBLIC): `/jobs/**`, `/community/**`, `/magazine/**`(소유권 불명확 → 기본 제외), `/topic/**`, `/rules`,
  로그인·가입·검색·베스트·마이·글쓰기·어드민·API·이벤트·문의, `ads.txt`·`app-ads.txt`·`sw.js`·`manifest.json`.
  대체 콘텐츠가 없으므로 **실제 404**. 301 은 `/faq → /about` 1건만.
- `robots.txt` 는 기존과 바이트 동일. `sitemap.xml` 은 13 URL.

## 2. 산출물·게이트

```bash
npx tsx scripts/static-archive/build.ts  --out <저장소 밖 경로>
npx tsx scripts/static-archive/verify.ts --out <같은 경로> [--baseline <유지 URL 기준선 json>]
```

| 게이트 | 내용 |
|---|---|
| G1 | 페이지 파일 = 허용 목록 1:1 |
| G2 | 금지 흔적 0: `_next`·`r2.dev`·`r2.cloudflarestorage.com`·`img.` 도메인·AdSense·쿠팡·GA/GTM·Kakao·서비스워커·Vercel·Turnstile·`/api/`·폼 컨트롤·인라인 핸들러·회원 경로. `<script>` 는 `ld+json` 만 |
| G3/G4 | 내부 링크·자산 전부 실재, 외부 참조 0, 이미지 전부 로컬 |
| G5 | canonical 자기 URL·`index, follow`·h1 1개 |
| G6 | 유지 URL(가이드 9쪽) title·description·canonical 이 운영 기준선과 동일 |
| G7 | robots.txt 동일 · sitemap = 허용 목록 |
| G8 | Cloudflare Pages 한도(파일 2만·파일당 25MiB) |
| G9 | 404.html noindex · `_redirects` 대상 실재 |

결과(2026-10-01): **PASS** — 13 URL · 파일 21개 · 120KB · 이미지 참조 0(파비콘만) · 기준선 9/9 일치.
음성 검증: 위반을 주입한 사본에서 11종 전부 FAIL 로 잡힘.
로컬 Pages 런타임(`wrangler pages dev`): 13/13 200 · 제거 경로 404 · `/faq` 301 · 한글 경로 raw/인코딩 모두 200 ·
390/1440px 가로 스크롤 0 · 52px 미만 링크 0 · 로드 리소스 CSS·파비콘뿐.

## 3. 백업 (저장소 밖 암호화 이미지 — 경로·키는 창업자에게 별도 보고)

| 항목 | 검증 |
|---|---|
| DB `public` 스키마 (`pg_dump -Fc`, 단일 REPEATABLE READ 스냅샷) | 로컬 PG17 복원 exit 0 · **47 테이블 행 수·내용 해시 0건 차이(EventLog·BotLog 포함)** · PK/FK/UQ 47/34/2 · 인덱스 186 · RLS 정책 40 운영과 동일 |
| auth.users / storage.objects | 0 / 0 (미사용 확정) |
| R2 전체 | 2,889 객체 · 1,511,509,794 B · 2,889/2,889 MD5=ETag |
| 설정 | DNS 공개 조회 · env 키 이름(값 없음) · GitHub Secrets 이름 · workflow 상태 · launchd plist |
| 사이트 기준선 | 기존 sitemap 227 URL HTML·robots·sitemap |

롤백 보관 기한: **7일**. 이후 원본 백업 파기와 Supabase 프로젝트 삭제는 **별도 파괴적 승인** 대상.

## 4. 아직 하지 않은 것 (승인 대기)

Cloudflare Pages Preview 배포(인증 없음) · production DNS · Vercel/Supabase 요금제 · workflow 중지 ·
R2 공개 차단 · 운영 DB 변경 · merge·운영 배포.
