import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_PUBLISHABLE_KEY: 'sb-test-publishable-key',
      SUPABASE_SECRET_KEY: 'sb-test-secret-key',
      UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
      OPENAI_API_KEY: 'sk-test-openai-key',
    },
    coverage: {
      provider: 'v8',
      thresholds: { lines: 30, functions: 30, branches: 25 },
    },
  },
})
