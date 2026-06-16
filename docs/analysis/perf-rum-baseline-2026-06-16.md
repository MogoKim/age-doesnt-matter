# 속도 판정 기준 전환 — RUM/Web Vitals p75 (2026-06-16)

## 결정
**우리 서비스의 속도 판단 1차 기준을 PSI lab 단일 점수 → RUM/Web Vitals p75 (48h 누적, isBot 제외)로 전환한다.**
PSI lab은 참고 지표로만 사용한다.

### 왜 PSI lab을 1차 기준에서 내렸나
- PSI 모바일 lab = **Slow4G(1.6Mbps) + CPU 4x throttle** worst-case 시뮬레이션.
- 이 사이트에서 **단일측정 변동이 ±30점**(예: /community/stories 85→52, /best 76→46, /magazine 73→57 — 코드 변경 없이 측정 회차만 달라짐).
- 같은 페이지를 observed(양호망, CPU 4x)로 재면 LCP 0.47~0.77s인데 PSI lab은 LCP 8~11s로 나옴 → **네트워크 throttle artifact**.
- 결론: lab 점수로 "80 달성" 같은 판정은 노이즈 추격이 된다.

## 현재 RUM baseline (48h, n=253, isBot 제외) — 전 지표 GOOD
| 지표 | 24h p75 | 48h p75 | Web Vitals Good 기준 | 판정 |
|---|---|---|---|---|
| **LCP** | 2044ms | **1948ms** | <2500 | ✅ GOOD |
| **INP** | 160ms | **96ms** | <200 | ✅ GOOD |
| **CLS** | 0.006 | **0.006** | <0.1 | ✅ GOOD |
| **TTFB** | 375ms | **426ms** | <800 | ✅ GOOD |

**→ P1(gtag 지연 로드 f764476) + Vercel syd1 리전 이전(634caf2, DB 동일 리전) + P7(prewarm 확대 + /api/best unstable_cache, 7c951f5) 후 실사용자 속도 1차 목표는 달성으로 본다.**

(참고: 같은 시점 PSI lab은 best 46·magazine 57·community 50~54로 낮으나, 위 RUM이 실사용자 진실이다.)

## 세그먼트별 LCP p75 (48h)
| 구분 | 값 |
|---|---|
| effectiveType 4g | p75 1948ms (3g/2g 샘플 없음) |
| deviceMemory >4GB | p75 1944ms |
| deviceMemory ≤4GB(저사양) | p75 2044ms · **p95 5084ms** |
| uaCategory desktop | 1944 / twa-android **2044·p95 5084** / naver-inapp **2201** / android-chrome 1880 / kakao-android 1180 |

## path별 LCP p75 worst (48h, n≥3)
| path | n | LCP p75 |
|---|---|---|
| /community/life2/(특정 장문 글) | 3 | 3600ms |
| /best | 7 | **2484ms** (목록 worst, Good 경계) |
| / (홈) | 25 | 1608ms ✅ |
| /community/stories | 4 | 1552ms ✅ |

## 향후 최적화 우선순위 (RUM 기준)
lab 점수가 아니라 **RUM에서 p75/p95가 나쁜 path/segment부터** 정한다.
1. /best LCP p75 2484ms (목록 worst)
2. 저사양 ≤4GB · twa-android p95 5084ms (tail) — 공통 번들·서드파티 잔여(AdSense show_ads 118KB) 축소 후보
3. naver-inapp 2201ms (인앱 브라우저)
4. 장문 글 본문 이미지 최적화

## 측정 재현
- 수집: `src/components/common/WebVitalsReporter.tsx` (web-vitals LCP/INP/CLS/TTFB → /api/events, eventName='web_vital', **10% 샘플링**, 서버 isBot 필터)
- properties: `{metric, value, rating, effectiveType, deviceMemory, uaCategory}` + path
- 조회: EventLog where eventName='web_vital' AND isBot=false, JSON properties에서 metric별 percentile + 세그먼트/path 그룹 (Prisma findMany; Prisma 7 = PrismaPg adapter + pg Pool, DATABASE_URL pooler+ssl)
- ⚠️ 10% 샘플링이라 path별 n이 작다(3~25). 정밀도 필요 시 샘플링률 상향 또는 주간 누적 리포트.
