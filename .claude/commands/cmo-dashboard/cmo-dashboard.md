---
description: CMO 마케팅 대시보드 — 실험 현황, 플랫폼 성과, 콘텐츠 랭킹 확인. '마케팅 현황', 'SNS 성과', '실험 결과' 등을 말할 때 사용합니다.
---

# CMO 마케팅 대시보드

## 실행 절차
1. DB에서 최근 데이터 조회 (Prisma client 사용):

   **활성 실험:**
   ```typescript
   prisma.socialExperiment.findFirst({
     where: { status: 'ACTIVE' },
     orderBy: { createdAt: 'desc' },
   })
   ```

   **플랫폼별 성과 (최근 7일):**
   ```typescript
   prisma.socialPost.findMany({
     where: { createdAt: { gte: sevenDaysAgo } },
     select: { platform: true, contentType: true, metrics: true },
   })
   // metrics는 Json 필드: { impressions, likes, comments, shares, clicks }
   // platform + contentType별로 집계하여 평균 참여도 계산
   ```

   **최근 학습 3건:**
   ```typescript
   prisma.socialExperiment.findMany({
     where: { learnings: { not: null } },
     orderBy: { createdAt: 'desc' },
     take: 3,
     select: { learnings: true, variable: true, weekNumber: true },
   })
   ```

2. 요약 리포트 형식:
   - 활성 실험: 변수, 컨트롤/테스트 값, 진행 주차
   - 플랫폼별 성과 TOP 5: 플랫폼, 콘텐츠 유형, 평균 참여
   - 최근 학습 3건: 주차, 변수, 핵심 인사이트
   - 다음 액션 추천

3. 참고:
   - `agents/cmo/knowledge-base.ts`의 `getCMOContext()` 함수가 동일한 데이터를 프로그래밍적으로 제공
   - SocialPost의 metrics 필드는 Json 타입 (`{ impressions, likes, comments, shares, clicks }`)
   - SocialPlatform enum: THREADS, X, INSTAGRAM, FACEBOOK, BAND
