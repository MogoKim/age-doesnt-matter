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
