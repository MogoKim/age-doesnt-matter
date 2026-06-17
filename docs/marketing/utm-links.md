# UTM 링크 관리 — 우나어

> 최종 갱신: 2026-06-16
> 모든 유입 링크의 UTM(추적 파라미터) 단일 진실 문서. 새 캠페인/채널 추가 시 여기 먼저 기록.

---

## A. 수동 공유 링크 (직접 뿌리는 것)

용도가 2가지로 갈린다. **채널별로 하나만** 써야 GA4가 안 헷갈린다.

### A-1. 앱 유입용 `/go/*` — 안드로이드=앱, iOS·PC=웹
| 채널 | 짧은 링크 | 동작 |
|------|----------|------|
| 네이버 매거진 | `https://age-doesnt-matter.com/go/naver-mag` | 안드: 앱(없으면 스토어) / iOS·PC: 웹 |
| 네이버 체험단 | `https://age-doesnt-matter.com/go/naver-exp` | 〃 |
| 스레드 | `https://age-doesnt-matter.com/go/threads` | 〃 |
| 인스타그램 | `https://age-doesnt-matter.com/go/instagram` | 〃 |
| 페이스북 | `https://age-doesnt-matter.com/go/facebook` | 〃 |
| 카카오톡 | `https://age-doesnt-matter.com/go/kakao` | 카톡=스토어 / iOS·PC: 웹 |

> 풀버전(동일 동작): `https://age-doesnt-matter.com/go?utm_source={src}&utm_medium={med}&utm_campaign={camp}`
> 매핑: naver-mag→naver/blog/magazine, naver-exp→naver/blog/experience, threads·instagram·facebook·kakao→{src}/social/post

### A-2. 웹 유입용 `/?utm=...` — 무조건 웹 홈
| 채널 | 링크 |
|------|------|
| 네이버 매거진 | `https://age-doesnt-matter.com/?utm_source=naver&utm_medium=blog&utm_campaign=magazine` |
| 네이버 체험단 | `https://age-doesnt-matter.com/?utm_source=naver&utm_medium=blog&utm_campaign=experience` |
| 스레드 | `https://age-doesnt-matter.com/?utm_source=threads&utm_medium=social&utm_campaign=post` |
| 인스타그램 | `https://age-doesnt-matter.com/?utm_source=instagram&utm_medium=social&utm_campaign=post` |
| 페이스북 | `https://age-doesnt-matter.com/?utm_source=facebook&utm_medium=social&utm_campaign=post` |
| **구글 애즈(디맨드젠)** | `https://age-doesnt-matter.com/?utm_source=google&utm_medium=cpc&utm_campaign=demandgen_여성가입_1차` |
| 카카오 채널 프로필(홈) | `https://age-doesnt-matter.com/?utm_source=kakao&utm_medium=social&utm_campaign=channel_profile` |
| 카카오 채널 프로필(베스트) | `https://age-doesnt-matter.com/best?utm_source=kakao&utm_medium=social&utm_campaign=channel_best` |

### A-3. 친구톡 (카카오 메시지 발송) — 채널 친구 대상
**규칙**: `utm_source=kakao` / `utm_medium=friendtalk` / `utm_campaign=friendtalk_best_{회차}` (매 발송 회차 +1)

- **개별 글 링크**: 글 URL에 UTM 부착 (기존 `?from=best` 있으면 `&`로, 없으면 `?`로 시작)
  예: `…/community/stories/{글}?from=best&utm_source=kakao&utm_medium=friendtalk&utm_campaign=friendtalk_best_1`
- **"오늘의 베스트" 버튼**: `https://age-doesnt-matter.com/best?utm_source=kakao&utm_medium=friendtalk&utm_campaign=friendtalk_best_1`
- 한 번 발송의 모든 항목(글 N개 + 베스트 버튼)은 **같은 campaign**으로 묶는다 → GA4에서 한 발송으로 집계
- **GA4 분석**: 캠페인 `friendtalk_best_1` 필터 → 랜딩 페이지로 구분(`/best`=버튼 클릭, `/community/…`=개별 글)
- 다음 발송은 `friendtalk_best_2`, `_3` … 으로 회차 비교

---

## B. 코드가 자동으로 붙이는 UTM (관리 불필요 — 참고용)

시스템이 자동 추적. 손대지 않아도 됨.

| 출처 | utm_source / medium | 코드 위치 |
|------|--------------------|----------|
| 추천 띠배너(카톡공유) | `member_referral`·`guest_referral` / `kakao_share` | TopPromoBannerClient.tsx |
| 게시글 카톡공유 | `post_share` / `kakao_share` | lib/kakao-share.ts |
| PWA 설치 배너 | `kakao_inapp`·`naver_inapp`·`instagram_inapp` / `pwa_banner` | AddToHomeScreen.tsx |
| 가입유도 배너 | `{환경}` / `signup_banner` | SignupPromptBanner.tsx |
| 웹푸시 알림 | `webpush` / `push` (campaign=동적) | lib/push/service.ts |
| 플레이스토어 설치 referrer | `website` / `footer` (campaign=`app_install`) | lib/app-links.ts |
| 플레이스토어 유입 표시 | `google-play` / `organic` | lib/gtm.ts |

---

## 작명 규칙 (새 캠페인 추가 시)

`{광고유형}_{목적}_{차수}` 로 통일:
- `demandgen_여성가입_1차`, `demandgen_여성가입_2차`
- `search_브랜드_1차`
→ GA4에서 `demandgen_`만 필터 = 디맨드젠 전체 / 정확한 이름 = 그 캠페인만.

## GA4에서 캠페인별 성과 보기
- 탐색 → **세션 캠페인 = `demandgen_여성가입_1차`** 필터 + 이벤트 **`sign_up`** → 그 광고로 가입한 수
- 광고비 ÷ 가입자 수 = **가입 1명당 광고비(CPA)**

## 주의사항
- A-1(`/go/*`)과 A-2(`/?utm`)는 같은 채널이라도 **하나만** 사용 (앱유입 vs 웹유입 목적 구분).
- 새 채널/캠페인은 **이 문서에 먼저 기록** 후 사용.
- 한글 캠페인명 가능하나(GA4 표시 OK) URL 인코딩되어 길어짐 → 영문 권장.
