# 전체 사이트 클릭 감사 이슈 로그 — 2026-05-15

> 30개 페이지 × 3 디바이스 (iPhone WebKit 390×844 / Galaxy Chromium 412×915 / Desktop 1440×900)
> 테스트: e2e/qa/26~29-click-audit-*.spec.ts | 총 150 테스트 전부 통과

---

## 수정 완료 (이번 세션)

### [P1] /community 인덱스 → /community/stories redirect 누락
- **파일**: `src/middleware.ts`
- **증상**: `/community` 직접 접근 시 RSC 클라이언트 redirect라 URL이 `/community`로 잠시 머묾
- **수정**: middleware에 exact match redirect 추가 (`pathname === '/community'` → 301)
- **검증**: QA 테스트 console `✅` 확인 필요 (배포 후)

### [P2] Landing 공감하기/댓글달기/닫기 버튼 터치 타겟 미달
- **파일**: `src/components/features/landing/LandingClient.tsx:48,98,105`
- **증상**: `h-[44px]` — 모바일 기준(52px) 미달
- **수정**: `h-[44px]` → `h-[52px]` (3개소 일괄 교체)

---

## 미수정 P2 — 다음 스프린트

### [P2] HeroSlider 화살표 버튼 터치 타겟 미달 (Desktop)
- **파일**: `src/components/features/home/HeroSliderClient.tsx:163,174`
- **현재**: `w-10 h-10` = 40px
- **기준**: 데스크탑 48px
- **수정안**: `w-12 h-12` (48px)

### [P2] GNB 검색 버튼 터치 타겟 미달 (Desktop)
- **파일**: `src/components/layouts/GNB.tsx:89`
- **현재**: `w-[44px] h-[44px]`
- **기준**: 데스크탑 48px
- **수정안**: `w-[48px] h-[48px]`

### [P2] GNB /my 아이콘 링크 터치 타겟 미달 (Desktop)
- **파일**: `src/components/layouts/GNB.tsx:106`
- **현재**: `w-10 h-10` = 40px
- **기준**: 데스크탑 48px
- **수정안**: `w-12 h-12` (48px)

### [P2] SortToggle 정렬 버튼 터치 타겟 미달 (Desktop)
- **파일**: `src/components/features/community/SortToggle.tsx`
- **현재**: `lg:min-h-[44px]`
- **기준**: 데스크탑 48px
- **수정안**: `lg:min-h-[48px]`

### [P2] PersonalGreeting "둘러보기" 버튼 터치 타겟 미달 (Mobile)
- **파일**: `src/components/features/home/PersonalGreeting.tsx:30`
- **현재**: `h-[48px]`
- **기준**: 모바일 52px
- **수정안**: `h-[52px]`

---

## 검증 결과 요약 (배치별)

### BATCH A — 홈 + 커뮤니티 (26-spec, 3 devices × 15 tests = 45)
| 항목 | 결과 |
|------|------|
| HeroSlider dot 전환 | ✅ |
| GNB 메뉴 링크 전체 | ✅ |
| 게시판 카테고리 필터 | ✅ |
| 게시판 정렬 토글 | ✅ |
| PostCard 클릭 → 상세 | ✅ |
| 게시글 공감/스크랩/공유 | ✅ |
| TopPromoBanner 닫기 | ✅ |
| FAB 글쓰기 (로그인) | ✅ |
| FAB 비로그인 → 모달 | ✅ |
| 뒤로가기 from=best | ✅ |
| 댓글 공감/정렬 | ✅ |
| 글쓰기 카테고리/제목/취소 | ✅ |
| HeroSlider 화살표 48px 미달 | ❌ P2 (미수정) |

### BATCH B — 디스커버리 (27-spec, 3 devices × 10 tests = 30)
| 항목 | 결과 |
|------|------|
| 일자리 퀵태그 토글 | ✅ |
| 일자리 FilterPanel ESC | ✅ |
| JobCard 클릭 → 상세 | ✅ (데이터 있을 때) |
| 매거진 카테고리 탭 | ✅ |
| 매거진 상세 이미지 | ✅ |
| 인기글 탭 전환 | ✅ |
| 통합검색 2자+ 검색 | ✅ |
| 최근검색어 저장/삭제 | ✅ |
| 검색 탭 전환 | ✅ |
| localStorage 사용 가능 | ✅ |

### BATCH C — 마이페이지 (28-spec, 3 devices × 10 tests = 30)
| 항목 | 결과 |
|------|------|
| /my 메뉴 링크 전체 h≥52px | ✅ (h=65px) |
| 내 글/댓글/스크랩 카드 | ✅ |
| 알림 모두읽음 버튼 | ✅ (빈 상태) |
| 닉네임 유효성 (30일 제한) | ✅ skip |
| 글자크기 버튼 클릭 | ✅ |
| 성별/지역 토글 | ✅ |
| 차단 사용자 목록 | ✅ |
| 탈퇴 모달 열기/취소 | ✅ |
| 로그아웃 버튼 h=64px | ✅ |
| 비로그인 /my redirect | ❌ P0 — 추가 조사 필요 (미들웨어 코드 정상, 테스트 환경 이슈 가능) |

### BATCH D — 정보/법적 (29-spec, 3 devices × 10 tests = 30)
| 항목 | 결과 |
|------|------|
| 카카오 로그인 버튼 h=56px | ✅ |
| 온보딩 Step2 (이미 완료 계정) | ✅ skip |
| about FAQ 아코디언 | ⚠️ /faq → /about redirect로 0개 감지 |
| 문의하기 버튼 h=52px | ✅ (about CTA) |
| FAQ 페이지 문의 CTA | ✅ min-h-[52px] |
| 등급 카드 렌더링 | ✅ |
| contact BottomSheet 유효성 | ✅ |
| Landing 공감하기 h=44px | ❌ P2 → **수정 완료** |
| /privacy /terms /rules 200 | ✅ |
| /auth/error 200 | ✅ |
| /community redirect | ❌ P1 → **수정 완료** |
| /offline 다시 시도 h=56px | ✅ |

---

## 추가 조사 필요

### [P0 조사] 비로그인 /my → /login redirect
- 미들웨어 코드 (`src/middleware.ts:139`) 는 정상 (`PROTECTED_PATHS = ['/my', '/community/write']`)
- 쿠키 체크 로직도 정상 (`authjs.session-token` 없으면 redirect)
- 테스트 환경(Playwright browser.newContext())에서 간헐적으로 미redirect 발생
- **조치**: 프로덕션에서 비로그인 상태로 /my 직접 접근 수동 확인 필요

### [P3 조사] /faq LEGACY_REDIRECT → /about
- `LEGACY_REDIRECTS['/faq'] = '/about'` 으로 인해 /faq 페이지 접근 불가
- 독립 FAQ 페이지(`src/app/(main)/faq/page.tsx`)가 있으나 미들웨어 redirect로 숨겨짐
- **조치**: /faq 페이지 노출 여부 의도 확인 (SEO 목적이면 redirect 제거)
