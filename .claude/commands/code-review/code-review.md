코드 리뷰 체크리스트 — PR 생성 전, 또는 코드 변경이 완료된 후 품질 검증할 때 사용합니다. '리뷰해줘', 'PR 만들기 전에 확인', '코드 점검' 등을 말할 때 트리거됩니다.

## 체크리스트

### 1. 필수 검증 (자동)
```bash
npx tsc --noEmit          # 타입 에러
npx eslint . --ext .ts,.tsx  # 린트
```

### 2. 시니어 UI 규칙 (UI 변경 시)
- [ ] 터치 타겟 52x52px 이상
- [ ] 폰트 최소 15px (caption/배지), 본문 18px
- [ ] 버튼 높이 52px(모바일) / 48px(데스크탑)
- [ ] 모달: 모바일=하단 풀스크린 시트
- [ ] "시니어" 용어 사용 여부 (절대 금지)
상세: `references/senior-ui-rules.md`

### 3. 보안 점검
- [ ] 사용자 입력 sanitize (XSS)
- [ ] SQL injection 방지 (Prisma 사용 시 자동)
- [ ] API 라우트 인증 확인 (getServerSession)
- [ ] 환경변수 하드코딩 여부
상세: `references/security-check.md`

### 4. 에이전트 코드 (agents/ 변경 시)
- [ ] BaseAgent 상속 여부
- [ ] BotLog 기록 여부
- [ ] notifySlack 호출 여부
- [ ] DB write는 COO만

### 5. 성능
- [ ] next/image 사용 (이미지)
- [ ] 서버 컴포넌트 기본 ('use client' 최소화)
- [ ] 불필요한 API 호출 없음

## 참조 파일
- `references/senior-ui-rules.md` — 시니어 UI 상세 규칙
- `references/security-check.md` — 보안 체크 상세
- `gotchas.md` — 리뷰에서 자주 놓치는 지점
