import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from '@/app/providers'
import { router } from '@/app/router'
import { initSentry } from '@/lib/sentry'
import {
  checkForUpdates,
  recoverFromStaleDeploy,
  reloadWhenWorkerTakesOver,
} from '@/app/staleDeploy'
import '@/styles/fonts.css'
import '@/index.css'

initSentry()

/*
 * Vite raises this when a dynamic import 404s, which on a static host means one thing: the
 * build this page came from is no longer the build on the server. Reload into the current one.
 */
window.addEventListener('vite:preloadError', (event) => {
  if (recoverFromStaleDeploy()) event.preventDefault()
})

/*
 * The other half of the same problem: the service worker serves a whole cached build, so nothing
 * fails, and the page quietly renders the last version. When the new worker claims the page,
 * reload into it, once no edit screen has changes unsaved or a save in flight.
 */
reloadWhenWorkerTakesOver()

/*
 * An installed console can stay open for days without loading again, so it never repeats the
 * check the `load`-time registration makes. Look again whenever it comes back into view, and
 * hourly.
 */
checkForUpdates()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root is missing from index.html')

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)
