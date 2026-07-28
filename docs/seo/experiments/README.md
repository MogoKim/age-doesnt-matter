# SEO 실험 기록 규칙

SEO 변경은 반드시 이 폴더에 실험 문서를 남긴다.

파일명:

`YYYY-MM-DD-{slug}.md`

필수 구조:

```md
# 제목

## 목적

## Baseline

## 변경 범위

## 적용 일시

## 1차 확인

## 2차 확인

## PASS 기준

## FAIL 기준

## 결과

## 후속 조치
```

원칙:

- baseline만 있고 결과가 없으면 실패한 실험으로 본다.
- Google Search Console은 데이터 지연을 감안해 최소 7일, 중요 변경은 14일 뒤 2차 확인한다.
- 신규 noindex, sitemap 제외, canonical 변경은 반드시 dry-run 또는 대상 URL 목록을 먼저 남긴다.

