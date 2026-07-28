---
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

## Primary Color 컨트라스트 규칙 (절대 준수 — WCAG)
- `bg-primary` 사용 시: `text-white` 필수 (`text-foreground` / `text-muted` 금지)
- `bg-primary/10~30` (투명도) 사용 시: `text-primary-text` (#E85D50) 사용
  - ⚠️ #E85D50은 흰 배경 대비 3.4:1 (큰 글씨 AA 통과 / 작은 caption·배지는 경계) — 작은 텍스트엔 배경 톤·굵기로 가독성 보강
- SVG 아이콘: `stroke="currentColor"` / `fill="currentColor"` 필수 (하드코딩 색상 금지)
- hover 변형 (`bg-primary/90`, `bg-[#E85D50]`) 시에도 `text-white` 유지
- 점/인디케이터 등 텍스트 없는 `bg-primary` 사용은 예외
