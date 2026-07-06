#!/usr/bin/env bash
#
# ios-podfile-fix.sh — `npx cap sync ios` 이후 iOS Podfile 재보정 (idempotent)
#
# 배경:
#   @capacitor-firebase/analytics 의 default_subspec 은 'Lite'(Firebase 미링크)인데
#   플러그인 소스는 무조건 `import FirebaseCore/FirebaseAnalytics` 한다 → 기본 Podfile로는
#   "no such module 'FirebaseCore'" 빌드 실패. Podfile의 analytics pod 라인에
#   :subspecs => ['AnalyticsWithoutAdIdSupport'] (IDFA/ATT 불필요) 를 주입해야 빌드된다.
#
#   그런데 `npx cap sync ios` 는 Podfile의 `def capacitor_pods ... end` 블록을 통째로
#   재생성하므로 이 subspec 지정이 매번 소실된다. → 본 스크립트를 cap sync 직후 실행한다.
#
# 특성: 여러 번 실행해도 중복 삽입되지 않는다(idempotent).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PODFILE="${REPO_ROOT}/ios/App/Podfile"
SUBSPEC="AnalyticsWithoutAdIdSupport"

if [[ ! -f "${PODFILE}" ]]; then
  echo "[ios-podfile-fix] Podfile 없음: ${PODFILE} (npx cap add/sync ios 먼저 실행)" >&2
  exit 1
fi

# 이미 subspec이 적용된 analytics 라인이 있으면 아무것도 하지 않는다.
if grep -Eq "pod 'CapacitorFirebaseAnalytics'.*:subspecs *=> *\['${SUBSPEC}'\]" "${PODFILE}"; then
  echo "[ios-podfile-fix] 이미 적용됨 — 변경 없음 (idempotent)"
  exit 0
fi

# subspec 없는 analytics 라인(경로 문자열로 끝나는)에 subspec을 덧붙인다. 라인당 1회.
#   대상: pod 'CapacitorFirebaseAnalytics', :path => '.../@capacitor-firebase/analytics'
sed -i '' -E \
  "s|(pod 'CapacitorFirebaseAnalytics', :path => '[^']*@capacitor-firebase/analytics')([^,].*)?\$|\1, :subspecs => ['${SUBSPEC}']|" \
  "${PODFILE}"

if grep -Eq "pod 'CapacitorFirebaseAnalytics'.*:subspecs *=> *\['${SUBSPEC}'\]" "${PODFILE}"; then
  echo "[ios-podfile-fix] subspec 재주입 완료: ${SUBSPEC}"
else
  echo "[ios-podfile-fix] 경고: analytics 라인을 찾지 못했다. Podfile을 확인하라." >&2
  exit 1
fi
