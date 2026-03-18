# 룰 유지 설계 (Rule Maintenance Architecture)

> **"서비스가 자동으로 돌아가도, 헌법은 절대 흔들리지 않는다."**
> 이 문서는 우나어의 룰이 시간이 지나도 유지되는 구조를 설명합니다.

**문서 버전**: v3.1
**최종 수정일**: 2026-03-16

---

## 1. 룰 계층 구조

```
NORTH_STAR.md            ← 최상위: 사람이 읽는 원본 (창업자 의도·맥락·이유)
      ↓ 동기화
constitution.yaml        ← 기계어 버전: 에이전트가 파싱하는 구조화 데이터
      ↓ 주입
모든 에이전트 System Prompt ← 실행 시점마다 헌법을 읽어서 판단 기준으로 사용
      ↓ 감시
CEO 에이전트              ← 다른 에이전트의 헌법 위반을 탐지·차단·보고
```

---

## 2. 왜 2개의 문서인가?

| | NORTH_STAR.md | constitution.yaml |
|---|---|---|
| **읽는 주체** | 창업자, 개발자, 운영자 | AI 에이전트 |
| **언어** | 자연어 (한국어, 감성·맥락 포함) | YAML (구조화, 파싱 가능) |
| **목적** | "왜 이 서비스인가" — 판단의 맥락 | "어떻게 판단할 것인가" — 판단의 기준 |
| **변경 권한** | 창업자만 | 창업자만 (에이전트 수정 불가) |
| **동기화** | NORTH_STAR.md가 원본. constitution.yaml은 이를 기계적으로 반영 |

### 동기화 규칙

1. NORTH_STAR.md가 **항상 원본** (Source of Truth)
2. constitution.yaml은 NORTH_STAR.md의 기계어 번역
3. 둘 사이에 충돌이 있으면 NORTH_STAR.md가 우선
4. 에이전트가 해석 불가능한 상황 → 창업자에게 질의 (텔레그램 알림)

---

## 3. 룰이 유지되는 3가지 메커니즘

### 3-1. Git 버전 관리 (변경 추적)

| 항목 | 내용 |
|---|---|
| **무엇을** | constitution.yaml, NORTH_STAR.md 모든 변경 |
| **어떻게** | git commit으로 누가·언제·무엇을·왜 바꿨는지 기록 |
| **보호** | 에이전트는 이 파일에 write 불가 (읽기 전용) |
| **변경 절차** | 창업자가 직접 편집 → commit → 에이전트 다음 실행 시 자동 반영 |

### 3-2. 에이전트 System Prompt 주입 (실행 시 로딩)

```typescript
// agents/core/agent.ts
// 에이전트가 실행될 때마다 constitution.yaml을 새로 읽음
const constitution = readFileSync('./core/constitution.yaml', 'utf-8');

// 모든 에이전트 System Prompt 첫 줄에 헌법 주입
const systemPrompt = `
[우나어 회사 헌법]
${constitution}

당신은 위 헌법을 절대 기준으로 모든 판단을 내립니다.
헌법에 위배되는 요청은 거부하고 창업자에게 텔레그램 알림을 보냅니다.
`;
```

- constitution.yaml이 바뀌면 **다음 실행(Cron/수동)부터 자동 반영**
- 에이전트 재시작 불필요 — 매 실행마다 최신 파일을 읽음

### 3-3. CEO 에이전트 감시 (실시간 교정)

```
CEO 모닝 사이클:
  1. 전날 모든 에이전트 액션 로그 읽기
  2. 각 액션을 constitution.yaml 기준으로 위반 여부 체크
  3. 위반 발견 시:
     → 해당 에이전트 일시 정지
     → 텔레그램 봇으로 창업자에게 즉시 알림
     → 창업자 승인 전까지 해당 에이전트 비활성화
  4. 정상인 경우:
     → 일일 리포트 생성 → 텔레그램 모닝 브리핑 채널
```

---

## 4. 헌법 수정 프로세스 (창업자 전용)

```
① NORTH_STAR.md 먼저 수정 (의도·맥락 기록)
   ↓
② constitution.yaml 동기화 (구조화 데이터 반영)
   ↓
③ git commit (변경 이유 명시)
   ↓
④ 다음 에이전트 실행 시 자동 반영
   ↓
⑤ CEO 에이전트 모닝 사이클에서 변경사항 확인 리포트
```

