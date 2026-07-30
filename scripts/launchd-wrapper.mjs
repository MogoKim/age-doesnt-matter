#!/usr/bin/env node
// launchd-wrapper.mjs — bash 대체 launchd 래퍼 (node 기반)
//
// 이유: /bin/bash는 kTCCServiceSystemPolicyDocumentsFolder TCC 권한 없음 →
//       launchd에서 ~/Documents/ 접근 불가 (Operation not permitted).
//       node(/Users/yanadoo/.nvm/versions/node/v24.14.0/bin/node)는 TCC 승인됨.
//
// 역할: launchd-alert.sh와 동일 — caffeinate로 슬립 방지 + 실패 시 Slack 알림.
// Usage: node launchd-wrapper.mjs <label> <cmd> [args...]
//
// 작업 디렉토리(UNAO_WORKDIR):
//   개발 작업트리를 그대로 운영에 쓰다 보니, 브랜치가 main보다 한참 뒤처진 상태로
//   로컬 크론이 돌아 옛 코드가 실행되는 일이 있었다(2026-07-30). 운영 실행 경로를
//   개발 작업트리와 분리할 수 있도록 환경변수로 받는다.
//   plist의 EnvironmentVariables에 UNAO_WORKDIR을 넣으면 그 경로에서 실행된다.
//   미설정이면 기존 경로를 그대로 쓰므로 plist를 바꾸기 전까지 동작이 달라지지 않는다.

import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

const [, , label, cmd, ...args] = process.argv;

/** UNAO_WORKDIR 미설정 시 쓰는 기존 경로 — plist 전환 전까지의 호환용. */
const DEFAULT_WORKDIR = '/Users/yanadoo/Documents/New_Claude_agenotmatter';

const envWorkdir = process.env.UNAO_WORKDIR?.trim();
const cwd = envWorkdir || DEFAULT_WORKDIR;

// 어느 경로에서 돌았는지 로그 첫 줄에 남긴다 — 옛 경로로 도는 상황을 로그만 보고 알 수 있게.
if (envWorkdir) {
  console.log(`[launchd-wrapper] ${label} · workdir=${cwd} (UNAO_WORKDIR)`);
} else {
  console.log(`[launchd-wrapper] ${label} · workdir=${cwd} (UNAO_WORKDIR 미설정 — 기본 경로 fallback)`);
}

// UNAO_WORKDIR을 줬는데 그 경로가 없으면 조용히 기본 경로로 떨어지지 않는다.
// 잘못된 경로를 준 채로 옛 코드가 계속 도는 것이 이번 사고의 형태였다.
if (envWorkdir && !existsSync(cwd)) {
  console.error(`[launchd-wrapper] UNAO_WORKDIR 경로가 존재하지 않는다: ${cwd}`);
  process.exit(1);
}

// caffeinate -i 로 Mac 슬립 방지하면서 명령 실행
const result = spawnSync('/usr/bin/caffeinate', ['-i', cmd, ...args], {
  stdio: 'inherit',
  cwd,
});

const exitCode = result.status ?? 1;

if (exitCode !== 0) {
  try {
    const env = readFileSync(`${cwd}/.env.local`, 'utf8');
    const token = env.match(/^SLACK_BOT_TOKEN=(.+)$/m)?.[1]?.trim();
    const channel = env.match(/^SLACK_CHANNEL_ALERT_SYSTEM=(.+)$/m)?.[1]?.trim();
    if (token && channel) {
      const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
      spawnSync('curl', [
        '-s', '-X', 'POST', 'https://slack.com/api/chat.postMessage',
        '-H', `Authorization: Bearer ${token}`,
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify({
          channel,
          text: `🚨 *로컬 에이전트 실패* — \`${label}\`\n종료코드: ${exitCode}\n시각: ${timestamp} KST\n작업경로: ${cwd}\n→ 터미널에서 로그 확인: ${cwd}/logs/${label}.log`,
        }),
      ], { stdio: 'ignore' });
    }
  } catch { /* Slack 알림 실패는 무시 */ }
}

process.exit(exitCode);
