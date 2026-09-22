# Project BRIDGE — 우나어 → 소란소란 트래픽 이주

> 작성 2026-09-22 · 상태: **방향 확정 / 집행안 승인 대기**
> 독자: 창업자 + Codex 운영 마스터 세션

---

## 1. 한 줄 정의

**우나어로 들어오는 사람을 전부 소란소란으로 보낸다. 최대한 많이.**

우나어는 커뮤니티로서는 포기하고, **SEO 자산 · 도메인 · 유입 깔때기로만 유지**한다 (병행 운영).
목적은 우나어 지표 방어가 아니라, **소란소란의 초기 사용자 확보 비용을 우나어가 대신 내는 것**이다.

## 2. 목표

**소란소란 도착 방문자를 최대화한다.** 목표 수치는 두지 않는다 — 많을수록 좋다.
GA4 `unao / *` 유입이 **주 단위로 늘고 있으면 성공**, 정체·감소면 구좌를 바꾼다.

**우나어 헌법 v5.0의 North Star(주간 재방문 참여 유저 수)는 이 프로젝트에 적용하지 않는다.**
단 헌법의 **네이버 Search Advisor 보호 조항은 그대로 유효**하다 (§5).

## 3. 계측 — GA4 **단독**. 다른 계측은 만들지 않는다

- 정본은 **소란소란 GA4 `G-PW9HHV2LLL`**
- 우나어 어드민·`EventLog`에 **BRIDGE 전용 계측을 추가하지 않는다** (창업자 결정 2026-09-22)
- 팝업·AdBanner의 `impressions`/`clicks` 컬럼은 **기존 기능이므로 그냥 둔다.** 참고용이며 판단 근거로 쓰지 않는다

### 링크 규칙 (전 구좌 공통 — 이것만 지키면 끝)

```
https://soransoran.com/?utm_source=unao&utm_medium=<구좌>&utm_campaign=bridge
```

| 구좌 | `utm_medium` |
|---|---|
| 모달 팝업 | `popup` |
| 상단 띠배너 | `topbanner` |
| 푸시·종알림 | `push` |
| 홈 히어로 | `hero` |
| 목록 배너 | `listad` |
| 글 상세 배너 | `detailad` |
| 공지 게시글 | `notice` |
| 푸터 | `footer` |

- `utm_source=unao` · `utm_campaign=bridge` 는 **고정**
- **보는 법**: GA4 → 획득 → 트래픽 획득 → *세션 소스/매체* 에서 `unao / popup` 등.
  전체 합계는 *세션 캠페인 = `bridge`*
- ⚠️ `utm_medium`이 비표준값이라 GA4 **기본 채널 그룹은 Unassigned**가 될 수 있다. 소스/매체 보고서는 정상

### 실측 검증 (2026-09-22, 실제 브라우저)

| 항목 | 결과 |
|---|---|
| 소란소란 GA4 동작 | ✅ `G-PW9HHV2LLL` · `page_view` 정상 전송 |
| UTM이 GA4까지 전달 | ✅ `/g/collect` 의 `dl=` 에 UTM 그대로 포함 |
| 소란소란이 UTM 쿼리 보존 | ✅ 리다이렉트로 날리지 않음 |
| 우나어 GA4와 속성 분리 | ✅ `G-XD7XDP42DF` ≠ `G-PW9HHV2LLL` → 간섭 없음 |
| 우나어 `Referrer-Policy` | `strict-origin-when-cross-origin` → **UTM 없으면 구좌 구분 불가** |

🔴 **푸시·종알림은 referrer가 없다.** UTM을 빠뜨리면 GA4에서 **"직접 유입(direct)"** 으로 잡혀 영영 구분 불가.

## 4. 구좌 인벤토리 (origin/main 실측)

**팝업은 코드 변경 0으로 오늘 띄울 수 있다.**

| 구좌 | 마운트 | 외부 도메인 | 개발량 |
|---|---|---|---|
| **Popup** (`PopupRenderer`) | `MainGroupClientOnly` = 메인그룹 **전 경로** | ✅ `window.open(linkUrl,'_blank','noopener')` **이미 동작** | **0** — 어드민 등록만 |
| **Notice 푸시·종알림** | 회원 전체 | `url` 필드 | **0** — 어드민 발송 |
| **TopPromoBanner** | 전 페이지 최상단 띠 | ✅ `isExternalHref` 분기 존재 — `https://` 면 `<a target="_blank">` | **0** — 어드민 설정만 |
| **HERO 배너** (`Banner` slot=HERO) | 홈 | `ctaUrl` | 0 — 어드민 |
| **AdBanner** | 목록·글상세 | `clickUrl` | 0 — 어드민 |
| 공지 게시글 | 커뮤니티 | 본문 링크 | 0 — 글 작성 |
| Footer / IconMenu / FAB | 전역 상시 | — | 소 |

**팝업이 이미 갖춘 운영 기능:** 경로 타겟팅(`targetPaths`) · 대상 분기(`ALL/HOME/COMMUNITY/JOBS/MAGAZINE/LIFE2/CUSTOM`) ·
기간 · 우선순위 · **하루 1회**(`showOncePerDay`) · **N일 숨김**(`hideForDays`)
**TopPromoBanner는 guest/member 설정이 분리**되어 있어 비회원/회원에 다른 문구를 줄 수 있다.

