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
// 작업 디렉토리(UNAO_WORKDIR) — **필수**:
//   plist의 EnvironmentVariables에 UNAO_WORKDIR을 넣으면 그 경로에서 실행된다.
//   운영 크론=unao-prod / 네이버 스크래퍼=unao-ops. 개발 작업트리를 넣지 마라.
//   UNAO_WORKDIR 미설정 시 old workspace fallback으로 새 코드+옛 의존성이 섞이는
//   사고를 막기 위해 즉시 실패한다(2026-07-30 사고 재발 방지).

import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const [, , label, cmd, ...args] = process.argv;

/** 설정 오류 전용 종료코드(EX_CONFIG) — 일반 실패(1)와 구분해 로그·launchctl에서 식별한다. */
const EX_CONFIG = 78;

/**
 * 이 래퍼가 속한 작업트리. plist가 `<트리>/scripts/launchd-wrapper.mjs`를 절대경로로
 * 지목하므로 항상 운영 트리(unao-prod / unao-ops)를 가리킨다.
 * UNAO_WORKDIR이 없어 cwd를 모를 때 Slack 토큰을 찾는 용도로만 쓴다.
 * old workspace를 후보로 두지 않는 것이 핵심이다.
 */
const SELF_TREE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `<tree>/.env.local`에서 Slack 토큰을 읽어 알림을 보낸다. 실패는 무시한다. */
function notifySlack(tree, text) {
  try {
    const env = readFileSync(`${tree}/.env.local`, 'utf8');
    const token = env.match(/^SLACK_BOT_TOKEN=(.+)$/m)?.[1]?.trim();
    const channel = env.match(/^SLACK_CHANNEL_ALERT_SYSTEM=(.+)$/m)?.[1]?.trim();
    if (!token || !channel) return;
    spawnSync('curl', [
      '-s', '-X', 'POST', 'https://slack.com/api/chat.postMessage',
      '-H', `Authorization: Bearer ${token}`,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ channel, text }),
    ], { stdio: 'ignore' });
  } catch { /* Slack 알림 실패는 무시 */ }
}

const timestamp = () => new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

const envWorkdir = process.env.UNAO_WORKDIR?.trim();

// UNAO_WORKDIR은 필수다. 없으면 조용히 옛 경로로 떨어지지 않고 즉시 멈춘다.
if (!envWorkdir) {
  console.error(`[launchd-wrapper] ${label} · FATAL: UNAO_WORKDIR 미설정 — 실행 중단.`);
  console.error(`  → plist의 EnvironmentVariables에 UNAO_WORKDIR를 추가하라 (운영: unao-prod / 스크래퍼: unao-ops).`);
  notifySlack(SELF_TREE, `🚨 *로컬 에이전트 설정 오류* — \`${label}\`\nUNAO_WORKDIR 미설정으로 실행하지 않았다.\n시각: ${timestamp()} KST\n→ plist의 EnvironmentVariables에 UNAO_WORKDIR 추가 필요 (종료코드 ${EX_CONFIG})`);
  process.exit(EX_CONFIG);
}

const cwd = envWorkdir;

// 어느 경로에서 돌았는지 로그 첫 줄에 남긴다 — 실행 경로를 로그만 보고 알 수 있게.
console.log(`[launchd-wrapper] ${label} · workdir=${cwd} (UNAO_WORKDIR)`);

// 잘못된 경로를 준 채로 옛 코드가 계속 도는 것이 2026-07-30 사고의 형태였다.
if (!existsSync(cwd)) {
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
  notifySlack(cwd, `🚨 *로컬 에이전트 실패* — \`${label}\`\n종료코드: ${exitCode}\n시각: ${timestamp()} KST\n작업경로: ${cwd}\n→ 터미널에서 로그 확인: ${cwd}/logs/${label}.log`);
}

process.exit(exitCode);
