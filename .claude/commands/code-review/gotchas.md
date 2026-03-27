# 코드 리뷰 Gotchas — 자주 놓치는 지점

1. **'use client' 남발** — 서버 컴포넌트가 기본. useState/useEffect 없으면 'use client' 불필요. 매번 확인.

2. **next/image 대신 img 태그** — 카드뉴스 템플릿(HTML)에서는 img OK, Next.js 페이지에서는 반드시 next/image.

3. **any 타입 슬쩍 사용** — TypeScript strict 모드지만 에러 핸들러에서 `catch (err: any)` 습관. `unknown`으로 쓰고 타입 가드.

4. **환경변수 직접 참조** — `process.env.XXX` 대신 `src/lib/env.ts`의 export 사용. 누락 시 조기 감지.

5. **모바일 반응형 미확인** — 767px 브레이크포인트에서 레이아웃 깨짐 자주 발생. Tailwind의 `md:` 사용 패턴 확인.

6. **시니어 용어 체크** — 코드 내 주석/문자열에서 "시니어" 사용 여부. grep으로 전수 검사.
