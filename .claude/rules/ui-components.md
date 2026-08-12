---
paths:
  - "src/components/**/*.tsx"
globs: src/components/**/*.tsx
---

# UI 컴포넌트 규칙 (시니어 친화)

- 터치 타겟: 최소 52x52px
- 폰트 최소: 본문 17px / caption·배지 14px (constitution.yaml 기준) — 구현 목표: 본문 18px
- 버튼 높이: 52px (모바일) / 48px (데스크탑)
- 브랜드 컬러: --color-primary (#FF6F61)
- 모달: 모바일=하단 풀스크린 시트 / 데스크탑=중앙 팝업
- CSS: cn() 유틸 사용 (clsx + tailwind-merge)
- 서버 컴포넌트 기본, 'use client' 최소화
- 이미지: next/image 필수 (WebP + lazy load)

## cn() + 글씨 크기 토큰 규칙 (재발 방지)
- `cn()` 안에서는 커스텀 폰트 유틸 `text-caption` / `text-body`를 쓰지 않는다.
  - 이유: `tailwind-merge`가 커스텀 `text-*` 폰트 유틸을 글자색 그룹으로 오인해, 뒤에 오는 `text-primary-text` / `text-foreground` 같은 색상 클래스가 폰트 클래스를 삭제한다.
  - 실제 회귀: 댓글 투표 진영 배지와 공감 누른 댓글 버튼에서 글씨 크기 토큰이 사라진 사례가 있었다.
- 대체 규칙: `cn()` 내부에서는 Tailwind 기본 폰트 클래스를 쓴다.
  - caption 크기 필요: `text-xs` (프로젝트에서 `var(--text-caption)`에 매핑됨)
  - body 크기 필요: `text-base` (프로젝트에서 `var(--text-body)`에 매핑됨)
- `cn()` 밖의 일반 문자열 className에서는 `text-caption` / `text-body` 사용 가능하다.
- `cn()`으로 조건부 색상(`text-primary-text`, `text-muted-foreground`, `text-foreground`)과 폰트 크기를 함께 합칠 때는 computed font-size를 NORMAL/LARGE/XLARGE에서 확인한다.

## button 테두리 규칙 (재발 방지)

`<button>`에 테두리를 의도할 때는 **width + style + color를 모두 명시**한다.

- ❌ `border border-primary/30` — 선이 **안 보인다**
- ✅ `border-[1.5px] border-solid border-primary/30`

**이유**: `src/app/globals.css`의 전역 리셋에 `button { border: none }`이 있다. Tailwind의 `border`는 **width만** 지정하고 style은 preflight의 `border-style: solid`(`*` 선택자, 특이도 0)에 의존하는데, `button` 요소 선택자가 이를 이겨 `border-style: none`이 남는다. **style이 `none`이면 브라우저가 width를 0으로 계산**하므로 클래스는 살아 있는데 선만 사라진다.

**실제 사례 (PR #237)**: ActionBar 공감 버튼을 윤곽선형으로 바꾸며 `border border-primary/30`으로 구현 → DOM에 클래스는 그대로 있는데 computed `borderWidth: 0px` / `borderStyle: none`. `border-[1.5px] border-solid`로 수정해 해결.

**검증 방법**: `typecheck` / `eslint` / `build` **전부 통과하므로 잡히지 않는다.** 브라우저 computed style로 `borderWidth`·`borderStyle`을 직접 확인해야 한다.

> ⚠️ 이 함정은 위 **cn() + 글씨 크기 토큰 규칙**과 같은 계열이다 —
> **"빌드는 통과하지만 런타임에 스타일이 사라지는 함정".**
> 두 경우 모두 클래스 문자열은 DOM에 남아 있어 코드 리뷰로는 발견되지 않고,
> **computed style 실측으로만** 드러난다. UI 작업 후 스타일이 의도대로 보이는지
> 브라우저에서 반드시 확인할 것.

## Primary Color 컨트라스트 규칙 (절대 준수 — WCAG)
- `bg-primary` 사용 시: `text-white` 필수 (`text-foreground` / `text-muted` 금지)
- `bg-primary/10~30` (투명도) 사용 시: `text-primary-text` (#E85D50) 사용
  - ⚠️ #E85D50은 흰 배경 대비 3.4:1 (큰 글씨 AA 통과 / 작은 caption·배지는 경계) — 작은 텍스트엔 배경 톤·굵기로 가독성 보강
- SVG 아이콘: `stroke="currentColor"` / `fill="currentColor"` 필수 (하드코딩 색상 금지)
- hover 변형 (`bg-primary/90`, `bg-[#E85D50]`) 시에도 `text-white` 유지
- 점/인디케이터 등 텍스트 없는 `bg-primary` 사용은 예외
