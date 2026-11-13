import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
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
    plugins: [
      react(),
      tailwindcss(),
      /*
       * Installable, so the console opens from a phone's home screen in its own window
       * (2026-11-13). The rules are saoi-web's, for the same reason: a deploy must reach an
       * installed app without reinstalling it (vault decision 2026-11-12). No push here.
       */
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Saoi admin',
          short_name: 'Saoi admin',
          description: 'The presenter console for Saoi. Sign-in required.',
          lang: 'en-IE',
          // `start_url`/`scope` follow base so the installed app works under /<repo>/ too; the
          // hash is the router's root.
          start_url: `${base}#/`,
          scope: base,
          display: 'standalone',
          // --slate-50 (the page) and --demo-deep (the existing theme-color), from src/index.css.
          background_color: '#F8FAFC',
          theme_color: '#002F32',
          // From scripts/icons/*.svg by scripts/render-icons.sh; the PNGs are committed.
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          // Each deploy renames every hashed file, so without this the precache keeps every
          // build it has ever seen and grows until the browser evicts the lot.
          cleanupOutdatedCaches: true,
          /*
           * Navigations go to the network; the precache is the offline fallback only.
           *
           * The default answers every navigation with the precached `index.html`, cache-first,
           * so an open install never sees a newer shell until a new worker has finished
           * installing while the page is open (saoi-web, 2026-11-12: a phone opened on a build
           * four deploys old). So no `NavigationRoute`, and no `directoryIndex` either, which
           * would let the precache route answer `/` with `index.html` before the navigation
           * rule below is reached. `scripts/check-service-worker.ts` checks the built worker.
           */
          navigateFallback: null,
          directoryIndex: null,
          runtimeCaching: [
            {
              /*
               * `NetworkOnly` with the precached shell behind it, not `NetworkFirst`, which keeps
               * its own copy of the last `index.html` and could serve one from a build whose
               * chunks have since gone (a blank page). The precached shell is always the one
               * whose chunks this worker holds. A slow network is waited for, as it would be
               * with no worker; a failed one (offline) gets the shell at once.
               */
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkOnly',
              options: {
                precacheFallback: { fallbackURL: `${base}index.html` },
              },
            },
            /*
             * Never cache API responses: the console reads live cases, and a cached one is a
             * stale case on screen. `api.saoi.ie` (saoi-api and the self-hosted Supabase behind
             * it) matches no route at all, which means the network, uncached; Realtime is a
             * WebSocket, which a service worker never sees. A hosted Supabase project gets the
             * same answer by name, should the stack ever move.
             */
            {
              urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
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
