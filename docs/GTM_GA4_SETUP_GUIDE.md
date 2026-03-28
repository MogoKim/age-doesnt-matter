# GTM + GA4 설정 가이드 (복사-붙여넣기용)

> 코드는 이미 완료됨. 이 가이드는 **GTM/GA4 웹 UI에서** 설정하는 단계입니다.

---

## 사전 준비 (완료 가정)

| 항목 | 값 |
|------|-----|
| GA4 측정 ID | `G-XXXXXXXXXX` (2단계에서 발급) |
| GTM 컨테이너 ID | `GTM-XXXXXXX` (3단계에서 발급) |
| Vercel 환경변수 | `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA4_ID` 등록 완료 |

---

## STEP 1: GA4 속성 생성

1. https://analytics.google.com 접속
2. **관리**(톱니바퀴) → **+ 속성 만들기**
3. 속성 이름: `우리나이가어때서`
4. 시간대: `대한민국`, 통화: `KRW`
5. 비즈니스 정보: 카테고리 `온라인 커뮤니티`, 규모 `소규모`
6. 플랫폼: **웹** 선택
7. 웹사이트 URL: `https://age-doesnt-matter.com`
8. 스트림 이름: `우나어 웹`
9. **스트림 만들기** → 측정 ID (`G-XXXXXXXXXX`) 복사해두기

---

## STEP 2: GTM 컨테이너 생성

1. https://tagmanager.google.com 접속
2. **계정 만들기**
3. 계정 이름: `우나어`
4. 컨테이너 이름: `age-doesnt-matter.com`
5. 대상 플랫폼: **웹**
6. **만들기** → 컨테이너 ID (`GTM-XXXXXXX`) 복사해두기

---

## STEP 3: Vercel 환경변수 등록

1. https://vercel.com → 프로젝트 → **Settings** → **Environment Variables**
2. 추가:

| Key | Value | Environment |
|-----|-------|-------------|
| `NEXT_PUBLIC_GTM_ID` | `GTM-XXXXXXX` | Production, Preview, Development |
| `NEXT_PUBLIC_GA4_ID` | `G-XXXXXXXXXX` | Production, Preview, Development |

3. **Deployments** → 최신 배포 → **⋯** → **Redeploy** (환경변수 적용)

---

## STEP 4: GTM에서 GA4 구성 태그 설정

GTM 웹 UI에서 아래 순서대로 진행합니다.

### 4-1. GA4 구성 태그 (기본)

1. GTM → **태그** → **새로 만들기**
2. 태그 이름: `GA4 - 구성`
3. 태그 유형: **Google 태그**
4. 태그 ID: `G-XXXXXXXXXX` (GA4 측정 ID)
5. 트리거: **All Pages** (기본 제공)
6. **저장**

---

## STEP 5: 커스텀 이벤트 태그 설정 (9개)

코드에서 `dataLayer.push({ event: '이벤트명', ... })`으로 전송하는 이벤트들입니다.
각각 **트리거 → 태그** 순서로 만듭니다.

---

### 5-1. post_create (글 작성)

**트리거 만들기:**
1. **트리거** → **새로 만들기**
2. 트리거 이름: `CE - post_create`
3. 트리거 유형: **맞춤 이벤트**
4. 이벤트 이름: `post_create`
5. **저장**

**태그 만들기:**
1. **태그** → **새로 만들기**
2. 태그 이름: `GA4 Event - post_create`
3. 태그 유형: **Google 애널리틱스: GA4 이벤트**
4. 측정 ID: `G-XXXXXXXXXX`
5. 이벤트 이름: `post_create`
6. 이벤트 매개변수:
   | 매개변수 이름 | 값 |
   |---|---|
   | `board_type` | `{{DLV - board_type}}` |
   | `category` | `{{DLV - category}}` |
7. 트리거: `CE - post_create`
8. **저장**

> `{{DLV - board_type}}` 같은 변수는 아래 **STEP 6**에서 한꺼번에 만듭니다.

---

### 5-2. comment_create (댓글 작성)

**트리거:**
- 이름: `CE - comment_create`
- 이벤트 이름: `comment_create`

**태그:**
- 이름: `GA4 Event - comment_create`
- 이벤트 이름: `comment_create`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `board_type` | `{{DLV - board_type}}` |

---

### 5-3. like (좋아요)

**트리거:**
- 이름: `CE - like`
- 이벤트 이름: `like`

**태그:**
- 이름: `GA4 Event - like`
- 이벤트 이름: `like`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `content_type` | `{{DLV - content_type}}` |
  | `content_id` | `{{DLV - content_id}}` |

---

### 5-4. share (공유)

**트리거:**
- 이름: `CE - share`
- 이벤트 이름: `share`

**태그:**
- 이름: `GA4 Event - share`
- 이벤트 이름: `share`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `method` | `{{DLV - method}}` |
  | `content_type` | `{{DLV - content_type}}` |
  | `content_id` | `{{DLV - content_id}}` |

