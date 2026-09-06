# 기능 문서 (docs/features)

**기능 인덱스의 정본은 [`REGISTRY.md`](REGISTRY.md)다.** 기능 ID(F/A/I/M/R 계열)·상태·담당 파일·문서 링크는 REGISTRY에서 찾는다. 이 README는 안내만 한다.

## 파일 규칙
- 기능 문서: `{ID}-{name}.md` (예: `A03-job-scraper.md`, `A04-external-content.md`). 신규·개선·제거 절차는 `.claude/rules/feature-lifecycle.md`.
- 자동화(A·M 계열) 문서의 "가동 중" 서술은 현재 상태가 아닐 수 있다 — `REGISTRY.md` 상단 실측 배너와 `agents/core/constitution.yaml`의 `automation_status`를 먼저 본다.

## 정본 안내 (구판 정리, 2026-09-06)
| 주제 | 정본 | 비고 |
|---|---|---|
| 일자리봇 | [A03-job-scraper.md](A03-job-scraper.md) | 구 `jobs-bot.md`(2026-04-21) 삭제 — A03이 2026-04-27 마이그레이션본 |
| 외부 콘텐츠(Google Sheets 스크래퍼) | [A04-external-content.md](A04-external-content.md) | 구 `external-content.md`(2026-04-21) 삭제 — Sheets 운영·점검 절차는 A04 §운영 절차로 흡수 |

## 문서 구성 원칙
각 기능 문서는 목표 · 배경 · 세부 기획 · 관련 링크 · 수정 히스토리 · 이슈 히스토리를 갖는다. 이슈 발생 시 해당 문서의 트러블슈팅/이슈 히스토리부터 확인하고, 실측 없이 "가동 중"으로 단정하지 않는다.
