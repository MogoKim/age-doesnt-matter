# 카드뉴스 생성 운영 기획서 (A07)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

50~60대 관심사 기반 카드뉴스(6~10장 슬라이드)를 매일 자동 생성해  
Instagram 캐러셀·Threads·Band·Facebook에 배포하고 SNS 팔로워를 서비스로 유입시킨다.

---

## 배경

- 텍스트 포스팅(A06)보다 SNS 알고리즘 노출 유리 (Instagram 캐러셀 특히 효과적)
- DALL-E + Unsplash 하이브리드로 이미지 비용 최소화
- CafeTrend + Perplexity 리서치로 실제 50~60대 관심사 반영

---

## 세부 기획

### 슬라이드 구성

**장 수**: 6~10장 유동 (v1 5장 고정 → v2 유동으로 진화)

**11종 슬라이드 타입:**

| 타입 | 설명 | 위치 |
|------|------|------|
| `hook` | 강렬한 질문/사실 | 반드시 첫 슬라이드 |
| `context` | 배경 설명 | 중간 |
| `stat` | 통계/수치 (statNumber + statLabel) | 중간 |
| `story` | 스토리텔링 | 중간 |
| `tip` | 팁 (icon 이모지 필수) | 중간 |
| `comparison` | 비교 (leftLabel/rightLabel) | 중간 |
| `quote` | 인용구 (attribution) | 중간 |
| `listicle` | 목록형 (listRank) | 중간 |
| `stepguide` | 단계별 가이드 (stepNumber/stepTotal) | 중간 |
| `summary` | 요약 | 중간 |
| `cta` | 행동 유도 (ctaText + ctaUrl) | 반드시 마지막 |

**각 슬라이드 필드**: title(25자), body(120자), bulletPoints(35자×5개), imagePrompt, imageStyle

---

### 요일별 카테고리

| 요일 | 카테고리 |
|------|---------|
| 월 | WELLNESS |
| 화 | PRACTICAL |
| 수 | COMMUNITY |
| 목 | LIFESTYLE |
| 금 | GROWTH |
| 토·일 | TRENDING |

---

### 콘텐츠 생성 파이프라인

```
1. 요일별 카테고리 결정

2. 데이터 수집 (병렬)
   - CafeTrend DB → 핫토픽·키워드
   - Post DB → 인기 커뮤니티 글 (좋아요≥2, 3일 이내)

3. researchTopic()
   - Perplexity API 웹검색 (API 키 있을 경우)
   - Claude Sonnet 구조화

4. Claude Sonnet-4-6 콘텐츠 생성 (max_tokens: 4000)
   - System Prompt: 11종 타입 정의 + 50~60대 톤 가이드
   - 출력: JSON (슬라이드 6~10장)

5. validateCardNewsOutput()
   - 슬라이드 수 확인 (6~10장)
   - 첫/마지막 타입 확인
   - 태그 최소 4개
   - 10장 초과 → hook + 중간 8장 + cta 자동 트림

6. 이미지 생성 (슬라이드별)
   - Hook 슬라이드: DALL-E 3 우선 → Unsplash fallback
   - 나머지: Unsplash 우선 → DALL-E 3 fallback

7. Playwright 렌더링 (1080×1350, Instagram 최적화)
   → Sharp JPEG 최적화 (품질 85, mozjpeg)
   → R2 업로드 (card-news/{YYYY-MM-DD}/v2-slide-{index}.jpg)

8. SNS 채널별 게시 (social-poster-visual.ts)

9. BotLog 기록
```

---

### 이미지 생성 전략

| 슬라이드 | 1차 | Fallback | 이유 |
|---------|-----|---------|------|
| Hook (첫 장) | DALL-E 3 | Unsplash | 브랜드 첫인상 중요 |
| 나머지 | Unsplash | DALL-E 3 | 비용 절감 |

- Unsplash: `orientation=squarish`, 무료
- DALL-E 3: `1024×1024`, `standard` 품질, $0.04/장
- R2 경로: `card-news/{YYYY-MM-DD}/v2-slide-{index}.jpg`

---

### SNS 채널별 포맷

| 채널 | 포맷 | 이미지 | 캡션 |
|------|------|--------|------|
| Instagram | 캐러셀 | 전체 슬라이드 | 풀 캡션 |
| Facebook | 여러 사진 | 전체 슬라이드 | 풀 캡션 |
| Threads | 단일 이미지 | 표지(슬라이드 0) | 500자 제한 |
| Band | 표지 + 요약 | 표지 | Bullet 요약 |

**캡션 구조:**
```
[카테고리 이모지] [주제]

[카테고리별 소개 문구]

👉 더 많은 이야기: https://age-doesnt-matter.com

#우리나이가어때서 #인생2막 #5060 + [카테고리 태그 3개] + [AI 생성 태그 2개]
```

---

### 스케줄 / 실행 환경

| 핸들러 | 워크플로우 | UTC 크론 | KST |
|--------|----------|---------|-----|
| `cmo:social-poster-visual` | `agents-social.yml` | `0 6 * * *` | 매일 15:00 |

**실행 환경**: GHA ubuntu-latest, Node 20  
**AI 모델**: Claude Sonnet-4-6 (텍스트), DALL-E 3 (이미지)

---

### BotLog

- `action: 'CARD_NEWS_V2_GENERATE'` — 생성 단계
- `action: 'CARD_NEWS_POST_V2'` — 게시 단계
- details: `{ category, topic, slideCount, slideTypes, tags, imageUrls, researchStats }`

---

### 비용 영향

| 항목 | 일일 | 월간 |
|------|------|------|
| Claude Sonnet (콘텐츠 생성) | ~$0.10 | ~$3 |
| DALL-E 3 (hook 1~2장) | ~$0.08 | ~$2.4 |
| Unsplash | $0 | $0 |
| R2 업로드 | ~$0 | ~$0.2 |
| **합계** | **~$0.18** | **~$5.6** |

---

## 관련 링크

- 생성기: `agents/cmo/card-news/generator.ts`
- 이미지 생성: `agents/cmo/card-news/image-gen.ts`
- 렌더러: `agents/cmo/card-news/renderer.ts`
- SNS 게시: `agents/cmo/social-poster-visual.ts`
- GHA 워크플로우: `.github/workflows/agents-social.yml`
- DB 모델: `prisma/schema.prisma` — Post, BotLog

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 이전 | 슬라이드 5장 고정으로 콘텐츠 부족 | v1 구조 한계 | v2로 6~10장 유동으로 전환 |
| 이전 | 슬라이드 10장 초과 생성 | AI 응답 길이 불안정 | auto-trim 로직 추가 |
