# Quarantine Manifest — 2026-04-28_cleanup

**격리 일시**: 2026-04-28  
**삭제 예정일**: 2026-05-05 (7일 후)  
**복구 방법**: `mv _quarantine/2026-04-28_cleanup/<항목> <원래경로>`  
**검증 완료**: tsc ✅ | build ✅ | grep-참조 ✅ | cron-links ✅ (Stage 3에서 확인)

---

## 격리 항목 목록

| 항목 | 원래 경로 | 크기 | 격리 사유 | src/ 참조 |
|------|----------|------|----------|----------|
| android/ | /android/ | 32MB | Android 앱 폐기 결정, 빌드 산출물 | 없음 |
| outputs/ | /outputs/ | 3.5MB | 설계 스냅샷, 소스코드 아님 | 없음 |
| apk-aab/app-release-bundle.aab | /app-release-bundle.aab | 1.3MB | Android 빌드 산출물 | 없음 |
| apk-aab/app-release-signed.apk | /app-release-signed.apk | 1.2MB | Android 빌드 산출물 | 없음 |
| apk-aab/app-release-signed.apk.idsig | /app-release-signed.apk.idsig | 18KB | Android 서명 파일 | 없음 |
| apk-aab/app-release-unsigned-aligned.apk | /app-release-unsigned-aligned.apk | 1.2MB | Android 빌드 산출물 | 없음 |
| root-images/article1-galgangi.png | /article1-galgangi.png | 884KB | QA/디자인 캡처본 | 없음 |
| root-images/logo 1.png | /assets/logo 1.png | — | 미사용 에셋 | 없음 |
| root-images/gtm-tags.png | /gtm-tags.png | 62KB | GTM 설정 캡처본 | 없음 |
| root-images/gtm-workspace.png | /gtm-workspace.png | 88KB | GTM 설정 캡처본 | 없음 |
| root-images/magazine-article-today.jpeg | /magazine-article-today.jpeg | 348KB | 디자인 캡처본 | 없음 |
| root-images/magazine-article2-today.jpeg | /magazine-article2-today.jpeg | 72KB | 디자인 캡처본 | 없음 |
| root-images/magazine-full.png | /magazine-full.png | 628KB | 디자인 캡처본 | 없음 |
| root-images/magazine-list-final.png | /magazine-list-final.png | 708KB | 디자인 캡처본 | 없음 |
| root-images/qa-signup-banner-result.png | /qa-signup-banner-result.png | 96KB | QA 결과 캡처본 | 없음 |
| root-images/store_icon.png | /store_icon.png | 28KB | Android 스토어 아이콘 | 없음 |
| docs-html/04-report/ | /docs/04-report/ | — | 자동생성 보고서 폴더 | 없음 |
| docs-html/ad-briefs/ | /docs/ad-briefs/ | 68KB | 광고 브리프 HTML (완료된 캠페인) | 없음 |
| docs-html/Campaign_Strategy_Roadmap.html | /docs/video-ads/Campaign_Strategy_Roadmap.html | — | 캠페인 로드맵 HTML | 없음 |
| scripts-oneshot/_tmp_qa_brief.ts | /scripts/_tmp_qa_brief.ts | 5.7KB | 임시 QA 스크립트 | 없음 |
| scripts-oneshot/pwa-stats.ts | /scripts/pwa-stats.ts | 3.9KB | runner.ts/GHA 미등록 스크립트 | 없음 |
| agents-temp/fetch_cafe_data.ts | /agents/fetch_cafe_data.ts | — | 로컬 전용 실험 스크립트, runner.ts 미등록 | 없음 |
| agents-temp/run-local.ts | /agents/run-local.ts | — | 로컬 전용 실험 스크립트, runner.ts 미등록 | 없음 |
| agents-temp/lang-analysis.mts | /agents/lang-analysis.mts | — | 실험용 로컬 파일 | 없음 |
| agents-temp/pwa-stats.ts | /agents/pwa-stats.ts | — | 실험용 로컬 파일 | 없음 |
| orphans/exit | /exit | 0B | 빈 파일, 목적 불명 | 없음 |
| orphans/test-seo.js | /test-seo.js | 413B | 임시 SEO 테스트 스크립트 | 없음 |
| orphans/manifest-checksum.txt | /manifest-checksum.txt | 40B | 미참조 체크섬 파일 | 없음 |
| orphans/twa-manifest.json | /twa-manifest.json | — | Android TWA 설정 (앱 폐기) | 없음 |
| launchd-unused/cafe-crawler-evening.plist | /launchd/com.unaeo.cafe-crawler-evening.plist | — | launchctl 미등록 확인됨 | 없음 |
| launchd-unused/cafe-crawler-lunch.plist | /launchd/com.unaeo.cafe-crawler-lunch.plist | — | launchctl 미등록 확인됨 | 없음 |
| launchd-unused/cafe-crawler-morning.plist | /launchd/com.unaeo.cafe-crawler-morning.plist | — | launchctl 미등록 확인됨 | 없음 |

---

## 직접 삭제 항목 (이미 _quarantine/에 보관됨 — 중복 원본 제거)

| 원본 위치 | _quarantine 보관 위치 | 삭제 일시 |
|----------|---------------------|---------|
| /scripts/add-canonicals.js | _quarantine/scripts/ | 2026-04-28 |
| /scripts/extract-menu-ids.ts | _quarantine/scripts/ | 2026-04-28 |
| /scripts/fix-broken-scraped-posts.ts | _quarantine/scripts/ | 2026-04-28 |
| /scripts/fix-existing-jobs.ts | _quarantine/scripts/ | 2026-04-28 |
| /scripts/fix-scraped-content.ts | _quarantine/scripts/ | 2026-04-28 |
| /scripts/generate-icons.ts | _quarantine/scripts/ | 2026-04-28 |
| /scripts/migrate-trending-columns.ts | _quarantine/scripts/ | 2026-04-28 |
| /scripts/reset-jisik-rows.ts | _quarantine/scripts/ | 2026-04-28 |
| /agents/cmo/test-platforms.ts | _quarantine/agents/cmo/ | 2026-04-28 |
| /agents/scripts/magazine-fix.ts | _quarantine/agents/scripts/ | 2026-04-28 |
| /agents/scripts/magazine-qa-check.ts | _quarantine/agents/scripts/ | 2026-04-28 |

---

## 보존 확정 (격리 제외)

| 항목 | 이유 |
|------|------|
| launchd/com.unaeo.session-refresh.plist | launchctl 활성 실행 중 (PID 0) |
| launchd/com.unaeo.magazine-*.plist (3개) | launchctl 등록 상태 (exit 127이나 설정 보존) |
| prisma/migrations/ 신규 2개 | DB 마이그레이션 이력 — 절대 삭제 금지 |
| docs/video-ads/ 마크다운 파일 | 콘텐츠 전략 문서, git 추적 중 |
| docs/design/DESIGN_SYSTEM_REVIEW.md | 디자인 시스템 문서 |

---

## 삭제 절차

```bash
# 7일 후 서비스 정상 확인 시:
bash scripts/clean_quarantine.sh
```
