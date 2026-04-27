---
globs: src/components/**/*.tsx
---

# UI 컴포넌트 규칙 (시니어 친화)

- 터치 타겟: 최소 52x52px
- 폰트 최소: 15px (caption/배지만, 본문 18px 베이스)
- 버튼 높이: 52px (모바일) / 48px (데스크탑)
- 브랜드 컬러: --color-primary (#FF6F61)
- 모달: 모바일=하단 풀스크린 시트 / 데스크탑=중앙 팝업
- CSS: cn() 유틸 사용 (clsx + tailwind-merge)
- 서버 컴포넌트 기본, 'use client' 최소화
- 이미지: next/image 필수 (WebP + lazy load)

## Primary Color 컨트라스트 규칙 (절대 준수 — WCAG)
- `bg-primary` 사용 시: `text-white` 필수 (`text-foreground` / `text-muted` 금지)
- `bg-primary/10~30` (투명도) 사용 시: `text-primary-text` (#C4453B) 사용
- SVG 아이콘: `stroke="currentColor"` / `fill="currentColor"` 필수 (하드코딩 색상 금지)
- hover 변형 (`bg-primary/90`, `bg-[#E85D50]`) 시에도 `text-white` 유지
- 점/인디케이터 등 텍스트 없는 `bg-primary` 사용은 예외
