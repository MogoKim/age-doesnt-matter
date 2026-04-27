# SNS 자동 포스팅 운영 기획서 (A06)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

우나어 커뮤니티 콘텐츠를 5개 SNS 채널에 자동 배포해 외부 유입 트래픽을 확보한다.  
카페 크롤링(A01) 기반 심리 프로파일로 50~60대 공감 콘텐츠를 생성하고,  
실험 기반 자동/승인 분기로 품질을 관리한다.

---

## 배경

- 검색 유입 외 SNS 유입 채널 다각화 필요
- 50~60대 주요 SNS: Threads(Meta), X, Instagram, Band(네이버), Facebook
- 수동 운영 불가 → AI 자동 생성 + GHA 완전 자동화
- A/B 실험 프레임워크로 콘텐츠 전략 최적화

---

## 세부 기획

### 채널 구성

| 채널 | 상태 | 포스팅 유형 | 최대 길이 | 인증 방식 |
|------|------|-----------|---------|---------|
| **Threads** | ✅ 활성 | 텍스트 + 이미지(선택) | 500자 | OAuth 2.0 Long-lived (60일) |
| **X** | ✅ 활성 | 텍스트 + URL 링크 | 280자 | OAuth 1.0a HMAC-SHA1 |
| **Instagram** | ✅ 활성 (DRAFT) | 이미지 필수 (캐러셀/단일) | 2,200자 | OAuth 2.0 Graph API v21.0 |
| **Band** | ✅ 활성 | 텍스트 + 이미지(선택, 최대 10장) | 5,000자 | OAuth 2.0 Open API v2.2 |
| **Facebook** | ❌ 비활성 | 텍스트 + 이미지 + 링크 카드 | 63,206자 | OAuth 2.0 (App Review 대기) |

> **Instagram 현황**: 이미지 없으면 DRAFT 저장. social-poster-visual.ts(카드뉴스)로만 실제 게시 가능.  
> **Facebook 현황**: `pages_manage_posts` 권한 Meta App Review 승인 후 `FACEBOOK_POSTING_ENABLED=true` 추가 시 자동 활성화.

---

### 콘텐츠 유형 3가지

| 유형 | 설명 | 소스 |
|------|------|------|
| `COMMUNITY` | 인기 커뮤니티 글 소개 | Post(PUBLISHED, 좋아요 ≥ 2, 어제) |
| `MAGAZINE` | 최근 매거진 콘텐츠 소개 | Post(MAGAZINE, 3일 이내) |
| `JOB_ALERT` | 일자리 정보 공유 | Post(JOB, 2일 이내) |

---

### 프로모션 레벨 (constitution.yaml 기반)

| 레벨 | 비율 | 설명 |
|------|------|------|
| `PURE` | 60% | 순수 콘텐츠 (서비스 언급 없음) |
| `SOFT` | 25% | 자연스럽게 서비스 언급 |
| `DIRECT` | 15% | 직접 홍보 |

---

### 하루 실행 흐름

```
07:00 KST — social-poster.ts (텍스트 포스팅)
  → 아침 황금시간 / 커뮤니티·매거진·일자리 중 요일 전략으로 선택
  → Threads, X, Band 게시 (Instagram은 DRAFT)

12:00 KST — social-poster.ts (텍스트 포스팅)
  → 점심 황금시간 / 동일 파이프라인

15:00 KST — social-poster-visual.ts (카드뉴스 이미지 포스팅)
  → DALL-E로 이미지 슬라이드 생성
  → Instagram 캐러셀 + Threads/Band 표지 이미지 게시

20:00 KST — social-metrics.ts
  → 성과 수집 (좋아요, 댓글, 조회수)

월·목 10:00 KST — social-reviewer.ts / social-strategy.ts
  → 3일 주기 성과 리뷰 + 전략 수립

수 10:00 KST — threads-token-refresh.ts
  → Threads Long-lived 토큰 갱신
```

---

### 콘텐츠 생성 파이프라인

