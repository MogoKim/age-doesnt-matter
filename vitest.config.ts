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
    include: ['src/**/*.test.{ts,tsx}'],
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
