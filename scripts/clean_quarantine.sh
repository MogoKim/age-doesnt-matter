#!/usr/bin/env bash
# clean_quarantine.sh — _quarantine 폴더 영구 삭제 스크립트
# 사용법: bash scripts/clean_quarantine.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
QUARANTINE_DIR="$ROOT_DIR/_quarantine"
TODAY=$(date +%Y-%m-%d)

if [ ! -d "$QUARANTINE_DIR" ]; then
  echo "❌ _quarantine 폴더 없음. 이미 삭제됐거나 경로 오류."
  exit 1
fi

echo "📋 격리 폴더 현황:"
du -sh "$QUARANTINE_DIR"/* 2>/dev/null || echo "  (비어있음)"

# 삭제 기한 초과 항목 확인
echo ""
echo "📅 삭제 기한 확인:"
for manifest in "$QUARANTINE_DIR"/*/quarantine_manifest.md; do
  if [ -f "$manifest" ]; then
    folder=$(dirname "$manifest" | xargs basename)
    deadline=$(grep -m1 "삭제 예정일" "$manifest" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)
    if [ -n "$deadline" ] && [[ "$TODAY" > "$deadline" || "$TODAY" == "$deadline" ]]; then
      echo "  ⚠️  $folder — 삭제 기한 초과 ($deadline)"
    else
      echo "  ✅ $folder — 기한 미도래 ($deadline)"
    fi
  fi
done

echo ""
echo "⚠️  영구 삭제 전 최종 확인"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -r -p "✅ 지난 7일간 서비스가 정상 작동했나요? (y/n): " CONFIRM_1
if [ "$CONFIRM_1" != "y" ]; then
  echo "❌ 취소됨. 7일 운영 확인 후 재실행하세요."
  exit 0
fi

read -r -p "✅ 격리 파일들이 현재 프로젝트에서 참조되지 않음을 확인했나요? (y/n): " CONFIRM_2
if [ "$CONFIRM_2" != "y" ]; then
  echo "❌ 취소됨. 참조 확인 후 재실행하세요."
  exit 0
fi

read -r -p "🚨 정말 _quarantine 폴더를 영구 삭제하시겠습니까? 복구 불가! (yes/no): " FINAL
if [ "$FINAL" != "yes" ]; then
  echo "❌ 취소됨."
  exit 0
fi

echo ""
echo "🗑️  영구 삭제 실행 중..."
rm -rf "$QUARANTINE_DIR"
echo "✅ 삭제 완료: _quarantine 폴더 제거됨 ($TODAY)"
echo "💡 git에 반영하려면: git add -A && git commit -m \"chore: _quarantine 영구 삭제 ($TODAY)\""
