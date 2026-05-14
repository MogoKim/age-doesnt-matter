#!/usr/bin/env node
// launchd-wrapper.mjs — bash 대체 launchd 래퍼 (node 기반)
//
// 이유: /bin/bash는 kTCCServiceSystemPolicyDocumentsFolder TCC 권한 없음 →
//       launchd에서 ~/Documents/ 접근 불가 (Operation not permitted).
//       node(/Users/yanadoo/.nvm/versions/node/v24.14.0/bin/node)는 TCC 승인됨.
//
// 역할: launchd-alert.sh와 동일 — caffeinate로 슬립 방지 + 실패 시 Slack 알림.
// Usage: node launchd-wrapper.mjs <label> <cmd> [args...]

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';

const [, , label, cmd, ...args] = process.argv;
const cwd = '/Users/yanadoo/Documents/New_Claude_agenotmatter';

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
          text: `🚨 *로컬 에이전트 실패* — \`${label}\`\n종료코드: ${exitCode}\n시각: ${timestamp} KST\n→ 터미널에서 로그 확인: ~/Documents/New_Claude_agenotmatter/logs/${label}.log`,
        }),
      ], { stdio: 'ignore' });
    }
  } catch { /* Slack 알림 실패는 무시 */ }
}

process.exit(exitCode);
