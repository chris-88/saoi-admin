import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  // TEMPORARY: mirrors the branch-badge `define` block in vite.config.ts so any test that
  // renders Providers can resolve them. Remove alongside BuildBadge.
  define: {
    __BUILD_BRANCH__: JSON.stringify('test'),
    __BUILD_SHA__: JSON.stringify('0000000'),
    __BUILD_TIME__: JSON.stringify('2026-10-01T00:00:00.000Z'),
  },
  resolve: {
    alias: {
      '@': resolve('./src'),
      // shadcn generates `import { cn } from "cn"`; keep ui/ identical to upstream.
      cn: resolve('./src/lib/utils.ts'),
      // Copied from chris-88/saoi by `npm run shared:sync`; see scripts/sync-shared.ts.
      '@domain': resolve('./src/shared/domain'),
      '@contracts': resolve('./src/shared/contracts'),
      '@llm': resolve('./src/shared/llm'),
      '@tenants': resolve('./src/shared/tenants'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
})