---

### 5-5. search (검색)

**트리거:**
- 이름: `CE - search`
- 이벤트 이름: `search`

**태그:**
- 이름: `GA4 Event - search`
- 이벤트 이름: `search`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `search_term` | `{{DLV - search_term}}` |
  | `results_count` | `{{DLV - results_count}}` |

---

### 5-6. job_view (일자리 조회)

**트리거:**
- 이름: `CE - job_view`
- 이벤트 이름: `job_view`

**태그:**
- 이름: `GA4 Event - job_view`
- 이벤트 이름: `job_view`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `job_id` | `{{DLV - job_id}}` |
  | `job_title` | `{{DLV - job_title}}` |

---

### 5-7. magazine_view (매거진 조회)

**트리거:**
- 이름: `CE - magazine_view`
- 이벤트 이름: `magazine_view`

**태그:**
- 이름: `GA4 Event - magazine_view`
- 이벤트 이름: `magazine_view`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `article_id` | `{{DLV - article_id}}` |
  | `article_title` | `{{DLV - article_title}}` |
  | `category` | `{{DLV - category}}` |

---

### 5-8. ad_click (광고 클릭)

**트리거:**
- 이름: `CE - ad_click`
- 이벤트 이름: `ad_click`

**태그:**
- 이름: `GA4 Event - ad_click`
- 이벤트 이름: `ad_click`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `ad_slot` | `{{DLV - ad_slot}}` |
  | `ad_type` | `{{DLV - ad_type}}` |

---

### 5-9. cps_click (쿠팡 CPS 클릭)

**트리거:**
- 이름: `CE - cps_click`
- 이벤트 이름: `cps_click`

**태그:**
- 이름: `GA4 Event - cps_click`
- 이벤트 이름: `cps_click`
- 매개변수:
  | 매개변수 이름 | 값 |
  |---|---|
  | `product_name` | `{{DLV - product_name}}` |
  | `category` | `{{DLV - category}}` |

---

## STEP 6: dataLayer 변수 만들기 (한꺼번에)

GTM → **변수** → **사용자 정의 변수** → **새로 만들기**

아래 12개를 모두 만듭니다. 모두 동일한 방식:
- 변수 유형: **데이터 영역 변수**
- 데이터 영역 변수 이름: 아래 표의 값 그대로

| 변수 이름 (GTM에서 표시) | 데이터 영역 변수 이름 |
|---|---|
| `DLV - board_type` | `board_type` |
| `DLV - category` | `category` |
| `DLV - content_type` | `content_type` |
| `DLV - content_id` | `content_id` |
| `DLV - method` | `method` |
| `DLV - search_term` | `search_term` |
| `DLV - results_count` | `results_count` |
| `DLV - job_id` | `job_id` |
| `DLV - job_title` | `job_title` |
| `DLV - article_id` | `article_id` |
| `DLV - article_title` | `article_title` |
| `DLV - ad_slot` | `ad_slot` |
| `DLV - ad_type` | `ad_type` |
| `DLV - product_name` | `product_name` |

### 만드는 법 (반복)
1. **변수** → **사용자 정의 변수** → **새로 만들기**
2. 변수 이름: `DLV - board_type`
3. 변수 유형: **데이터 영역 변수**
4. 데이터 영역 변수 이름: `board_type`
5. **저장**
6. 나머지 13개도 동일하게 반복

---

## STEP 7: 로그인/회원가입 이벤트 (URL 트리거)

코드에서 카카오 로그인은 서버 액션이라 직접 dataLayer push가 어렵습니다.
GTM에서 **URL 패턴 기반 트리거**로 설정합니다.

### 7-1. 회원가입 (sign_up)

**트리거:**
1. 이름: `PV - 회원가입 완료`
2. 트리거 유형: **페이지뷰**
3. 조건: `Page Path` **포함** `/onboarding`

**태그:**
1. 이름: `GA4 Event - sign_up`
2. 이벤트 이름: `sign_up`
3. 매개변수: `method` = `kakao`
4. 트리거: `PV - 회원가입 완료`

### 7-2. 로그인 (login)

**트리거:**
1. 이름: `PV - 로그인 완료`
2. 트리거 유형: **페이지뷰**
3. 조건: `Page Path` **포함** `/api/auth/callback`

**태그:**
1. 이름: `GA4 Event - login`
2. 이벤트 이름: `login`
3. 매개변수: `method` = `kakao`
4. 트리거: `PV - 로그인 완료`

---

## STEP 8: 미리보기 + 게시

### 미리보기 (디버깅)
1. GTM → **미리보기** 클릭
2. URL: `https://age-doesnt-matter.com` 입력
3. 사이트가 열리면 하단에 GTM 디버그 패널 표시
4. 각 페이지 이동, 글 작성, 좋아요 등 액션 수행
5. 디버그 패널에서 이벤트 발생 확인 (Tags Fired)

