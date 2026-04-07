# 영상 제작 파이프라인

> Claude Code + Sub-agent + Skill 구조로 자동 영상 생성.
> 참고: `클로드 + 영상 소재.md` (프로젝트 루트)

---

## 파이프라인 구조

```
창업자 요청 → Video Director Agent (오케스트레이터)
    │
    ├── 1. Script Skill (Claude Opus)
    │        주제 리서치 → 장면별 대본 → 나레이션 텍스트
    │
    ├── 2. Illustrate Skill (Gemini Imagen 3 Pro)
    │        장면별 이미지 생성 (BRAND_VISUAL_GUIDE.md 기준)
    │        저장: assets/generated/video/[날짜]/images/scene_01.png
    │
    ├── 3. TTS Skill (Gemini 2.5 Flash TTS)
    │        나레이션 텍스트 → MP3
    │        저장: assets/generated/video/[날짜]/audio/narration.mp3
    │
    ├── 4. Subtitle Skill (OpenAI Whisper API)
    │        MP3 → SRT 자막 파일
    │        저장: assets/generated/video/[날짜]/subtitles.srt
    │
    └── 5. Edit Skill (FFmpeg)
             이미지 슬라이드 + 오디오 합성
             자막 번인 (Pretendard 폰트)
             BGM 믹싱
             출력: assets/generated/video/[날짜]/final_16x9.mp4
                   assets/generated/video/[날짜]/final_9x16.mp4
```

---

## API 설정

### Gemini Imagen 3 Pro (이미지)
```
모델: imagen-3.0-generate-001
API: https://generativelanguage.googleapis.com/v1beta/models/...
키: GEMINI_API_KEY
가격: $0.04/장
```

### Gemini 2.5 Flash TTS (나레이션)
```
모델: gemini-2.5-flash (TTS 기능)
언어: ko-KR
목소리: 여성, 따뜻하고 차분
포맷: MP3
가격: $0.10/1M chars
```

### OpenAI Whisper (자막)
```
모델: whisper-1
언어: ko
포맷: SRT
API: https://api.openai.com/v1/audio/transcriptions
키: OPENAI_API_KEY
가격: $0.006/분
```

### FFmpeg (편집)
```
패키지: ffmpeg-static (npm)
설치: npm install ffmpeg-static (agents/ 폴더)
로컬 실행 (GitHub Actions에서도 가능)
```

---

## 출력 폴더 구조

```
assets/generated/video/
  └── 20260407_우나어_소개/
        ├── images/
        │     ├── scene_01.png
        │     ├── scene_02.png
        │     └── scene_03.png
        ├── audio/
        │     ├── narration.mp3
        │     └── bgm.mp3
        ├── subtitles.srt
        ├── script.txt
        ├── final_16x9.mp4     ← 유튜브/구글 애즈
        └── final_9x16.mp4     ← 인스타그램 릴스/숏폼
```

---

## BGM 출처

저작권 무료 음원:
- studio.youtube.com → 오디오 보관함 → 장르: 클래식, 피아노
- 다운로드 후 `assets/originals/brand/bgm/` 에 저장
- 파일명: `bgm_calm_piano_01.mp3`

---

## 품질 기준

| 항목 | 기준 |
|------|------|
| 해상도 | 1080p (1920×1080) |
| 프레임 | 30fps |
| 오디오 비트레이트 | 128kbps |
| 자막 동기화 | ±0.3초 이내 |
| 영상 길이 | 요청 길이 ±5초 |

---

## 첫 테스트 명령

```
"매거진 최신 기사 1개 보고 60초 숏폼 영상 만들어줘.
오디오북 스타일, 한국어 여성 나레이션, 자막 필수,
잔잔한 피아노 BGM, 16:9 + 9:16 둘 다."
```
