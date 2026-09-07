import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // tsconfig가 jsx: 'preserve'(Next 기본)라 vitest 혼자서는 .tsx를 파싱하지 못한다.
  // 컴포넌트 렌더 테스트를 위해 등록 — JSX 없는 기존 .ts 테스트에는 영향이 없다.
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    // agents/ 도 포함한다 — runner↔에이전트의 Promise 계약처럼 agents 모듈을 실제로
    // import 해야 검증되는 테스트가 있다. src 아래 두면 root tsconfig 가 agents 를
    // 프로그램에 끌어들여 agents 의 기존 타입 오류가 typecheck 에서 터진다.
    include: ['src/**/*.test.{ts,tsx}', 'agents/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/types/**/*.ts'],
      exclude: ['src/lib/prisma.ts', 'src/lib/auth.ts', 'src/lib/auth.config.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
