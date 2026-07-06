# iOS CocoaPods 셋업 / 빌드 재현 절차

우나어 iOS 앱은 **CocoaPods** 로 네이티브 의존성을 관리한다(SPM 아님).

## 왜 CocoaPods 인가 (SPM 충돌)

Capacitor 8 기본은 SPM이지만, `@capacitor/app` 와 `@capacitor-firebase/app` 의
node_modules 경로가 **둘 다 `/app` 으로 끝나** SPM 패키지 identity가 `'app'` 으로 충돌한다
(`Conflicting identity for app`). Xcode 26/Swift SPM은 path 마지막 요소로 identity를
계산하므로 회피 불가. → **iOS만 CocoaPods로 전환**(pod 이름이 달라 충돌 없음).
Android/Web 은 영향 없다.

## 신규 클론 / 빌드 재현 절차

```bash
npm i
npx cap sync ios                       # Podfile의 capacitor_pods 블록 재생성
bash scripts/ios-podfile-fix.sh        # analytics subspec 재주입 (아래 참고, idempotent)
cd ios/App && LANG=en_US.UTF-8 pod install
# 시뮬레이터 빌드 (서명 불필요)
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

> `LANG=en_US.UTF-8` 필수 — 미설정 시 CocoaPods(Ruby)가 `Encoding::CompatibilityError` 로 실패한다.

## 고정해 둔 두 가지 (재현성)

1. **`scripts/ios-podfile-fix.sh`** — `@capacitor-firebase/analytics` 의 `default_subspec`
   은 `Lite`(Firebase 미링크)라 기본 Podfile로는 `no such module 'FirebaseCore'` 로 실패한다.
   Podfile의 analytics pod 라인에 `:subspecs => ['AnalyticsWithoutAdIdSupport']`
   (IDFA/ATT 불필요) 를 주입한다. **`npx cap sync ios` 가 `capacitor_pods` 블록을 재생성해
   이 지정을 지우므로, sync 직후 반드시 본 스크립트를 실행한다.** 여러 번 실행해도 중복되지 않는다.

2. **Podfile `post_install` 의 `SWIFT_ENABLE_EXPLICIT_MODULES = NO`** — Xcode 16/26의
   explicitly-built modules가 CocoaPods Firebase 모듈 의존성을 못 찾는 이슈를 회피한다.
   `capacitor_pods` def 밖(post_install)이라 `cap sync` 재생성에도 유지된다.

## Firebase / AdMob 값 (아직 미커밋)

- 앱 실행에는 `GoogleService-Info.plist`(Firebase) 와 Info.plist의 `GADApplicationIdentifier`(AdMob)
  가 필요하다. **실값/더미값 모두 repo에 커밋하지 않는다.**
- 로컬 무료 검증 시에는 형식만 유효한 더미 `GoogleService-Info.plist` + Google 공개 테스트
  GADApplicationIdentifier 를 **빌드 산출물(.app) 에만** 주입해 시뮬레이터에서 확인했다
  (repo 소스 미오염). TestFlight/실기기 단계에서 창업자가 실값으로 교체한다.

## 미해결(후속)

- 딥링크(`CFBundleURLTypes`), ATT 문구, APNs entitlement, 서명(DEVELOPMENT_TEAM) 등은
  Apple Developer 결제 후 별도 단계에서 추가한다.
- `CAPACITOR_DEBUG`(디버그 웹 인스펙터)는 pods 템플릿 기본값대로 미포함. 필요 시 Info.plist 키 +
  Debug 빌드설정 `CAPACITOR_DEBUG=true` 로 복원한다.
