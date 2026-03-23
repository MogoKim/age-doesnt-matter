# GitHub Actions Secrets 설정 가이드

## 필수 (CI/CD)
이미 Vercel에 설정된 값과 동일하게 입력합니다.

| Secret 이름 | 설명 | 설정 위치 |
|-------------|------|----------|
| `DATABASE_URL` | Supabase Transaction Pooler URL | Supabase > Settings > Database |
| `AUTH_SECRET` | NextAuth 비밀키 | `.env.vercel` 참조 |
| `SITE_URL` | 프로덕션 URL | 현재: `https://age-doesnt-matter-mogoyongseok-8318s-projects.vercel.app` |

## 에이전트 시스템 전용
에이전트를 가동하려면 아래 시크릿이 필요합니다.

| Secret 이름 | 설명 | 발급 방법 |
|-------------|------|----------|
| `ANTHROPIC_API_KEY` | Claude API 키 | console.anthropic.com > API Keys |
| `TELEGRAM_BOT_TOKEN` | 텔레그램 봇 토큰 | @BotFather에게 `/newbot` |
| `TELEGRAM_CHAT_ID` | 알림 수신 채팅방 ID | 봇에게 메시지 후 `getUpdates` API |

## 설정 방법

### 1. GitHub 웹에서
1. Repository > Settings > Secrets and variables > Actions
2. "New repository secret" 클릭
3. Name + Secret 입력 후 "Add secret"

### 2. CLI로 (gh 명령)
```bash
gh secret set ANTHROPIC_API_KEY
gh secret set TELEGRAM_BOT_TOKEN
gh secret set TELEGRAM_CHAT_ID
gh secret set DATABASE_URL
gh secret set SITE_URL
```

## 에이전트 가동 절차
1. 위 시크릿 설정 완료
2. `agents/core/constitution.yaml`에서 `automation_status: "LOCKED"` → `"ACTIVE"` 변경
3. GitHub Actions > Agents — Hourly > Run workflow (수동 테스트)
4. 정상 동작 확인 후 자동 스케줄 가동
