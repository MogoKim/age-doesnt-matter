# Cloudflare R2 이미지 저장소 운영 기획서 (I03)

> 최초 작성: 2026-04-27 | 최근 수정: 2026-04-27

---

## 목표

사용자 업로드·AI 생성·크롤링 이미지를 Cloudflare R2에 저장해  
CDN 비용 없이 빠른 이미지 서빙을 제공하고, CSP 정책을 통일한다.

---

## 배경

- Vercel 서버리스에서 이미지 저장 불가 → 외부 스토리지 필수
- AWS S3 대비 무료 egress, Cloudflare CDN 자동 연동
- 에이전트(카드뉴스·매거진·크롤러) + 사용자 업로드 통합 관리

---

## 세부 기획

### 버킷 구조

**버킷명**: `unaeo-uploads`

| 폴더 경로 | 사용처 | 파일 형식 |
|---------|--------|---------|
| `posts/{userId}/{uuid}.webp` | 사용자 게시글 이미지 | WebP (Sharp 변환) |
| `posts/{userId}/{uuid}.{ext}` | 사용자 게시글 영상 | mp4/mov/webm |
| `card-news/{YYYY-MM-DD}/v2-slide-{N}.jpg` | 카드뉴스 v2 슬라이드 | JPEG 85% |
| `card-news/{YYYY-MM-DD}/{source}-slide-{N}.{ext}` | DALL-E/Unsplash 원본 | 원본 포맷 |
| `magazine-thumbnails/{YYYY-MM-DD}/{postId}.jpg` | 매거진 OG 이미지 | JPEG |
| `magazine/{filename}.{ext}` | 매거진 본문 이미지 | 원본 포맷 |
| `banners/{uuid}.{ext}` | 어드민 배너 | 원본 포맷 |
| `scraped/{postKey}/{index}.{ext}` | 크롤링 외부 이미지 | WebP/원본 |

---

### 업로드 방식 2가지

**방식 A: 직접 서버 업로드** (사용자 이미지/영상)

```
클라이언트 FormData
  → POST /api/uploads (이미지) or /api/uploads/video (영상)
  → Sharp WebP 최적화 (이미지만, 4MB 제한)
  → uploadToR2(key, buffer, contentType)
  → { url: "https://{PUBLIC_URL}/posts/..." }
```

**방식 B: Presigned URL** (에디터 인라인, 영상 대용량)

```
클라이언트
  → GET /api/uploads/presign?type=image/jpeg
  → { uploadUrl, publicUrl }
  → PUT uploadUrl (브라우저 → R2 직접)
  → TipTapEditor: /_next/image 프록시로 표시
```

---

### R2 사용 기능 전체 목록

| 기능 | 파일 | 업로드 트리거 |
|------|------|------------|
| 카드뉴스 렌더링 | `agents/cmo/card-news/renderer.ts` | Playwright → Sharp JPEG → R2 |
| 카드뉴스 이미지 | `agents/cmo/card-news/image-gen.ts` | DALL-E/Unsplash → R2 |
| 매거진 썸네일 | `agents/cafe/thumbnail-generator.ts` | Playwright 1200×630 → R2 |
| 매거진 이미지 | `agents/cafe/image-generator.ts` | Unsplash/Gemini/DALL-E → R2 |
| 로컬 이미지 생성 | `agents/cafe/local-image-generator.ts` | Gemini/ChatGPT Playwright → R2 |
| 외부 미디어 파이프라인 | `agents/community/image-pipeline.ts` | 외부 URL → WebP → R2 |
| 사용자 이미지 업로드 | `src/app/api/uploads/route.ts` | FormData → Sharp → R2 |
| 에디터 인라인 이미지 | `src/components/features/community/TipTapEditor.tsx` | Presigned PUT → R2 |

---

### Public URL

```
https://pub-b0ae348768da4b63a66112f4751f5ae5.r2.dev/{key}
```

**next.config.js remotePatterns:**
- `*.r2.cloudflarestorage.com`
- `*.r2.dev`
- `*.r2.cloudflare.com`

---

### 이미지 접근 방식

| 상황 | 방식 | 이유 |
|------|------|------|
| 카드뉴스·썸네일 | 직접 R2 URL | 정적 콘텐츠, CDN 캐시 |
| 에디터 인라인 이미지 | `/_next/image` 프록시 | CSP 정책 통일, WebP 자동 변환 |
| 외부 크롤링 이미지 | R2 재업로드 후 직접 URL | 외부 도메인 CSP 차단 우회 |

---

### 환경변수

| 변수 | 필수 |
|------|------|
| `CLOUDFLARE_ACCOUNT_ID` | 필수 |
| `CLOUDFLARE_R2_ACCESS_KEY` | 필수 |
| `CLOUDFLARE_R2_SECRET_KEY` | 필수 |
| `CLOUDFLARE_R2_BUCKET` | 필수 (`unaeo-uploads`) |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | 필수 (Public URL) |

---

### 파일 업로드 제한

| 타입 | 최대 크기 | Rate Limit |
|------|---------|-----------|
| 이미지 | 4MB (Sharp 1200px 리사이즈) | 10회/분 |
| 영상 | 50MB | 5회/분 |
| Presigned TTL | — | 600초 (10분) |

---

### 비용 영향

| 항목 | 비용 |
|------|------|
| R2 스토리지 | $0.015/GB·월 |
| Egress | **무료** (Cloudflare CDN 포함) |
| API 요청 | 무료 (Class A: 쓰기) / 무료 (Class B: 읽기) |
| **실질 비용** | ~$0.1~0.5/월 (스토리지 용량에 따라) |

---

## 현재 운영 상태

✅ 사용자 이미지/영상 업로드 작동 중  
✅ 카드뉴스 v2 렌더링 R2 저장 작동 중  
✅ 매거진 썸네일/이미지 R2 저장 작동 중  
⚠️ DALL-E 이미지 생성: 의도적 비활성화 (Gemini Playwright 이관, 주석 처리됨)

---

## 관련 링크

- R2 클라이언트: `src/lib/r2.ts`
- 이미지 최적화: `src/lib/image-optimize.ts`
- 업로드 API: `src/app/api/uploads/route.ts`
- 에이전트 R2 사용: `agents/cmo/card-news/renderer.ts`, `agents/cafe/thumbnail-generator.ts`

---

## 수정 히스토리

| 날짜 | 변경 내용 | 이유 |
|------|---------|------|
| 2026-04-27 | Feature 문서 최초 생성 (코드 딥다이브 기반) | Feature Lifecycle 도입 |

---

## 이슈 히스토리

| 날짜 | 증상 | 원인 | 해결 |
|------|------|------|------|
| 2026-04 | 에디터 인라인 이미지 깨짐 | 브라우저에서 R2 직접 요청 실패 | `/_next/image` 프록시 경유로 수정 |
| 진행중 | DALL-E 비활성화 | 비용 절감 + Gemini Playwright 이관 | 긴급 복구 시 image-generator.ts 주석 해제 |