```
1. 요일별 전략 로드 (getDayStrategy)
   + 게시 시간대 감지 (earlyMorning/lunch/afternoon/evening)

2. CMO 컨텍스트 수집 (병렬)
   - getActiveExperiment(): 현재 A/B 실험
   - getCMOContext(): 성과 + CafeTrend 심리 프로파일

3. 콘텐츠 파라미터 결정 (실험 기반)
   - contentType, tone, personaId, promotionLevel

4. 소스 선택
   - COMMUNITY → 인기글 상위 5개 중 랜덤
   - MAGAZINE → 최근 2개 중 랜덤
   - JOB_ALERT → 최근 3개 중 랜덤

5. 플랫폼별 Claude API 호출 (claude-sonnet-4-6)
   - System Prompt: constitution.yaml + 톤 가이드 + CMO 컨텍스트
   - 출력: { text, hashtags[], topic_tag }

6. 자동/승인 분기
   - 초기 2주: 자동 (데이터 축적)
   - 3주차~: EXPLOIT 70%(자동) / EXPLORE 30%(AdminQueue 승인)
   - 실험 없으면: 자동

7. 게시 실행
   - 자동: 각 플랫폼 API 즉시 게시
   - 승인: AdminQueue INSERT + SocialPost(QUEUED) + Slack(/una-approve 대기)

8. SocialPost DB 저장 + BotLog 기록
```

---

### 가드레일

| 조건 | 처리 |
|------|------|
| Instagram 이미지 없음 | DRAFT 저장 (게시 안 함) |
| Facebook POSTING_ENABLED ≠ true | 채널 완전 비활성 |
| AI JSON 파싱 실패 | 해당 플랫폼 스킵 + Slack important 알림 |
| 플랫폼 API 실패 | status=FAILED + Slack important 알림 |
| Meta API Rate limit (429) | 5초 대기 후 재시도 |
| automation_status ≠ ACTIVE | 포스팅 자동 스킵 |
| EMERGENCY_STOP BotLog | 즉시 중단 |
| 비용 $50/월 초과 | 즉시 차단 + Slack #긴급 |

---

### 스케줄 / 실행 환경

| 핸들러 | GHA 워크플로우 | UTC 크론 | KST |
|--------|-------------|---------|-----|
| `cmo:social-poster` | `agents-social.yml` | `0 22 * * *` | 07:00 |
| `cmo:social-poster` | `agents-social.yml` | `0 3 * * *` | 12:00 |
| `cmo:social-poster-visual` | `agents-social.yml` | `0 6 * * *` | 15:00 |
| `cmo:social-metrics` | `agents-social.yml` | `0 11 * * *` | 20:00 |
| `cmo:social-reviewer` | `agents-social.yml` | `0 1 * * 1,4` | 월·목 10:00 |
| `cmo:social-strategy` | `agents-social.yml` | `15 1 * * 1,4` | 월·목 10:15 |
| `cmo:threads-token-refresh` | `agents-social.yml` | `0 1 * * 3` | 수 10:00 |

**실행 환경**: GHA ubuntu-latest, Node 20, Claude Sonnet 4.6 (Heavy 모델)

---

### 비용 영향

| 항목 | 일일 | 월간 |
|------|------|------|
| Claude Sonnet (텍스트 생성 2회) | ~$0.03 | ~$1 |
| DALL-E 3 (카드뉴스 8~12장/일) | ~$0.45 | ~$13 |
| Playwright Chromium 렌더링 | $0 | $0 |
| Cloudflare R2 업로드 | ~$0 | ~$0.5 |
| **합계** | **~$0.48** | **~$14.5** |

Constitution 상한 $50/월 대비 여유 있음.

---

## 관련 링크

- 텍스트 포스터: `agents/cmo/social-poster.ts`
- 카드뉴스 포스터: `agents/cmo/social-poster-visual.ts`
- 채널 클라이언트: `agents/cmo/threads-client.ts`, `x-client.ts`, `instagram-client.ts`, `facebook-client.ts`, `band-client.ts`
- 플랫폼 어댑터: `agents/cmo/platform-adapters.ts`
- 토큰 갱신: `agents/cmo/threads-token-refresh.ts`
- GHA 워크플로우: `.github/workflows/agents-social.yml`
- DB 모델: `prisma/schema.prisma` — SocialPost, AdminQueue, BotLog

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 진행중 | Instagram 텍스트 포스팅 불가 | 이미지 필수 정책 | social-poster-visual(카드뉴스)로만 게시 가능 — 이미지 자동 연동 TODO |
| 진행중 | Facebook 포스팅 비활성 | Meta App Review `pages_manage_posts` 권한 심사중 | 승인 후 GitHub Secret에 `FACEBOOK_POSTING_ENABLED=true` 추가 |
| 진행중 | Band band-manager.ts 미완성 | API 코드만 준비, 매니저 로직 TODO | band-client.ts는 완성, 매니저 구현 필요 |
