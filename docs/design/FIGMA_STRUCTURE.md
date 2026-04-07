# Figma 파일 구조 가이드

> 에이전트가 자동으로 생성 및 관리. 창업자 수동 작업 불필요.
> Figma 계정 MCP 인증 1회만 필요.

---

## 파일 3개 구조

### 파일 1: 🎨 Design System
**용도**: 디자인 토큰 원본. 모든 화면이 이 파일의 Variables를 참조.

| 페이지 | 내용 |
|--------|------|
| Color & Typography | DESIGN.md의 18개 컬러 토큰 + 8개 타이포 스케일 |
| Components | 버튼, 카드, 인풋, 모달, 배지, 탭, 드롭다운 |
| Icons | 서비스 사용 아이콘 세트 |

**자동 생성 명령**: `design-system-sync.ts`가 DESIGN.md 읽어서 등록

### 파일 2: 📱 UI Screens
**용도**: 실제 서비스 화면. 기능 개발 전 여기에 먼저 그림.

| 페이지 | 코드 소스 | 상태 |
|--------|----------|------|
| 홈 | `src/app/(main)/page.tsx` | 역공학 대기 |
| 커뮤니티 게시판 | `src/app/(main)/community/` | 역공학 대기 |
| 게시글 상세 | `src/app/(main)/community/stories/[id]/` | 역공학 대기 |
| 마이페이지 | `src/app/(main)/my/` | 역공학 대기 |
| 온보딩 플로우 | `src/app/(main)/onboarding/` | 역공학 대기 |
| Best 페이지 | `src/app/(main)/best/` | 역공학 대기 |
| User Flows | — | 화살표 연결 |
| [신규 기능] | — | 승인 후 추가 |

**프레임 규칙**:
- 데스크탑: 1440px × 900px
- 모바일: 390px × 844px
- 배치: 데스크탑 왼쪽, 모바일 오른쪽 (120px 간격)

### 파일 3: 📣 Marketing Assets
**용도**: 광고/SNS/매거진 소재 템플릿.

| 페이지 | 사이즈 | 용도 |
|--------|--------|------|
| 구글 애즈 | 1200×628, 300×250, 160×600 | 구글 디스플레이 광고 |
| 인스타그램 | 1080×1080, 1080×1920 | 피드 + 스토리 |
| 페이스북 | 1200×628 | 페이스북 광고 |
| 매거진 | 800×450 | 매거진 썸네일 |

---

## 디자인 토큰 (Figma Variables로 등록)

### 컬러
```
primary: #FF6F61          — 브랜드 코랄 (버튼, 강조)
primary-text: #C4453B     — 텍스트용 코랄 (WCAG AA)
background: #F8F9FA       — 페이지 배경
foreground: #111827       — 기본 텍스트
card: #FFFFFF             — 카드/서피스
border: #E5E7EB           — 테두리
muted: #F1F3F5            — 비활성 배경
muted-foreground: #6B7280 — 힌트 텍스트
destructive: #F44336      — 에러/삭제
```

### 타이포그래피
```
폰트: Pretendard Variable
xs:   15px / 1.4  — 캡션, 배지 (최소)
sm:   16px / 1.5  — 보조 텍스트
base: 18px / 1.6  — 본문 (기본)
lg:   20px / 1.6  — 서브헤딩
xl:   24px / 1.4  — 섹션 제목
2xl:  28px / 1.3  — 페이지 헤딩
3xl:  36px / 1.2  — 히어로 텍스트
```

### 간격
```
터치 타겟: 52px × 52px (모바일)
버튼 높이: 52px (모바일) / 48px (데스크탑)
카드 패딩: 16px
섹션 간격: 24px
```

---

## Naming Convention

```
프레임: [페이지명]/Desktop | [페이지명]/Mobile
컴포넌트: Button/Primary | Card/Post | Input/Text
플로우 화살표: Flow/[출발] → [도착]
광고 소재: Ads/[캠페인명]/[사이즈]/[버전]
```

---

## 업데이트 규칙

1. 코드에서 컬러/폰트 변경 → DESIGN.md 먼저 수정 → `design-system-sync.ts` 실행 → Figma 자동 업데이트
2. Figma에서 레이아웃 변경 → 창업자 승인 → 코드 수정
3. 신규 기능 추가 → UI Screens에 새 페이지 추가 → 승인 → 코딩
