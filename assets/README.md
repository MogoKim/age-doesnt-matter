# 디자인 자산 저장소

## 폴더 구조

```
assets/
  originals/          — 원본 자산 (변경 불가, Git에 커밋)
    brand/            — 로고, 브랜드 요소, BGM 원본
    photos/           — 실사 사진 원본
  generated/          — 에이전트 생성 결과물 (Git 제외 — .gitignore)
    ads/              — YYYYMMDD_캠페인명_v1.png 형식
    sns/              — 채널별 SNS 이미지
    magazine/         — 매거진 썸네일
    video/            — 영상 아웃풋
  approved/           — 창업자 승인 완료 → 배포 준비 (Git에 커밋)
    ads/
    sns/
```

## Naming Rule

| 타입 | 형식 | 예시 |
|------|------|------|
| 광고 이미지 | `YYYYMMDD_[캠페인명]_[메시지번호]_[사이즈].png` | `20260407_인지도_m1_1200x628.png` |
| SNS 이미지 | `YYYYMMDD_[채널]_[주제].png` | `20260407_instagram_인생2막.png` |
| 영상 | `YYYYMMDD_[주제]/final_[비율].mp4` | `20260407_우나어소개/final_16x9.mp4` |

## 승인 워크플로우

1. 에이전트 생성 → `generated/` 폴더
2. 창업자 검토 → "승인해" 발화
3. `approved/` 폴더로 이동
4. 플랫폼에 수동 업로드