### 게시 (라이브 반영)
1. 모든 이벤트 확인 완료 후
2. GTM → **제출** → 버전 이름: `v1.0 - GA4 초기 설정`
3. **게시**

---

## STEP 9: GA4에서 확인

1. GA4 → **보고서** → **실시간** → 이벤트 수 확인
2. GA4 → **구성** → **이벤트** → 커스텀 이벤트 목록 표시 (24~48시간 소요)
3. GA4 → **탐색** → 자유 형식 보고서에서 커스텀 이벤트 분석

---

## 요약 체크리스트

- [ ] GA4 속성 생성 + 측정 ID 발급
- [ ] GTM 컨테이너 생성 + 컨테이너 ID 발급
- [ ] Vercel 환경변수 2개 등록 + Redeploy
- [ ] GTM: GA4 구성 태그 (All Pages)
- [ ] GTM: dataLayer 변수 14개
- [ ] GTM: 커스텀 이벤트 트리거 9개
- [ ] GTM: 커스텀 이벤트 태그 9개
- [ ] GTM: 로그인/회원가입 URL 트리거 + 태그 2개
- [ ] GTM: 미리보기 테스트
- [ ] GTM: 게시 (v1.0)
- [ ] GA4: 실시간 보고서에서 데이터 수신 확인
- [ ] Service Account 생성 + GA4/SC 권한 부여
- [ ] 환경변수 3개 등록 (`GOOGLE_SERVICE_ACCOUNT_JSON`, `GA4_PROPERTY_ID`, `SEARCH_CONSOLE_SITE_URL`)

---

## STEP 10: 아임웹 기존 GA4/GTM 정리

기존 아임웹에서 사용하던 GA4/GTM이 있다면 정리합니다.

1. **Google Analytics** → 관리 → 속성 → **데이터 스트림**에서 아임웹 도메인 스트림 삭제
2. **GTM** → 기존 아임웹 컨테이너 삭제 또는 비활성화
3. 아임웹 관리자에서 GA/GTM 코드 삽입 해제 (이중 트래킹 방지)

---

## STEP 11: Service Account 생성 (CDO 데이터 수집용)

CDO 에이전트가 GA4 Data API + Search Console API를 호출하기 위한 서비스 계정입니다.

1. [Google Cloud Console](https://console.cloud.google.com) → **IAM 및 관리자** → **서비스 계정** → **서비스 계정 만들기**
2. 서비스 계정 이름: `cdo-kpi-collector`
3. 역할: **없음** (GA4/SC에서 직접 권한 부여)
4. **키** 탭 → **키 추가** → **새 키 만들기** → JSON → 다운로드
5. Base64 인코딩:
   ```bash
   cat key.json | base64 | tr -d '\n'
   ```
6. Vercel 환경변수 등록:
   | Key | Value | Environment |
   |-----|-------|-------------|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | `<위에서 생성한 Base64 문자열>` | Production |

> 키 파일(key.json)은 등록 후 즉시 삭제하세요. 절대 Git에 커밋하지 마세요.

---

## STEP 12: GA4 API 권한 부여

서비스 계정이 GA4 데이터를 읽을 수 있도록 권한을 부여합니다.

1. **Google Analytics** → 관리(톱니바퀴) → 속성 수준 → **속성 접근 관리**
2. **+** → 사용자 추가
3. 이메일: `cdo-kpi-collector@<프로젝트ID>.iam.gserviceaccount.com`
4. 역할: **뷰어** (읽기 전용)
5. **추가**
6. Vercel 환경변수 등록:
   | Key | Value | Environment |
   |-----|-------|-------------|
   | `GA4_PROPERTY_ID` | `<GA4 속성의 숫자 ID>` | Production |

> 숫자 ID 확인: GA4 → 관리 → 속성 설정 → 속성 ID (예: `123456789`)

---

## STEP 13: Search Console 권한 부여

서비스 계정이 Search Console 데이터를 읽을 수 있도록 권한을 부여합니다.

1. [Search Console](https://search.google.com/search-console) → **설정** → **사용자 및 권한**
2. **사용자 추가**
3. 이메일: `cdo-kpi-collector@<프로젝트ID>.iam.gserviceaccount.com`
4. 권한: **제한됨** (읽기 전용)
5. **추가**
6. Vercel 환경변수 등록:
   | Key | Value | Environment |
   |-----|-------|-------------|
   | `SEARCH_CONSOLE_SITE_URL` | `https://age-doesnt-matter.com` | Production |

---

## Phase 2 완료 체크리스트

- [ ] 아임웹 기존 GA4/GTM 정리 (STEP 10)
- [ ] Service Account 생성 + JSON 키 Base64 인코딩 (STEP 11)
- [ ] GA4 속성 접근 관리에 서비스 계정 뷰어 추가 (STEP 12)
- [ ] Search Console 사용자에 서비스 계정 추가 (STEP 13)
- [ ] Vercel 환경변수 3개 등록 + Redeploy
- [ ] CDO KPI 리포트에 GA4/SC 데이터 포함 확인