🔴 **TopPromoBanner는 `rel="noopener noreferrer"` 로 렌더된다 — referrer가 완전히 제거된다.**
팝업(`noopener`만)과 달리 **UTM이 없으면 GA4에서 "직접 유입(direct)"으로 잡혀 100% 실종된다.**
→ 푸시와 함께 **UTM 누락이 치명적인 2대 구좌**다.

> 참고 — 자사 전례: R8 측정에서 회원가입 유도 배너 클릭이 **30일간 0건**이었다.
> 배너 3종에 디자인 공수를 크게 쓰지 않는다. **팝업 + 푸시가 사실상 전부다.**

## 5. 레드라인

| # | 금지 | 이유 |
|---|---|---|
| R1 | `sitemap.ts` · `robots.ts` · canonical · 일반 `<meta name="robots">` 훼손 | 헌법 최우선. CI `seo-guard` 차단 |
| R2 | 우나어 → 소란소란 **301/전면 리다이렉트** | "병행 운영" 결정과 모순. 네이버 색인 0 회복 시도를 파괴 |
| R3 | 우나어 콘텐츠를 소란소란에 **복제** | duplicate content — 양쪽 다 손해 |
| R4 | 소란소란 유도 페이지를 **크롤러에 노출** | doorway page 판정 위험 |
| R5 | 네이버 색인 **살아있는 WAIT 3건 조작** | 기한 전 색인 재요청·sitemap 재제출 금지 |
| R6 | `main` 직접 push · merge · production 배포 · workflow dispatch | 등급 무관 창업자 승인 대상 |

✅ **SEO 안전 확인:** `PopupRenderer`는 `dynamic(..., { ssr:false })`로 로드되어 **크롤러가 팝업을 보지 못한다.**
→ 구글 모바일 인터스티셜 페널티 리스크 낮음. 단 **실사용자 이탈은 별개 비용**이다.

## 6. 창업자 결정 (2026-09-22)

| 항목 | 결정 |
|---|---|
| **문구 톤** | **소개형** — "새 커뮤니티가 열렸습니다". "변경되었습니다"(완료형) 금지 — 병행 운영과 모순 |
| **회원 계정** | **재가입 필요** (소란소란은 별개 계정) → 문구에서 "기존 계정" 언급 금지 |
| **랜딩** | 소란소란 홈 `/` (별도 지정 없으면 기본값) |

⚠️ **이 조합은 전환 장벽이 둘(막연한 소개 + 재가입)이다.** 보완책:
1. **"가입 없이 둘러보기"를 전면에** — 첫 클릭 장벽 제거. 가입은 도착 후 문제
2. **가야 할 구체적 이유**를 준다 — 막연한 "새 커뮤니티"는 눌리지 않는다 → **A-7**

| ID | 남은 미결 |
|---|---|
| **A-7** | **소란소란이 우나어보다 나은 점 한 줄** — 문구의 설득력 전부가 여기 달렸다. 창업자만 답할 수 있다 |
| **A-8** | **`SignupPromptBanner` 처리** — §7 충돌 참조 |

## 7. 충돌 지점

**`SignupPromptBanner`(`MainGroupClientBottom`)가 BRIDGE와 정면 충돌한다.**
이 배너는 **우나어 카카오 가입**을 유도하며, 카운트다운 후 **자동으로 가입 플로우를 시작**한다.
같은 사용자에게 "우나어에 가입해라"와 "소란소란으로 가라"를 동시에 제시하는 꼴이다.

- 이 배너가 바로 **R8에서 30일간 클릭 0건**이었던 그 배너다
- 단 `signup_banner_*` **A/B 실험이 진행 중**이라, 끄면 실험 데이터가 끊긴다
- → 창업자 판단 필요 (A-8): ① 그대로 둠 ② 끔 ③ BRIDGE 링크로 전환

**동시 노출 경쟁자** (`MainGroupClientBottom`): `SignupPromptBanner` · `PopupRenderer` · `PushPermissionToast`
`PushPermissionToast`는 `unao_admin_popup_visible` 키로 **이미 팝업에 양보**하도록 조정되어 있다 — 추가 작업 불필요.
홈에는 `HomePopupsClientOnly`(투표·설문·피드백 팝업)가 별도로 있어 **팝업 우선순위(`priority`) 조정이 필요**하다.

## 8. 집행 순서

| # | 작업 | 개발량 | 선행조건 |
|---|---|---|---|
| 1 | 공지 게시글 작성 | 0 | A-7 |
| 2 | **팝업** 어드민 등록 (`target=ALL`, `showOncePerDay`) | 0 | A-7 · 팝업 priority 조정 |
| 3 | **TopPromoBanner** guest/member 설정 | 0 | A-7 |
| 4 | **HERO 배너** 등록 (`ctaUrl`) | 0 | A-7 |
| 5 | **푸시·종알림** 발송 | 0 | 1~4 완료 후 (도착지 먼저 깔고) |
| 6 | **AdBanner** 등록 (`clickUrl`) | 0 | 소재 필요 |
| 7 | Footer / IconMenu 상시 링크 | 소 (코드) | 별도 PR |

**1~6은 전부 개발 0 — 어드민 등록만으로 집행된다.** 코드 변경은 7번뿐이다.
전 구좌 **UTM 링크 규칙(§3) 준수가 유일한 필수 조건**이다.
