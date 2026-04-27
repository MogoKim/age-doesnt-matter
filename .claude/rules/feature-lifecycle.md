# Feature Lifecycle 규칙 (자동 적용 — 창업자 요청 없이도 실행)

> 이 규칙은 신규 기능 추가 / 기존 기능 개선 / 기능 제거 시 **Claude가 자동으로 적용**한다.
> /done 게이트의 2-F 단계에서 강제 실행된다.

---

## 1. Feature 감지 (자동)

`/done` 실행 시 변경 파일 목록을 `docs/features/REGISTRY.md`의 PATH MAP과 대조한다.

```
변경 파일 → PATH MAP 조회 → 영향받는 Feature ID 식별
예: agents/cafe/magazine-generator.ts 변경 → F05, A02 영향
```

매칭되는 Feature ID가 없으면: **새 기능으로 간주** → 신규 등록 절차 실행

---

## 2. 작업 유형 판단

| 작업 유형 | 판단 기준 |
|---------|---------|
| **신규 기능** | 새 파일 생성 (`git status` untracked) + REGISTRY에 없는 경로 |
| **기능 개선** | 기존 파일 수정 (`git diff`) + REGISTRY에 이미 등록된 Feature |
| **기능 제거** | 파일 삭제 (`git status` deleted) 또는 기능 비활성화 |

---

## 3. 신규 기능 추가 시 절차

### 3-A. REGISTRY.md 행 추가 (필수)
```
docs/features/REGISTRY.md → 적절한 섹션에 신규 행 추가
- ID: 섹션별 다음 번호 채번 (F10, A11, M05 등)
- 모든 필드 채움 (코드위치, 트리거/스케줄, 실행환경, 상태=ACTIVE, 최근변경=오늘)
```

### 3-B. Feature 문서 생성 (필수)
파일명: `docs/features/{ID}-{kebab-name}.md`

```markdown
# {기능명} 운영 기획서

> 최초 작성: {YYYY-MM-DD} | 최근 수정: {YYYY-MM-DD}

## 목표
이 기능이 달성하려는 비즈니스 목표 (1~3문장)

## 배경
왜 만들었는가, 어떤 문제를 해결하는가

## 세부 기획

### 파이프라인 / 트리거 조건
(흐름도 또는 단계별 설명)

### 핵심 로직
(중요한 비즈니스 규칙, 가드레일, 예외 처리)

### 스케줄 / 실행 환경
(크론 표현식, launchd 여부, GHA 여부)

### 비용 영향
(유료 API 사용 시: $X/월 예상)

## 관련 링크
- 코드: `{주요 파일 경로}`
- 워크플로우: `.github/workflows/{name}.yml`
- DB 모델: `prisma/schema.prisma` - {모델명}

## 수정 히스토리
| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| {YYYY-MM-DD} | 최초 생성 | - |

## 이슈 히스토리
| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| - | - | - | - |
```

### 3-C. 에이전트 신규 추가 시 추가 체크
- [ ] `agents/cron/runner.ts` HANDLERS 등록
- [ ] `.github/workflows/agents-*.yml` case문 추가 또는 `// LOCAL ONLY` 주석
- [ ] `constitution.yaml` canWrite 규칙 준수 (COO/QA만 DB write)
- [ ] 비용 영향 feature 문서에 명시

---

## 4. 기존 기능 개선 시 절차

### 4-A. Feature 문서 수정 이력 업데이트 (필수)
```
docs/features/{ID}-{name}.md → 수정 히스토리 섹션에 한 줄 추가
| {오늘날짜} | {변경 내용 한 줄 요약} | {이유} |
```

### 4-B. REGISTRY.md 최근변경 날짜 업데이트 (필수)
```
해당 Feature 행의 `최근변경` 컬럼 → 오늘 날짜로 갱신
```

### 4-C. 이슈 수정인 경우
```
docs/features/{ID}-{name}.md → 이슈 히스토리 섹션에 추가
| {날짜} | {증상} | {원인} | {해결} |
```

---

## 5. 기능 제거 시 절차 (가장 엄격)

### 5-A. REGISTRY.md 상태 변경
```
해당 행 상태: ACTIVE → ARCHIVED
ARCHIVED Features 섹션에 이동: | ID | 기능명 | 제거일 | 제거 사유 |
```

### 5-B. 제거 체크리스트 (순서대로 확인)
- [ ] `agents/cron/runner.ts` 해당 핸들러 제거
- [ ] `.github/workflows/` 해당 case문 제거
- [ ] `~/Library/LaunchAgents/` 해당 plist 제거 + launchctl unload
- [ ] 환경변수 정리: `.env.local`, GitHub Secrets (더 이상 필요 없는 것)
- [ ] DB 마이그레이션 필요 여부 확인 (컬럼/테이블 남길지)
- [ ] 다른 에이전트가 이 기능 결과물을 읽는지 확인 (BotLog 의존성)
- [ ] Google Search Console에 URL 제거 요청 필요 여부

### 5-C. Feature 문서 업데이트
```
docs/features/{ID}-{name}.md → 맨 위에 추가:
> ⚠️ ARCHIVED: {날짜} — {제거 사유}
```

---

## 6. /done 완료 보고에 추가할 항목

Gate 2-F 통과 시 완료 보고에 아래 추가:
```
Feature 문서: {ID} {기능명} — {신규생성 / 수정이력 추가 / ARCHIVED}
```

미처리 시 (경고, 커밋 막지 않음):
```
⚠️ Feature 문서화 미완: {영향받은 Feature ID} — 다음 작업 전에 처리 권장
```

---

## 7. 문서화 면제 케이스

아래는 2-F 게이트 스킵 가능:
- **버그 수정** (기능 동작 변경 없음, 단순 오류 수정)
- **리팩토링** (외부 동작 동일, 내부 코드만 변경)
- **설정값 변경** (환경변수, 상수 값 조정)
- **문서/메모리 파일만 변경**

단, 위 케이스라도 수정 이력 추가는 권장.
