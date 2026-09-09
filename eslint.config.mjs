// ESLint 9 flat config — Next 16 전환(2026-09-09)에 따라 `.eslintrc.json` 에서 옮겨 왔다.
//
// 왜 옮겼나: Next 16 의 `eslint-config-next` 는 peer 로 eslint >= 9 를 요구하고,
// eslint 9 는 flat config 를 기본으로 쓴다. 또 Next 16 에서 `next lint` 가 제거돼
// package.json 의 lint 스크립트도 eslint CLI 직접 호출로 바꿨다.
//
// **규칙은 그대로 옮겼다.** 이 전환에서 검사를 약화시키지 않는다 —
// no-explicit-any: error, no-unused-vars: error(^_ 예외), e2e 의 raw @playwright/test 금지.

// eslint-config-next 16 은 flat config 를 **직접** 내보낸다. FlatCompat 로 감싸면
// eslintrc 스키마 검증에 걸려 순환 참조 오류가 난다.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    // .eslintrc.json 의 ignorePatterns 를 그대로 옮긴다. 생성물과 격리 코드는 검사하지 않는다.
    ignores: ['src/generated/**', '_quarantine/**', '.next/**', 'node_modules/**', 'outputs/**'],
  },

  ...(Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals]),

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    languageOptions: { parser: tsparser },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    // ── Next 16 과 함께 들어온 **신규** react-hooks 규칙 ──
    //
    // eslint-config-next 16 은 React Compiler 계열 규칙(set-state-in-effect · refs · purity ·
    // preserve-manual-memoization · immutability)을 새로 켠다. 기존 코드에 75건이 걸린다.
    // 이 규칙들은 **이번 전환 때문에 생긴 결함이 아니라, 전에는 검사하지 않던 것**이다.
    //
    // 프레임워크 전환 PR 안에서 React 컴포넌트 동작을 75곳 바꾸는 것은 위험하다 —
    // 전환이 깨진 것인지 리팩터링이 깨진 것인지 구분할 수 없게 된다.
    // 그래서 **끄지 않고 warn 으로 남겨** 목록이 보이게 하고, 정리는 별도 작업으로 넘긴다.
    // 기존 규칙(no-explicit-any · no-unused-vars · e2e import 가드)은 error 그대로다.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },

  {
    // e2e 는 first-party 헤더 fixture 를 반드시 거쳐야 한다.
    // raw `@playwright/test` 를 쓰면 fixture 가 실행되지 않아 GA4·EventLog 가 오염된다.
    files: ['e2e/**/*.ts'],
    ignores: ['e2e/fixtures/first-party-header.ts', 'e2e/export-kakao-cookies.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{
          name: '@playwright/test',
          message: 'e2e/fixtures/first-party-header 에서 test/expect 를 import 하세요. raw @playwright/test 를 쓰면 first-party 헤더 fixture 가 실행되지 않습니다.',
          allowTypeImports: true,
        }],
      }],
    },
  },
]