### 수정 시 주의사항

| 항목 | 기준 |
|---|---|
| 수정 불가 | Mission, Vision, Core Values, Content Policy (ABSOLUTE_ZERO) |
| 수정 가능 | KPI 수치, Phase 상태, 에이전트 권한, 메뉴 구성 |
| 수정 권한 | 창업자 1인 (에이전트·개발자 수정 불가) |
| 수정 기록 | git commit 메시지에 "왜 바꿨는지" 반드시 기재 |

---

## 5. Phase별 헌법 변화 예상

| Phase | 주요 변경 예상 | 변경 불가 영역 |
|---|---|---|
| **Phase 1 (현재)** | `automation_status: LOCKED`. 사이트 완성 집중 | Mission/Vision/Values/Content Policy |
| **Phase 2** | `automation_status: ACTIVE` 변경. 봇 규칙·발행 정책 추가. 자동화 에이전트 권한 확대 | 동일 |
| **Phase 3** | 커머스·프리미엄 광고 정책 추가. 수익 관련 에이전트 규칙 추가. 쇼핑 메뉴 활성화 | 동일 |

---

## 6. 실제로 룰이 지켜지는 시나리오

### 시나리오 1: CMO 에이전트가 정치 관련 트렌드 글 제안

```
CMO: "오늘 정치 이슈가 핫합니다. 관련 콘텐츠 발행하면 트래픽 상승 예상"
CEO: constitution.yaml → prohibited.ABSOLUTE_ZERO → "정치적 발언" 확인
CEO: "헌법 위반. 거부합니다. 다른 주제로 제안하세요."
→ 텔레그램 알림: "CMO가 정치 콘텐츠 제안 → CEO가 차단함"
```

**판단 근거**: ABSOLUTE_ZERO는 어떤 KPI 향상도 정당화할 수 없다.

### 시나리오 2: COO 에이전트가 자동화 봇 가동 시도 (Phase 1)

```
COO: "일자리 봇 실행 준비 완료. 가동하겠습니다."
CEO: constitution.yaml → automation_status: LOCKED 확인
CEO: "현재 Phase 1. automation_status가 LOCKED. 봇 실행 불가."
→ 텔레그램 알림: "COO가 봇 실행 요청 → Phase 1이므로 거부됨. 창업자 확인 필요 시 승인 요청."
```

**판단 근거**: Phase 1에서 자동화는 범위 밖. 창업자가 Phase 2로 전환해야 가능.

### 시나리오 3: 에이전트가 헌법 자체를 수정 시도

```
에이전트: "효율적 운영을 위해 비용 상한을 $100으로 올리겠습니다"
CEO: guardrails.must_approve → "이 헌법(constitution.yaml) 수정" 확인
CEO: "헌법 수정은 창업자 전용 권한. 에이전트는 수정 불가. 즉시 거부."
→ 해당 에이전트 일시 정지
→ 텔레그램 긴급 알림: "에이전트가 헌법 수정 시도 → 정지 처리됨"
```

**판단 근거**: 헌법은 서비스의 DNA. 에이전트가 자기 규칙을 바꾸는 것은 절대 불가.

### 시나리오 4: 사용자 글에 혐오 표현 포함

```
시스템: 사용자 글 등록 → AI 금지어 필터 작동
필터: "혐오 표현" 감지 → 즉시 숨김 처리
→ 어드민 대시보드에 "숨김 처리된 글" 표시
→ PO가 최종 판단 (복원 또는 삭제)
→ 누적 3회 시 사용자 경고
```

**판단 근거**: content_policy.moderation.auto_filter + report_threshold

---

## 7. 요약

> **헌법은 코드가 아니라 서비스의 DNA다.**
> 에이전트가 100개가 되어도, 서비스가 5년이 지나도
> constitution.yaml 한 파일이 모든 판단의 기준이 된다.

### 핵심 원칙 3줄 요약

1. **NORTH_STAR.md가 원본**, constitution.yaml은 기계어 번역
2. **에이전트는 매 실행마다 헌법을 읽고**, 모든 판단을 헌법 기준으로 내린다
3. **CEO 에이전트가 감시**하고, 위반 시 정지 + 텔레그램으로 창업자 알림
