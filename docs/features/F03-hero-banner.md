# 히어로 배너 운영 기획서 (F03)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

홈 방문자에게 서비스 가치를 3개 슬라이드로 즉각 전달하고 핵심 섹션으로 유도한다.  
LCP 최적화로 첫 인상 속도를 확보하고, 어드민에서 배너를 즉시 교체할 수 있도록 DB 기반으로 운영한다.

---

## 배경

- 홈 진입 후 3초 내 서비스 정체성을 인지시켜야 회원가입 전환율 향상
- 50~60대 사용자 → 큰 글씨 + 강한 대비 + 단순한 CTA 필수
- 마케팅 캠페인 대응을 위해 코드 배포 없이 어드민에서 배너 교체 가능한 구조

---

## 세부 기획

### 컴포넌트 구조

| 파일 | 유형 | 역할 |
|------|------|------|
| `src/components/features/home/HeroSlider.tsx` | 서버 컴포넌트 | DB에서 활성 배너 조회 + 폴백 슬라이드 정의 |
| `src/components/features/home/HeroSliderClient.tsx` | 클라이언트 컴포넌트 | 슬라이더 렌더링, 자동재생, 터치/마우스 인터랙션 |

마운트: `src/app/(main)/page.tsx` line 129 — `<HeroSlider />`

---

### 슬라이드 구성

#### 폴백 슬라이드 3개 (DB 배너 없을 때 사용)

| 순서 | 제목 | 부제 | CTA 버튼 | 이동 경로 | 테마색 |
|------|------|------|---------|---------|--------|
| 1 | 우리 또래끼리<br>나이 걱정 없이 | 50·60대 커뮤니티, 우나어 | 시작하기 | `/about` | Coral (#C4453B→#FF6F61→#FFB4A2) |
| 2 | 사는 이야기<br>함께 나눠요 | 공감이 넘치는 소통 공간 | 이야기 보러가기 | `/community/stories` | Orange (#C7651E→#E89456→#FAC775) |
| 3 | 인생 2막<br>같이 준비해요 | 일자리부터 재취업까지 | 내일 찾기 | `/jobs` | Green (#1B5E20→#4A8C3A→#97C459) |

#### DB 배너 (어드민 운영)
- `getActiveBanners()` 조회 — 캐시 없음 (즉시 반영)
- Prisma 모델: `Banner` — id, title, subtitle, ctaText, ctaUrl, imageUrl, gradient, isActive

---

### 이미지

| 파일 | 해상도 | 포맷 |
|------|--------|------|
| `/public/images/hero/hero_1.jpg` | 1920×1194 | JPEG |
| `/public/images/hero/hero_2.jpg` | 1920×1071 | JPEG |
| `/public/images/hero/hero_3.jpg` | 1920×1071 | JPEG |

- `next/image` 사용, `fill` + `object-cover object-center`
- `priority={index === 0}` — 첫 슬라이드만 LCP 우선 로드
- `sizes="100vw"` — viewport 기준 자동 최적화
- 이미지 없는 슬라이드: 그라디언트 배경 사용

---

### 반응형 레이아웃

| 기기 | Aspect Ratio | 제목 폰트 | 부제 폰트 | CTA 높이 |
|------|-------------|---------|---------|---------|
| 모바일 | `3/2` (~260px) | clamp(20px, 5.5vw, 32px) | clamp(15px, 3.5vw, 18px) | 52px |
| 데스크탑 (lg+) | `8/3` (~150px) | clamp(20px, 5.5vw, 32px) | clamp(15px, 3.5vw, 18px) | 52px |

최소 높이: 200px (양쪽 공통)

**텍스트 정렬**:
- 이미지 있음: 좌측 정렬 (`items-start text-left`), 최대 너비 72%
- 이미지 없음: 중앙 정렬 (`items-center text-center`)

---

### 인터랙션

| 기능 | 구현 | 설정값 |
|------|------|--------|
| 자동 전환 | `setInterval()` | 5,000ms |
| 호버/포커스 | 자동재생 일시정지 | - |
| 터치 스와이프 | touchstart/touchend | 50px 임계값 |
| 클릭 | 전체 슬라이드 → ctaUrl 이동 | `<Link>` 래핑 |
| 인디케이터 닷 | 활성: w-5 h-2, 비활성: w-2 h-2 | 300ms 전환 |
| 슬라이드 페이드 | opacity 0↔1 | 500ms |
| 화살표 버튼 | hover bg-black/35 | - |

---

### CTA 버튼

- `span` 사용 (부모 `<Link>`와 중첩 방지)
- 스타일: `bg-white/20 backdrop-blur-sm text-white font-semibold rounded-full`
- 높이: 52px (시니어 터치 타겟 규칙 준수 — CLAUDE.md)
- 최소 너비: 110px

---

### 성능

- **LCP**: 첫 슬라이드 `priority=true` → 브라우저 preload 처리
- **Lazy Load**: 나머지 슬라이드 이미지 자동 lazy
- **DB 캐시**: 없음 (배너 교체 즉시 반영)
- **홈 다른 데이터**: `unstable_cache()` 60초 (히어로는 제외)

---

## 관련 링크

- 서버 컴포넌트: `src/components/features/home/HeroSlider.tsx`
- 클라이언트 컴포넌트: `src/components/features/home/HeroSliderClient.tsx`
- 마운트 위치: `src/app/(main)/page.tsx`
- 히어로 이미지: `public/images/hero/`
- DB 모델: `prisma/schema.prisma` — Banner

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-26 | imageUrl 필드 추가, 좌측 어두운 오버레이 적용 | 실사 이미지 배너 지원 |
| 2026-04-27 | 모바일 aspect-ratio 3/2, CTA 높이 44→52px, `\n` 줄바꿈 렌더 수정, 전체 클릭 링크, 폰트 15px 최소 | 모바일 UX 최적화 |
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04-27 | 제목 `\n` 이 화면에 그대로 노출 | JSX에서 `\n`은 자동 줄바꿈 아님 | `whitespace-pre-line` 또는 `<br/>` 처리로 수정 |
| 진행중 | HeroSlider.tsx line 15 주석 outdated | "그라디언트 전용" → 현재 이미지 지원으로 전환됨 | 주석 정리 권장 (기능 영향 없음) |
| 진행중 | Banner 스키마 description/linkUrl/priority 필드 deprecated | imageUrl 마이그레이션으로 대체 | DROP 마이그레이션 예정 |
