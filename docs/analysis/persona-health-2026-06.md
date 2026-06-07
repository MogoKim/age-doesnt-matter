# 봇 페르소나 시스템 건강 진단 (2026-06-07)

> 페르소나 2차 정비를 "근본적으로" 딥다이브한 결과. 재현: `agents/scripts/_persona-diag.ts`(로컬, gitignore)
> 결론: **페르소나 콘텐츠는 건강. 근본 재설계 불필요.** 유일 기술부채 = curator-shared 중복 레지스트리(careful 백로그).

## 실데이터 진단 결과

### 1. 봇 원글 게시판 분포 (source=BOT)
- 전체: STORY 73.5%(1976) · LIFE2 11% · HUMOR 5.8% · MAGAZINE 4.8% · JOB 4.6% · WEEKLY 0.2%
- 30일: STORY 69.7% · LIFE2 17.5% · HUMOR 6% · JOB 2.6%
- **판정: STORY 편중은 스크래퍼 소스가 STORY 위주라 발생(창업자 확인 = 의도, OK).** 게시판 결정 레버는 `curator-shared.ts` `DESIRE_TO_BOARD`(STORY 14/19 욕망).

### 2. 봇 계정 활동 (83개)
- persona-data 79 + 특수 4(JOB/HUMOR/CAREGIVING/HEALTH) = 83, 전원 활동(유령 0).
- 편차 큼: 조용한수다(35/1083) ~ 연예/HUMOR봇(4/4). HUMOR 게시판 활동 저조.

### 3. 말투/주제 중복 (차별화 점검)
- 엄격(topic 40%/speech 50%/quirk 2): **0쌍**
- 완화(topic 25%/speech 35%/quirk 1): 7쌍, 전부 **quirk 1개 우연 공유**(topic 0%, speech≈0%)
- **판정: 실질 중복 없음. persona-data 79는 이미 잘 차별화됨.**

### 4. 레지스트리 정합성
- **persona-data 79 = DB 봇과 1:1 일치 → 정본 확정**
- curator-shared 99 = persona-data와 공통 50 + **죽은 정의 49(CA~EB, DB 봇 없음)** + 닉네임 충돌 50(A=하늘바라기 vs 새날바라기)
- **단 DB 표시 닉네임은 persona-data 기준이라 실제 화면은 정상** → curator 닉네임 충돌은 사용자 무영향(내부 선택용).
- 특수 4(JOB/HUMOR/CAREGIVING/HEALTH)는 DB에만 있고 persona-data 미정의.

### 5. 욕망 분포 (CafePost.desireCategory)
- null 2255(최다) + MONEY/HEALTH 1330 ~ + **오타/레거시 욕망**(SOCIAL·TOURISM·WORK·HONOR·GIFT 각 1건).

## 결론 & 처방

| 영역 | 상태 | 처방 |
|------|------|------|
| 게시판 편중 | 의도(스크래퍼 소스) | 정비 불필요 |
| 성별 100% 여성 | 전략(50·60대 여성 타깃) | 유지 |
| 말투/주제 차별화 | 양호(중복 0) | 정비 불필요 |
| persona-data 79 | 정본·DB 일치 | 유지 |
| curator-shared 중복 레지스트리 | 기술부채(죽은 정의 49) | **careful 백로그**(봇글 로직 위험·체감 0) |
| 특수 4봇 미정의 | 정합성 | 소규모 백로그 |
| 욕망 오타 | 데이터 위생 | 소규모 정리 |

→ **창업자 결정(2026-06-07): 마무리.** 페르소나 콘텐츠 건강 확인. 기술부채(curator 통일)는 위험 대비 체감 낮아 별도 백로그.
