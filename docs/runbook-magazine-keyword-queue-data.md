# 매거진 keyword queue 데이터 백업/복구 런북

> 대상: `agents/magazine/data/` (gitignore, git 미추적). 매거진은 **로컬 launchd 전용** 실행이라 이 폴더의 파일을 직접 읽는다.
> PR-1(2026-07-21)에서 확정: 이 데이터가 소실되면 큐가 동작 못 하거나 소비 이력이 날아간다.

## 파일별 성격

| 파일 | 재생성 | 백업 필요 | 설명 |
|---|---|---|---|
| `keyword-universe.json` | ✅ 가능 (`keyword-research/run-full-collect.ts`) | 권장(재수집 비용·시간) | 리서치된 키워드 1,367개. autocomplete+GSC near-miss 재수집으로 복구 가능하나 수 시간·API 소요 |
| `keyword-queue-state.json` | ❌ **불가** | **필수** | 소비 이력(consumedNormalized·retryCount·events). 소실 시 이미 발행한 주제를 다시 뽑아 중복 발행 |
| `keyword-queue-preview.dry-run.json` | ✅ (dry-run 재실행) | 불필요 | 미리보기 산출물, 운영 무관 |

## 백업 절차 (로컬 운영 기준)

1. **state 일일 백업** (가장 중요):
   ```bash
   cp agents/magazine/data/keyword-queue-state.json \
      ~/backups/unao/keyword-queue-state.$(date +%F).json
   ```
   - launchd 발행(12:00·14:00 KST) 이후 시점 권장. 최근 7개 정도 보관.
2. **universe 분기별 스냅샷**: `run-full-collect` 재생성 시 이전 universe를 `keyword-universe.$(date +%F).json`으로 보관.

## 복구 절차

- **state 소실**: 최신 백업본을 `keyword-queue-state.json`으로 복사. 백업도 없으면 → 최후수단으로 DB의 발행 매거진 제목을 consumed로 재구성(정확도 낮음, PR-1의 DB subtopic 가드가 중복은 막아주므로 치명적이진 않음).
- **universe 소실**: `npx tsx agents/magazine/keyword-research/run-full-collect.ts`로 재생성.

## 원자성 (PR-1 반영)

- `saveState`는 `tmp write → rename`(POSIX 원자적)이라 **쓰다 크래시해도 기존 state 파일은 온전**하다.
- 저장 직전 디스크 consumed를 **합집합 merge**하므로 morning/late 세션이 겹쳐도 소비 이력 유실 없음.

## GHA 이전 금지

- 매거진 발행은 **ChatGPT/Gemini Playwright(로컬 브라우저)** 의존 → GHA 실행 불가.
- 따라서 `data/`도 로컬 유지가 정답. GHA로 옮기면 이미지·데이터 둘 다 깨진다. gitignore 유지.
