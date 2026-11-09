import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

const resolve = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // GitHub Pages has no rewrites: `/<repo>/` unless a custom domain is configured.
  const raw = env.VITE_BASE_PATH?.trim() || '/'
  const base = raw.endsWith('/') ? raw : `${raw}/`

  return {
    base,
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
    // No service worker: the console is a desk tool, not an installed app.
    plugins: [react(), tailwindcss()],
    build: {
      sourcemap: true,
      target: 'es2023',
    },
    server: {
      // 5173 is saoi-web, so both can run side by side.
      port: 5174,
    },
  }
})
