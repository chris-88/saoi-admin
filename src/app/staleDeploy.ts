import { reloadWhenSafe } from '@/app/reloadGate'

/**
 * Recovering from a deploy that landed while the app was open.
 *
 * Every build hashes its filenames and GitHub Pages swaps the whole site at once, so the moment
 * a deploy finishes, the chunk names a running page knows are gone from the server. A page that
 * has been open across a deploy — a phone in a pocket, a tab left on a desk — asks for
 * `index-OLD.js` on its next navigation, gets a 404, and the import rejects.
 *
 * That page is not broken, it is stale, and a reload fetches the build that does exist. So we
 * reload. The guard is what makes that safe: if a reload does not fix it, the failure is
 * something else, and the customer gets an honest message instead of a tab that reloads forever.
 */

const ATTEMPTED = 'saoi:stale-reload'

/** Long enough to cover a reload, short enough that a later genuine stale load still recovers. */
const WINDOW_MS = 10_000

/** A chunk that could not be fetched, as each engine words it. */
export function isModuleLoadError(error: unknown): boolean {
  // Only the shapes that actually carry a message: stringifying a bare object gives
  // "[object Object]", which matches nothing and reads like a bug when it turns up in a log.
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : ''

  return (
    /importing a module script failed/i.test(message) || // Safari
    /failed to fetch dynamically imported module/i.test(message) || // Chrome
    /error loading dynamically imported module/i.test(message) || // Firefox
    /unable to preload css/i.test(message)
  )
}

/**
 * Reload, unless we just did.
 *
 * Returns whether a reload was started, so the caller can let the error through when it was not.
 */
export function recoverFromStaleDeploy(): boolean {
  try {
    const last = Number(sessionStorage.getItem(ATTEMPTED) ?? '0')
    if (Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(ATTEMPTED, String(Date.now()))
  } catch {
    // Private browsing, blocked site data. Without somewhere to record the attempt there is
    // nothing stopping a loop, and a loop is worse than the error page.
    return false
  }

  window.location.reload()
  return true
}

/**
 * A new build has taken over, so show it.
 *
 * The preload guard above catches one kind of staleness: a tab that was open across a deploy
 * and reaches for a chunk that no longer exists. It cannot catch the other kind, which is the
 * common one. The service worker precaches the whole shell, so an installed console is served a
 * complete and self-consistent copy of the build it saw last time. Nothing 404s, nothing errors,
 * and the page simply renders yesterday's console on top of today's deploy.
 *
 * `autoUpdate` installs the new worker and claims the page, which fires `controllerchange`.
 * That is the signal that the assets underneath have changed, and a single guarded reload is
 * what turns it into the new build being on screen.
 *
 * The reload waits for anything it would cost the operator (`reloadGate`): unsaved edits on an
 * edit screen, or a save still in flight.
 *
 * Call it once, at start-up. The guard in `recoverFromStaleDeploy` is what stops a worker that
 * claims repeatedly from putting the page in a loop.
 */
export function reloadWhenWorkerTakesOver(options: WorkerTakeover = {}): void {
  const container = options.container ?? serviceWorkers()
  if (container === undefined) return
  const controlled = options.hadController ?? hadController
  const reload = options.reload ?? recoverFromStaleDeploy

  container.addEventListener('controllerchange', () => {
    /*
     * Only when there was already a worker. The first registration on a first visit also fires
     * this, and reloading somebody the instant they arrive is a worse bug than the one being
     * fixed: they asked for the page, they are looking at the page, nothing is stale.
     */
    if (!controlled) return
    reloadWhenSafe(() => void reload())
  })
}

/** The browser, unless a test hands in its own. */
export type WorkerTakeover = {
  readonly container?: ServiceWorkerContainer | undefined
  readonly reload?: (() => unknown) | undefined
  readonly hadController?: boolean | undefined
}

/** How often an open page looks for a new build: an installed app can stay open for days. */
const UPDATE_EVERY_MS = 60 * 60_000

/** The least time between two looks, so flicking between apps does not fetch `sw.js` each time. */
const UPDATE_GAP_MS = 60_000

/** The browser, unless a test hands in its own. */
export type UpdateChecks = {
  readonly container?: ServiceWorkerContainer | undefined
  readonly doc?: Document | undefined
  readonly everyMs?: number | undefined
  readonly gapMs?: number | undefined
}

/**
 * Look for a new build whenever the page comes back into view, and every hour.
 *
 * The worker is registered on `load`, which is also the browser's update check. An installed app
 * brought back from the background is not loaded again, so without this it would run the build
 * it opened on until somebody closed it for good. `registration.update()` fetches `sw.js`; a new
 * one installs, skips waiting, claims the page, and `reloadWhenWorkerTakesOver` reloads into it
 * once that costs the operator nothing.
 *
 * Call it once, at start-up. Returns a function that stops it.
 */
export function checkForUpdates(options: UpdateChecks = {}): () => void {
  const container = options.container ?? serviceWorkers()
  if (container === undefined) return () => undefined
  const doc = options.doc ?? document
  const gapMs = options.gapMs ?? UPDATE_GAP_MS

  // The `load`-time registration has just looked.
  let last = Date.now()
  const check = (): void => {
    if (Date.now() - last < gapMs) return
    last = Date.now()
    // Offline, or the worker script unreachable: nothing to do until the next look.
    container
      .getRegistration()
      .then((registration) => registration?.update())
      .catch(() => undefined)
  }
  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') check()
  }

  doc.addEventListener('visibilitychange', onVisibility)
  const timer = window.setInterval(check, options.everyMs ?? UPDATE_EVERY_MS)
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility)
    window.clearInterval(timer)
  }
}

function serviceWorkers(): ServiceWorkerContainer | undefined {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker
    : undefined
}

/** Whether this page was being served by a worker when it started. */
const hadController = (serviceWorkers()?.controller ?? null) !== null
