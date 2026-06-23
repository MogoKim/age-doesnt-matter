# 회원가입 CTA 전수 + 이벤트 측정 정합성 감사 (2026-06-15~18)

> READ ONLY 진단. 코드·DB 무변경. 전체 유저(봇 제외), EventLog vs GA4 대조.
> 실측일: 2026-06-18 / 윈도우: KST 2026-06-15 00:00 ~ 현재

## 1. 회원가입 CTA 전수 지도

| # | CTA | 위치 | 노출 이벤트 | 클릭 이벤트 |
|---|---|---|---|---|
| 1 | **LoginForm** | `/login` 페이지 카카오 버튼 | — | `kakao_button_click` from=`login_page` |
| 2 | **KakaoSignupButton** (재사용) | 아래 위치들에서 공용 | — | `kakao_button_click` from=`{위치}` |
| 2a | └ SignupCard | 홈 중반부 인라인 카드 | — | from=`home_signup_card` |
| 2b | └ about 페이지 | FAQ/중간/하단 3곳 | — | from=`about_faq`/`about_mid_cta`/`about_bottom_cta` |
| 2c | └ LoginPromptModal | "로그인 필요" 모달 | — | from=`login_prompt_modal` |
| 2d | └ GuestComment 성공 | 비회원 댓글 등록 후 카드 | — | from=`guest_comment_success` |
| 3 | **PostCTA** | 글 본문 하단 인라인 "1초 만에 가입" | `post_cta_shown` | `post_cta_clicked` |
| 4 | **SignupPromptBanner** | 정독 85%/60초 후 풀스크린 하단 시트 | `signup_banner_shown` | `signup_banner_clicked` |
| 4b | └ auto-trigger | 인앱→외부브라우저 도착 카운트다운 | — | `inapp_redirect_*` |
| 5 | **OnboardingForm** | 가입 단계(닉네임→약관→환영) | `signup_step` | `sign_up`(완료) / `signup_abandoned` |
| - | AddToHomeScreen | PWA 설치 유도(가입후) | `pwa_popup_shown` | `pwa_install`/`pwa_banner_action` |
| - | IdentityBanner | 글뷰 락인 측정 | `identity_banner_view` | — |

## 2. 이벤트 측정 정합성 (EventLog vs GA4, 6/15~18)

| 이벤트 | EventLog | GA4 | 판정 |
|---|---|---|---|
| sign_up | 16 | 16 | ✅ 완전일치 (신뢰) |
| signup_step | 53 | 53 | ✅ 완전일치 |
| signup_abandoned | 2 | 2 | ✅ |
| kakao_button_click | 33 | 34 | ✅ 거의일치 |
| login | 122 | 135 | ⚠️ EventLog -10% (beacon 유실) |
| post_cta_shown | 367 | 409 | ⚠️ EventLog -10% (beacon 유실) |
| **signup_banner_shown** | **101** | **183** | ⚠️ EventLog -45% (beacon 유실 심함) |
| **signup_banner_clicked** | **0** | **6** | ❌ EventLog 미측정 (GA4만) |
| **signup_banner_eligible** | **0** | **180** | ❌ EventLog 미측정 |
| **signup_banner_dismissed** | **0** | **61** | ❌ EventLog 미측정 |
| **inapp_redirect_attempted/success** | **0** | **2/1** | ❌ EventLog 미측정 |
| **identity_banner_view** | **572** | **0** | ❌ GA4 미측정 (EventLog만, 설계상 정상) |
| post_read / post_read_complete / post_view | 다수 | 0 | ❌ GA4 미측정 (beacon 전용, 설계상 정상) |
| post_cta_clicked | 0 | 0 | ✅ 측정정상 — 진짜 0클릭 |
| pwa_popup_shown/install/banner_action | 0 | 0 | 미발생 (설치유도 보류 상태) |

