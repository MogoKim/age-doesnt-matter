# 커뮤니티 게시판 (F04)

> 최초 작성: 2026-05-11 | 최근 수정: 2026-05-11

---

## 목표

50·60대 사용자가 일상, 유머, 인생 2막 등 주제로 글을 쓰고 소통하는 핵심 커뮤니티 공간.  
SEO 최적화를 통해 검색 유입을 확보하고, 시니어 친화 UI로 낮은 진입 장벽을 유지한다.

---

## 코드 위치

| 경로 | 역할 |
|------|------|
| `src/app/(main)/community/` | App Router 페이지 (목록 · 상세 · 작성) |
| `src/components/features/community/` | 커뮤니티 전용 컴포넌트 |

---

## SEO 구현 현황

| 항목 | 상태 |
|------|------|
| generateMetadata() | ✅ (og:title, twitter:card, canonical) |
| Article JSON-LD | ✅ (headline, image, datePublished, author, publisher) |
| BreadcrumbList JSON-LD | ✅ (buildBreadcrumbJsonLd 활용) |

---

## 수정 이력

| 날짜 | 내용 | 이유 |
|------|------|------|
| 2026-05-11 | Article JSON-LD에 `image` 필드 추가 + description 본문 추출 개선 | Google Article 리치 결과 필수 필드 누락 수정 |