### 측정 결함 3종
1. **SignupPromptBanner 클릭/노출자격/닫기 EventLog 전면 누락** — `gtm*`(GA4)만 호출, `trackEvent`(EventLog) 없음. → EventLog 단독으로 배너 퍼널 재구성 불가. (`SignupPromptBanner.tsx:210,344,351,381`)
2. **sendBeacon 유실로 EventLog 과소집계** — signup_banner_shown은 EventLog가 GA4의 55%만 잡음. 풀스크린 시트 뜨는 순간 페이지 전환/visibility 변화로 beacon 유실 추정. 중요 이벤트(sign_up/signup_step)는 일치 → 유실은 "뜨자마자 이탈"형 이벤트에 집중.
3. **GA4 from 커스텀차원 미등록** — `kakao_button_click`의 from(CTA위치)을 GA4 UI에서 분해 불가. EventLog로만 가능.

## 3. 실측 결과 (신뢰 가능 데이터)

### 가입 퍼널 (EventLog·GA4 완전일치)
```
카카오버튼 클릭 33 → [OAuth/콜백] → step1 닉네임 21 → step2 약관 16 → step3 환영 16 → sign_up 16
```
- **닉네임 입력(step1→step2)에서 24% 이탈** (21→16). 그 후 약관~완료는 100% 완주.
- 카카오 버튼 33클릭 → 최종 가입 16 = 48% (나머지는 기존회원 로그인/중도이탈).
- 기존회원 재로그인(`login`)은 122건으로 별개.

### 어느 CTA가 실제 가입 버튼을 눌렀나 (kakao_button_click from별, EventLog)
| from | 클릭 |
|---|---|
| login_page (/login 직접) | **28** |
| login_prompt_modal | 4 |
| home_signup_card | 1 |
| about_* / guest_comment_success / 배너 | **0** |

→ 가입 의사는 거의 **/login 페이지에서 직접** 발생. 분산 배치된 CTA(about·홈카드·댓글후)는 사실상 기여 0.

### 글 본문 CTA = 완전 무효
- PostCTA: 노출 367(EventLog)/409(GA4) → 클릭 **0** (양쪽 측정 정상, 진짜 0). 글 하단이라 정독 4%만 도달 → 안 보임.
- SignupPromptBanner: GA4 기준 노출 183 → 클릭 6 (CTR 3.3%), 닫기 61 (34%). 노출의 86%가 정독 아닌 60초 백스톱 발동.

## 4. 결론 (쉽게)

1. **"클릭 0"의 정체 두 가지**: (a) SignupPromptBanner는 EventLog에 클릭이 안 찍혀서 0으로 **보였을 뿐**(실제 GA4 6클릭). (b) PostCTA는 **진짜 0클릭** — 글 하단이라 아무도 도달 못 함.
2. **가입은 거의 /login 직행에서만 발생**. 페이지 곳곳의 분산 CTA는 클릭을 못 만든다.
3. **닉네임 입력 단계가 유일한 내부 이탈 지점**(24%). 약관 이후는 완벽.
4. **측정 신뢰도**: 핵심 전환(sign_up/step)은 정확. 배너 계열은 EventLog 누락+beacon유실로 과소·결손 → 지금 EventLog만 보면 배너 성과를 0으로 오판한다.

## 5. 권장 (제안만)
- [측정] SignupPromptBanner의 clicked/eligible/dismissed에 `trackEvent` 추가 → EventLog 단독 배너 퍼널 복원.
- [측정] beacon 유실: 풀스크린 시트 노출 이벤트를 `fetch keepalive`로 전환 검토(중요 이벤트와 동일하게).
- [전환] PostCTA를 본문 중반(40~50%)으로 이동 + IntersectionObserver 실뷰포트 노출 기준.
- [전환] 분산 CTA 정리 — 효과 0인 about/홈카드보다 /login 진입 동선·배너 타이밍에 집중.
- [전환] 닉네임 단계 24% 이탈 — 입력 부담 완화(자동 추천 닉네임 등) 검토.
